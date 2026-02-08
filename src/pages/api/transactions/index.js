/**
 * API Endpoint: POST /api/transactions
 * 
 * Handles transaction syncing from offline clients
 * Receives individual offline transactions and stores them in the database
 */

import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';
import Till from '@/src/models/Till';
import Product from '@/src/models/Product';

export default async function handler(req, res) {
  // Support GET for health check and POST for creating transactions
  if (req.method === 'GET') {
    return res.status(200).json({ 
      success: true, 
      message: 'Transactions endpoint is ready' 
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    });
  }

  try {
    console.log('📤 Transaction received:', req.body);
    
    await mongooseConnect();

    const { 
      items, 
      total, 
      tax = 0, 
      subtotal = 0, 
      tenderType,           // Legacy: single tender
      tenderPayments,       // New: array of split payments [{tenderId, tenderName, amount}]
      amountPaid,
      change,
      staffName: rawStaffName = 'Unknown',
      staffId,
      discount = 0,
      location = 'Default Location',
      device,
      tableName,
      customerName,
      createdAt,
      status = 'completed',
      tillId, // Till session ID
      externalId
    } = req.body;
    
    // Normalize staff name - never use 'Unknown' if we can avoid it
    const staffName = rawStaffName && rawStaffName !== 'Unknown' ? rawStaffName : 'POS Staff';
    
    // Determine which payment method is being used
    const hasMultiplePayments = tenderPayments && Array.isArray(tenderPayments) && tenderPayments.length > 0;
    const hasSingleTender = tenderType && !hasMultiplePayments;
    const isHeldTransaction = status === 'held'; // Held transactions don't require payment info
    
    console.log(`📦 Processing transaction - till: ${tillId}, amount: ${total}, status: ${status}`);
    if (hasMultiplePayments) {
      console.log(`   Multiple payments: ${tenderPayments.map(tp => `${tp.tenderName}:${tp.amount}`).join(', ')}`);
    } else if (hasSingleTender) {
      console.log(`   Single tender: ${tenderType}`);
    } else if (isHeldTransaction) {
      console.log(`   Held transaction - no payment yet`);
    }

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error('❌ Invalid transaction: items array required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: items array required',
      });
    }

    // For held transactions, payment info is not required. For other statuses, it is.
    if (total === undefined || (!isHeldTransaction && !hasSingleTender && !hasMultiplePayments)) {
      console.error('❌ Invalid transaction: total and (tenderType or tenderPayments) required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: total and (tenderType or tenderPayments) required',
      });
    }

    // DUPLICATE PREVENTION: Check if this transaction already exists
    // Based on createdAt timestamp, total, tillId, and location
    if (externalId) {
      const existingTransaction = await Transaction.findOne({ externalId });
      if (existingTransaction) {
        console.log(`âš ï¸ Duplicate transaction detected - externalId ${externalId}`);
        return res.status(200).json({
          success: true,
          message: 'Transaction already exists (duplicate prevented)',
          transactionId: existingTransaction._id,
          duplicate: true
        });
      }
    } else if (createdAt && tillId) {
      const existingTransaction = await Transaction.findOne({
        createdAt: new Date(createdAt),
        total: total,
        tillId: new (require('mongoose')).Types.ObjectId(tillId),
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

    // Map items to schema format (qty, salePriceIncTax)
    const mappedItems = items.map(item => ({
      productId: item.productId,
      name: item.name,
      salePriceIncTax: item.price,
      qty: item.quantity,
    }));

    // Create transaction record in database
    const transaction = new Transaction({
      ...(externalId && { externalId }),
      // Payment method: can be single (legacy) or multiple (split)
      ...(hasSingleTender && { tenderType }),
      ...(hasMultiplePayments && { tenderPayments }),
      
      amountPaid: amountPaid || total,
      total: total,
      staff: staffId || null,
      staffName: staffName || 'Unknown', // Store staff name for quick lookup
      location: location,
      device: device,
      tableName: tableName,
      discount: discount || 0,
      customerName: customerName,
      status: status,
      change: change || 0,
      items: mappedItems,
      transactionType: 'pos',
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      tillId: tillId ? new (require('mongoose')).Types.ObjectId(tillId) : null,
    });

    // Save to database
    const savedTransaction = await transaction.save();
    
    console.log('✅ Transaction saved:', savedTransaction._id);

    // Link transaction to till if provided
    if (tillId) {
      try {
        console.log(`🔍 Looking for till: ${tillId}`);
        const till = await Till.findById(tillId);
        
        if (till) {
          console.log(`💳 Found till! Linking transaction ${savedTransaction._id} to till ${tillId}`);
          console.log(`   Till Status: ${till.status}`);
          console.log(`   Till Current Sales: ${till.totalSales}`);
          console.log(`   Transaction amount: ${total}`);
          
          till.transactions.push(savedTransaction._id);
          till.totalSales = (till.totalSales || 0) + total;
          // DO NOT manually increment transactionCount - it should always equal transactions.length
          till.transactionCount = till.transactions.length;
          
          // Ensure tenderBreakdown is initialized
          if (!till.tenderBreakdown) {
            console.log(`   Initializing tenderBreakdown as Map`);
            till.tenderBreakdown = new Map();
          }
          
          // Update tender breakdown based on payment method
          if (hasMultiplePayments) {
            // Handle split payments - add amount to each tender
            console.log(`   Processing ${tenderPayments.length} split payments:`);
            tenderPayments.forEach(payment => {
              const currentAmount = till.tenderBreakdown.get(payment.tenderName) || 0;
              console.log(`      ${payment.tenderName}: +${payment.amount} (was ${currentAmount})`);
              till.tenderBreakdown.set(payment.tenderName, currentAmount + payment.amount);
            });
          } else {
            // Handle single tender (legacy)
            const tenderKey = tenderType || 'CASH';
            const currentAmount = till.tenderBreakdown.get(tenderKey) || 0;
            console.log(`   Setting ${tenderKey} from ${currentAmount} to ${currentAmount + total}`);
            till.tenderBreakdown.set(tenderKey, currentAmount + total);
          }
          
          // Mark the field as modified so Mongoose knows to save it
          till.markModified('tenderBreakdown');
          
          const savedTill = await till.save();
          console.log(`   ✅ Till saved successfully!`);
          console.log(`   ✅ Till updated - Total sales now: ${savedTill.totalSales}`);
        } else {
          console.warn(`⚠️ Till ${tillId} not found in database!`);
        }
      } catch (tillErr) {
        console.warn('⚠️ Failed to link transaction to till:', tillErr.message);
        console.error('   Error details:', tillErr);
        // Don't fail the transaction if till link fails
      }
    } else {
      console.log('ℹ️ No till ID provided, transaction not linked to any till');
    }
    // Update product quantities after successful transaction save (idempotent)
    if (!savedTransaction.inventoryUpdated && savedTransaction.status === 'completed') {
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
        savedTransaction.inventoryUpdated = true;
        await savedTransaction.save();
      } catch (updateErr) {
        console.warn('⚠️ Failed to update product quantities:', updateErr.message);
        // Don't fail the transaction if quantity update fails
      }
    }
    return res.status(201).json({
      success: true,
      message: 'Transaction saved successfully',
      data: {
        id: savedTransaction._id,
        total: savedTransaction.total
      }
    });

  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.externalId) {
      console.warn('⚠️ Duplicate transaction insert blocked by unique index:', error.keyValue?.externalId);
      return res.status(200).json({
        success: true,
        message: 'Transaction already exists (duplicate prevented)',
        duplicate: true,
      });
    }
    console.error('❌ Error saving transaction:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to save transaction',
      message: error.message
    });
  }
}


