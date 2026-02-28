/**
 * Transaction Sync Endpoint
 * 
 * Receives offline transactions from client and stores them in database
 * Called during auto-sync when client comes back online
 */

import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';
import Till from '@/src/models/Till';
import Product from '@/src/models/Product';

const normalizeLocationName = (location) => {
  if (typeof location === 'string' && location.trim()) return location.trim();
  if (location && typeof location === 'object') {
    if (typeof location.name === 'string' && location.name.trim()) return location.name.trim();
    if (typeof location.code === 'string' && location.code.trim()) return location.code.trim();
  }
  return 'Main Store';
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await mongooseConnect();
    console.log('ðŸ“¤ Transaction sync request received:', req.body);

    const { 
      id, 
      items, 
      total, 
      tax, 
      subtotal, 
      tenderType,           // Legacy: single tender
      tenderPayments,       // New: split payments [{tenderId, tenderName, amount}]
      discount = 0,
      amountPaid,
      change,
      staffName, 
      staffId,
      location = 'Default Location',
      status = 'completed',
      createdAt, 
      completedAt,
      tillId,               // Till ID to link transaction
      externalId
    } = req.body;

    // Determine which payment method is being used
    const hasMultiplePayments = tenderPayments && Array.isArray(tenderPayments) && tenderPayments.length > 0;
    const hasSingleTender = tenderType && !hasMultiplePayments;
    const rawStatus = String(status || 'completed').trim().toLowerCase();
    const normalizedStatus = rawStatus === 'complete' ? 'completed' : rawStatus;
    const isHeldTransaction = normalizedStatus === 'held';
    const isCompletedTransaction = normalizedStatus === 'completed';
    const normalizedLocation = normalizeLocationName(location);

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: items array required',
      });
    }

    if (total === undefined || (!isHeldTransaction && !hasSingleTender && !hasMultiplePayments)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: total and (tenderType or tenderPayments) required',
      });
    }

    // DUPLICATE PREVENTION: Check if this transaction already exists
    // Based on createdAt timestamp, total, tillId, and staffName
    if (externalId) {
      const existingTransaction = await Transaction.findOne({ externalId });
      if (existingTransaction) {
        console.log(`Ã¢Å¡Â Ã¯Â¸Â Duplicate sync transaction detected - externalId ${externalId}`);
        return res.status(200).json({
          success: true,
          message: 'Transaction already exists (duplicate prevented)',
          transactionId: existingTransaction._id,
          duplicate: true
        });
      }
    } else if (createdAt && tillId) {
      const mongoose = require('mongoose');
      const existingTransaction = await Transaction.findOne({
        createdAt: new Date(createdAt),
        total: total,
        tillId: new mongoose.Types.ObjectId(tillId),
        staffName: staffName || 'Unknown'
      });
      
      if (existingTransaction) {
        console.log(`âš ï¸ Duplicate sync transaction detected - already exists as ${existingTransaction._id}`);
        return res.status(200).json({
          success: true,
          message: 'Transaction already exists (duplicate prevented)',
          transactionId: existingTransaction._id,
          duplicate: true
        });
      }
    }

    const mappedItems = (items || []).map(item => ({
      productId: item.productId || item.id,
      name: item.name,
      salePriceIncTax: item.price || item.salePriceIncTax || 0,
      qty: item.quantity || item.qty || 0,
    }));

    // Create transaction record - support both payment methods
    const transaction = new Transaction({
      externalId: externalId || id,
      items: mappedItems,
      subtotal: subtotal || 0,
      tax: tax || 0,
      discount: discount || 0,
      total,
      ...(hasSingleTender && { tenderType }),
      ...(hasMultiplePayments && { tenderPayments }),
      amountPaid: amountPaid || total,
      change: Number(change || 0),
      ...(staffId && { staff: staffId }),
      staffName: staffName && staffName !== 'Unknown' ? staffName : 'POS Staff',
      location: normalizedLocation,
      status: normalizedStatus,
      ...(tillId && { tillId }),
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      syncedFrom: 'offline',
      syncedAt: new Date(),
    });

    await transaction.save();
    console.log('âœ… Transaction synced successfully:', transaction._id);

    // Link transaction to till only for completed sales
    if (tillId && isCompletedTransaction) {
      try {
        console.log(`ðŸ”— Linking synced transaction to till: ${tillId}`);
        const till = await Till.findById(tillId);

        if (till) {
          if (!till.transactions.some((txId) => String(txId) === String(transaction._id))) {
            till.transactions.push(transaction._id);
          }
          till.totalSales = (till.totalSales || 0) + Number(total || 0);
          till.transactionCount = till.transactions.length;

          if (!(till.tenderBreakdown instanceof Map)) {
            till.tenderBreakdown = new Map(Object.entries(till.tenderBreakdown || {}));
          }

          if (hasMultiplePayments) {
            tenderPayments.forEach((payment) => {
              const currentAmount = till.tenderBreakdown.get(payment.tenderName) || 0;
              till.tenderBreakdown.set(payment.tenderName, currentAmount + Number(payment.amount || 0));
            });
          } else {
            const tenderKey = tenderType || 'CASH';
            const currentAmount = till.tenderBreakdown.get(tenderKey) || 0;
            till.tenderBreakdown.set(tenderKey, currentAmount + Number(total || 0));
          }
          till.markModified('tenderBreakdown');
          await till.save();
          console.log(`âœ… Synced transaction linked to till - Till now has ${till.transactions.length} transactions, total sales: ${till.totalSales}`);
        } else {
          console.warn(`âš ï¸ Till ${tillId} not found - synced transaction not linked`);
        }
      } catch (linkError) {
        console.error(`âŒ Error linking synced transaction to till:`, linkError);
      }
    } else if (tillId && !isCompletedTransaction) {
      console.log(`â„¹ï¸ Skipping till totals update for non-completed transaction status: ${normalizedStatus}`);
    }
    // Update product quantities after successful transaction sync (idempotent)
    if (!transaction.inventoryUpdated && isCompletedTransaction) {
      try {
        console.log('ðŸ“¦ Updating product quantities for synced items:', mappedItems);
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
        transaction.inventoryUpdated = true;
        await transaction.save();
      } catch (quantityErr) {
        console.warn('âš ï¸ Warning: Failed to update product quantities from sync:', quantityErr.message);
        // Don't fail the transaction if quantity update fails
      }
    }
    return res.status(200).json({
      success: true,
      message: 'Transaction synced successfully',
      transactionId: transaction._id,
      externalId: externalId || id,
    });
  } catch (err) {
    if (err?.code === 11000 && (err?.keyPattern?.externalId || err?.keyPattern?.dedupeKey)) {
      console.warn('âš ï¸ Duplicate sync insert blocked by unique index:', err.keyValue?.externalId || err.keyValue?.dedupeKey);
      return res.status(200).json({
        success: true,
        message: 'Transaction already exists (duplicate prevented)',
        duplicate: true,
      });
    }
    console.error('âŒ Transaction sync error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync transaction',
      error: err.message,
    });
  }
}




