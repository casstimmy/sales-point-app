/**
 * Transaction Sync Endpoint
 * 
 * Receives offline transactions from client and stores them in database
 * Called during auto-sync when client comes back online
 */

import { mongooseConnect } from '../../../lib/mongoose';
import { Transaction } from '../../../models/Transactions';
import Till from '../../../models/Till';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await mongooseConnect();
    console.log('📤 Transaction sync request received:', req.body);

    const { 
      id, 
      items, 
      total, 
      tax, 
      subtotal, 
      tenderType,           // Legacy: single tender
      tenderPayments,       // New: split payments [{tenderId, tenderName, amount}]
      staffName, 
      createdAt, 
      completedAt,
      tillId                // Till ID to link transaction
    } = req.body;

    // Determine which payment method is being used
    const hasMultiplePayments = tenderPayments && Array.isArray(tenderPayments) && tenderPayments.length > 0;
    const hasSingleTender = tenderType && !hasMultiplePayments;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: items array required',
      });
    }

    if (total === undefined || (!hasSingleTender && !hasMultiplePayments)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: total and (tenderType or tenderPayments) required',
      });
    }

    // Create transaction record - support both payment methods
    const transaction = new Transaction({
      externalId: id,
      items,
      subtotal: subtotal || 0,
      tax: tax || 0,
      total,
      ...(hasSingleTender && { tenderType }),
      ...(hasMultiplePayments && { tenderPayments }),
      staffName: staffName || 'Unknown',
      ...(tillId && { tillId }),
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      syncedFrom: 'offline',
      syncedAt: new Date(),
    });

    await transaction.save();
    console.log('✅ Transaction synced successfully:', transaction._id);

    // Link transaction to till if tillId provided
    if (tillId) {
      try {
        console.log(`🔗 Linking synced transaction to till: ${tillId}`);
        const updateResult = await Till.findByIdAndUpdate(
          tillId,
          {
            $addToSet: { transactions: transaction._id },
            $inc: { transactionCount: 1 }
          },
          { new: true }
        );
        
        if (updateResult) {
          console.log(`✅ Synced transaction linked to till - Till now has ${updateResult.transactions.length} transactions`);
        } else {
          console.warn(`⚠️ Till ${tillId} not found - synced transaction not linked`);
        }
      } catch (linkError) {
        console.error(`❌ Error linking synced transaction to till:`, linkError);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Transaction synced successfully',
      transactionId: transaction._id,
      externalId: id,
    });
  } catch (err) {
    console.error('❌ Transaction sync error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync transaction',
      error: err.message,
    });
  }
}
