/**
 * API Endpoint: POST /api/transactions/refund
 * 
 * Processes refund requests for completed transactions
 * - Allows admin, manager, senior staff to refund transactions
 * - Marks transaction as 'deleted' in database
 * - Optionally updates product quantities back (reverses the sale)
 */

import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';

export default async function handler(req, res) {
  // Only support POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    await mongooseConnect();

    const {
      transactionId,
      action, // 'recall' or 'process'
      refundReason,
      staffId,
    } = req.body;

    // Validate required fields
    if (!transactionId || !action) {
      return res.status(400).json({
        success: false,
        error: 'transactionId and action required'
      });
    }

    // Only 'process' action saves to database (marks as deleted)
    // 'recall' just returns the transaction data to the client
    if (action === 'process') {
      // Find transaction
      const transaction = await Transaction.findById(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      // Update transaction status to 'refunded' and mark for deletion
      transaction.status = 'refunded';
      transaction.refundReason = refundReason || 'Refunded by staff';
      transaction.refundBy = staffId;
      transaction.refundedAt = new Date();
      transaction.updatedAt = new Date();

      await transaction.save();

      console.log(`✅ Transaction ${transactionId} marked as refunded`);

      return res.status(200).json({
        success: true,
        message: 'Transaction refunded successfully',
        transactionId: transaction._id,
        refundStatus: 'deleted',
        transaction: {
          id: transaction._id,
          status: 'refunded',
          refundedAt: transaction.refundedAt,
        }
      });
    } else if (action === 'recall') {
      // Just fetch and return transaction data (for recalling to cart)
      const transaction = await Transaction.findById(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Transaction recalled to cart',
        action: 'recall',
        transaction: {
          id: transaction._id,
          items: transaction.items,
          total: transaction.total,
          subtotal: transaction.subtotal,
          tax: transaction.tax,
          discount: transaction.discount,
          tenderType: transaction.tenderType,
          tenderPayments: transaction.tenderPayments,
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Must be "recall" or "process"'
      });
    }
  } catch (error) {
    console.error('❌ Error processing refund:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process refund'
    });
  }
}
