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
import crypto from 'crypto';

const normalizeLocationName = (location) => {
  if (typeof location === 'string' && location.trim()) return location.trim();
  if (location && typeof location === 'object') {
    if (typeof location.name === 'string' && location.name.trim()) return location.name.trim();
    if (typeof location.code === 'string' && location.code.trim()) return location.code.trim();
  }
  return 'Main Store';
};

export default async function handler(req, res) {
  // Only POST method allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    });
  }

  try {
    console.log('ðŸ’¾ Direct transaction save request received');
    
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
      sessionId,
      externalId
    } = req.body;
    
    // Normalize staff name and location for legacy/offline payloads
    const finalStaffName = staffName && staffName !== 'Unknown' ? staffName : 'POS Staff';
    const normalizedLocation = normalizeLocationName(location);
    
    console.log(`ðŸ’° Processing direct transaction - amount: ${total}, till: ${tillId}`);

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error('âŒ Validation error: items array required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: items array required',
      });
    }

    if (total === undefined) {
      console.error('âŒ Validation error: total required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: total required',
      });
    }

    // Validate payment method
    const hasMultiplePayments = tenderPayments && Array.isArray(tenderPayments) && tenderPayments.length > 0;
    const hasSingleTender = tenderType && !hasMultiplePayments;
    const rawStatus = String(status || 'completed').trim().toLowerCase();
    const normalizedStatus = rawStatus === 'complete' ? 'completed' : rawStatus;
    const isHeldTransaction = normalizedStatus === 'held';
    const isCompletedTransaction = normalizedStatus === 'completed';

    if (!isHeldTransaction && !hasSingleTender && !hasMultiplePayments) {
      console.error('âŒ Validation error: payment method required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: tenderType or tenderPayments required',
      });
    }

    const buildDedupeKey = () => {
      const createdAtStamp = createdAt ? new Date(createdAt) : new Date();
      const roundedCreatedAt = new Date(Math.floor(createdAtStamp.getTime() / 1000) * 1000).toISOString();
      const normalizedItems = (items || []).map((item) => ({
        productId: String(item.productId || item.id || ''),
        name: item.name || '',
        qty: Number(item.quantity || item.qty || 0),
        price: Number(item.price || item.salePriceIncTax || 0),
      }));
      const normalizedPayments = (tenderPayments || [])
        .map((p) => ({
          tenderId: String(p.tenderId || ''),
          tenderName: p.tenderName || '',
          amount: Number(p.amount || 0),
        }))
        .sort((a, b) => (a.tenderName + a.tenderId).localeCompare(b.tenderName + b.tenderId));
      const base = {
        items: normalizedItems,
        total: Number(total || 0),
        amountPaid: Number(amountPaid || total || 0),
        change: Number(change || 0),
        tenderType: hasMultiplePayments ? null : (tenderType || null),
        tenderPayments: normalizedPayments,
        staffId: staffId ? String(staffId) : null,
        location: normalizedLocation || null,
        tillId: tillId ? String(tillId) : null,
        createdAt: roundedCreatedAt,
        status: normalizedStatus,
      };
      return crypto.createHash('sha1').update(JSON.stringify(base)).digest('hex');
    };

    const dedupeKey = externalId || buildDedupeKey();

    // DUPLICATE PREVENTION: Check if this transaction already exists
    if (externalId) {
      const existingTransaction = await Transaction.findOne({ externalId });
      if (existingTransaction) {
        console.log(`Ã¢Å¡Â Ã¯Â¸Â Duplicate transaction detected - externalId ${externalId}`);
        return res.status(200).json({
          success: true,
          message: 'Transaction already exists (duplicate prevented)',
          transactionId: existingTransaction._id,
          duplicate: true
        });
      }
    } else {
      const existingByKey = await Transaction.findOne({ dedupeKey });
      if (existingByKey) {
        console.log(`Ã¢Å¡Â Ã¯Â¸Â Duplicate transaction detected - dedupeKey ${dedupeKey}`);
        return res.status(200).json({
          success: true,
          message: 'Transaction already exists (duplicate prevented)',
          transactionId: existingByKey._id,
          duplicate: true
        });
      }
    }

    if (!externalId && createdAt && tillId) {
      const mongoose = require('mongoose');
      const existingTransaction = await Transaction.findOne({
        createdAt: new Date(createdAt),
        total: total,
        tillId: new mongoose.Types.ObjectId(tillId),
        location: normalizedLocation
      });
      
      if (existingTransaction) {
        console.log(`âš ï¸ Duplicate transaction detected - already exists as ${existingTransaction._id}`);
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
      ...(externalId && { externalId }),
      dedupeKey,
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
      location: normalizedLocation,
      device: device || 'web',
      status: normalizedStatus,
      
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
    
    console.log(`âœ… Transaction saved successfully - ID: ${savedTransaction._id}, Amount: ${total}`);

    // Link transaction to till only for completed sales
    if (tillId && isCompletedTransaction) {
      try {
        console.log(`ðŸ”— Linking transaction to till: ${tillId}`);
        
        // First, get the current till to update tenderBreakdown
        const currentTill = await Till.findById(tillId);
        
        if (currentTill) {
          // Initialize tenderBreakdown if needed
          if (!(currentTill.tenderBreakdown instanceof Map)) {
            currentTill.tenderBreakdown = new Map(Object.entries(currentTill.tenderBreakdown || {}));
          }
          
          // Update tender breakdown based on payment method
          if (hasMultiplePayments) {
            // Handle split payments - add amount to each tender
            console.log(`   Processing ${tenderPayments.length} split payments for tender breakdown`);
            tenderPayments.forEach(payment => {
              const currentAmount = currentTill.tenderBreakdown.get(payment.tenderName) || 0;
              currentTill.tenderBreakdown.set(payment.tenderName, currentAmount + Number(payment.amount || 0));
              console.log(`   ðŸ’³ ${payment.tenderName}: +â‚¦${payment.amount} (now â‚¦${currentAmount + Number(payment.amount || 0)})`);
            });
          } else if (hasSingleTender) {
            // Handle single tender (legacy)
            const tenderKey = tenderType || 'CASH';
            const currentAmount = currentTill.tenderBreakdown.get(tenderKey) || 0;
            currentTill.tenderBreakdown.set(tenderKey, currentAmount + Number(total || 0));
            console.log(`   ðŸ’³ ${tenderKey}: +â‚¦${total} (now â‚¦${currentAmount + Number(total || 0)})`);
          }
          
          // Add transaction to array and update counts
          if (!currentTill.transactions.includes(savedTransaction._id)) {
            currentTill.transactions.push(savedTransaction._id);
          }
          currentTill.totalSales = (currentTill.totalSales || 0) + Number(total || 0);
          // DO NOT manually increment transactionCount - it should always equal transactions.length
          currentTill.transactionCount = currentTill.transactions.length;
          
          // Mark tenderBreakdown as modified so Mongoose saves it
          currentTill.markModified('tenderBreakdown');
          
          await currentTill.save();
          console.log(`âœ… Till updated - Total sales: â‚¦${currentTill.totalSales}, Transactions: ${currentTill.transactions.length}`);
        } else {
          console.warn(`âš ï¸ Till ${tillId} not found - transaction not linked`);
        }
      } catch (linkError) {
        console.error(`âŒ Error linking transaction to till:`, linkError);
        // Don't fail the whole request if linking fails - transaction is still saved
      }
    } else if (tillId && !isCompletedTransaction) {
      console.log(`â„¹ï¸ Skipping till totals update for non-completed transaction status: ${normalizedStatus}`);
    } else {
      console.warn(`âš ï¸ No tillId provided - transaction will not be linked to till`);
    }
    // Update product quantities after successful transaction save (idempotent)
    if (!savedTransaction.inventoryUpdated && isCompletedTransaction) {
      try {
        console.log('ðŸ“¦ Updating product quantities for items:', mappedItems);
        for (const item of mappedItems) {
          if (!item.productId || !item.qty) continue;
          const productResult = await Product.findByIdAndUpdate(
            item.productId,
            { $inc: { quantity: -item.qty } },
            { new: true }
          );
          if (productResult) {
            console.log(`âœ… Updated ${item.name}: sold ${item.qty}, remaining ${productResult.quantity}`);
          }
        }
        savedTransaction.inventoryUpdated = true;
        await savedTransaction.save();
      } catch (quantityErr) {
        console.warn('âš ï¸ Warning: Failed to update product quantities:', quantityErr.message);
        // Don't fail the transaction if quantity update fails
      }
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
    if (error?.code === 11000 && (error?.keyPattern?.externalId || error?.keyPattern?.dedupeKey)) {
      console.warn('âš ï¸ Duplicate transaction insert blocked by unique index:', error.keyValue?.externalId || error.keyValue?.dedupeKey);
      return res.status(200).json({
        success: true,
        message: 'Transaction already exists (duplicate prevented)',
        duplicate: true,
      });
    }
    console.error('âŒ Direct save error:', error);

    // Return 500 so client knows to fallback to offline queue
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save transaction',
      message: 'Server error - transaction will be queued for sync',
      fallbackToQueue: true // Signal to client to queue this transaction
    });
  }
}




