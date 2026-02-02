/**
 * API Endpoint: POST /api/transactions/save
 * 
 * Direct transaction save endpoint for online clients
 * Receives transaction data and saves directly to MongoDB
 * Falls back to sync if response fails on client side
 */

import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';
import Till from '@/src/models/Till';
import Product from '@/src/models/Product';

export default async function handler(req, res) {
  // Only POST method allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    });
  }

  try {
    console.log('💾 Direct transaction save request received');
    
    await mongooseConnect();

    const { 
      items, 
      total, 
      tax = 0, 
      subtotal = 0, 
      tenderType,
      tenderPayments,
      amountPaid,
      change,
      staffName = 'Unknown',
      staffId,
      discount = 0,
      location = 'Default Location',
      device,
      tableName,
      customerName,
      createdAt,
      status = 'completed',
      tillId,
      sessionId
    } = req.body;
    
    // Normalize staff name - don't leave it as 'Unknown'
    const finalStaffName = staffName && staffName !== 'Unknown' ? staffName : 'POS Staff';
    
    console.log(`💰 Processing direct transaction - amount: ${total}, till: ${tillId}`);

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error('❌ Validation error: items array required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: items array required',
      });
    }

    if (total === undefined) {
      console.error('❌ Validation error: total required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: total required',
      });
    }

    // Validate payment method
    const hasMultiplePayments = tenderPayments && Array.isArray(tenderPayments) && tenderPayments.length > 0;
    const hasSingleTender = tenderType && !hasMultiplePayments;

    if (!hasSingleTender && !hasMultiplePayments) {
      console.error('❌ Validation error: payment method required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: tenderType or tenderPayments required',
      });
    }

    // DUPLICATE PREVENTION: Check if this transaction already exists
    // Based on createdAt timestamp, total, tillId, and location
    if (createdAt && tillId) {
      const mongoose = require('mongoose');
      const existingTransaction = await Transaction.findOne({
        createdAt: new Date(createdAt),
        total: total,
        tillId: new mongoose.Types.ObjectId(tillId),
        location: location
      });
      
      if (existingTransaction) {
        console.log(`⚠️ Duplicate transaction detected - already exists as ${existingTransaction._id}`);
        return res.status(200).json({
          success: true,
          message: 'Transaction already exists (duplicate prevented)',
          transactionId: existingTransaction._id,
          duplicate: true
        });
      }
    }

    // Map items to schema format
    const mappedItems = items.map(item => ({
      productId: item.productId || item.id,
      name: item.name,
      salePriceIncTax: item.price || item.salePriceIncTax,
      qty: item.quantity || item.qty,
    }));

    // Create transaction record
    const transaction = new Transaction({
      ...(hasSingleTender && { tenderType }),
      ...(hasMultiplePayments && { tenderPayments }),
      
      amountPaid: amountPaid || total,
      total: total,
      subtotal: subtotal || total - tax,
      tax: tax,
      discount: discount || 0,
      
      items: mappedItems,
      
      staff: staffId || null,
      staffName: finalStaffName, // Use normalized staff name
      location: location || 'Default Location',
      device: device || 'web',
      status: status || 'completed',
      
      ...(tableName && { tableName }),
      ...(customerName && { customerName }),
      ...(tillId && { tillId }),
      ...(sessionId && { sessionId }),
      
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      syncedAt: new Date(),
      source: 'direct-online-save', // Track that this came from direct send
    });

    // Save to database
    const savedTransaction = await transaction.save();
    
    console.log(`✅ Transaction saved successfully - ID: ${savedTransaction._id}, Amount: ${total}`);

    // Link transaction to till if tillId provided
    if (tillId) {
      try {
        console.log(`🔗 Linking transaction to till: ${tillId}`);
        
        // First, get the current till to update tenderBreakdown
        const currentTill = await Till.findById(tillId);
        
        if (currentTill) {
          // Initialize tenderBreakdown if needed
          if (!currentTill.tenderBreakdown) {
            currentTill.tenderBreakdown = new Map();
          }
          
          // Update tender breakdown based on payment method
          if (hasMultiplePayments) {
            // Handle split payments - add amount to each tender
            console.log(`   Processing ${tenderPayments.length} split payments for tender breakdown`);
            tenderPayments.forEach(payment => {
              const currentAmount = currentTill.tenderBreakdown.get(payment.tenderName) || 0;
              currentTill.tenderBreakdown.set(payment.tenderName, currentAmount + payment.amount);
              console.log(`   💳 ${payment.tenderName}: +₦${payment.amount} (now ₦${currentAmount + payment.amount})`);
            });
          } else if (hasSingleTender) {
            // Handle single tender (legacy)
            const tenderKey = tenderType || 'CASH';
            const currentAmount = currentTill.tenderBreakdown.get(tenderKey) || 0;
            currentTill.tenderBreakdown.set(tenderKey, currentAmount + total);
            console.log(`   💳 ${tenderKey}: +₦${total} (now ₦${currentAmount + total})`);
          }
          
          // Add transaction to array and update counts
          if (!currentTill.transactions.includes(savedTransaction._id)) {
            currentTill.transactions.push(savedTransaction._id);
          }
          currentTill.totalSales = (currentTill.totalSales || 0) + total;
          // DO NOT manually increment transactionCount - it should always equal transactions.length
          currentTill.transactionCount = currentTill.transactions.length;
          
          // Mark tenderBreakdown as modified so Mongoose saves it
          currentTill.markModified('tenderBreakdown');
          
          await currentTill.save();
          console.log(`✅ Till updated - Total sales: ₦${currentTill.totalSales}, Transactions: ${currentTill.transactions.length}`);
        } else {
          console.warn(`⚠️ Till ${tillId} not found - transaction not linked`);
        }
      } catch (linkError) {
        console.error(`❌ Error linking transaction to till:`, linkError);
        // Don't fail the whole request if linking fails - transaction is still saved
      }
    } else {
      console.warn(`⚠️ No tillId provided - transaction will not be linked to till`);
    }

    // Update product quantities after successful transaction save
    try {
      console.log('📦 Updating product quantities for items:', mappedItems);
      for (const item of mappedItems) {
        if (!item.productId || !item.qty) continue;
        const productResult = await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: -item.qty } },
          { new: true }
        );
        if (productResult) {
          console.log(`✅ Updated ${item.name}: sold ${item.qty}, remaining ${productResult.quantity}`);
        }
      }
    } catch (quantityErr) {
      console.warn('⚠️ Warning: Failed to update product quantities:', quantityErr.message);
      // Don't fail the transaction if quantity update fails
    }

    return res.status(200).json({
      success: true,
      transactionId: savedTransaction._id,
      message: 'Transaction saved successfully',
      transaction: {
        id: savedTransaction._id,
        total: savedTransaction.total,
        status: savedTransaction.status,
        createdAt: savedTransaction.createdAt,
      }
    });

  } catch (error) {
    console.error('❌ Direct save error:', error);
    
    // Return 500 so client knows to fallback to offline queue
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save transaction',
      message: 'Server error - transaction will be queued for sync',
      fallbackToQueue: true // Signal to client to queue this transaction
    });
  }
}
