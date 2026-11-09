/**
 * API Endpoint: POST /api/transactions/refund
 * 
 * Processes refund requests for completed transactions
 * - Allows admin, manager, senior staff to refund transactions
 * - Marks transaction as refunded (subStatus: void) in database
 * - Optionally updates product quantities back (reverses the sale)
 */

import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';
import { sanitizeBody } from '@/src/lib/apiValidation';
import { releaseRoomsFromTransaction } from '@/src/lib/roomAvailability';
import { requireSessionStaff } from '@/src/lib/staffSession';
import { restockSaleInventoryOnce, unlinkTransactionFromTill } from '@/src/lib/tillLedger';

export default async function handler(req, res) {
  // Only support POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  req.body = sanitizeBody(req.body);

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
      const staff = await requireSessionStaff(req, res, 'refundAccess');
      if (!staff) return;

      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      const previousStatus = transaction.status;

      // Claim the refund atomically so a double tap cannot refund (and restock) twice.
      const refunded = await Transaction.findOneAndUpdate(
        { _id: transaction._id, status: { $ne: 'refunded' } },
        {
          $set: {
            status: 'refunded',
            subStatus: 'void',
            refundReason: refundReason || 'Refunded by staff',
            refundBy: staff._id || staffId || null,
            refundedAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!refunded) {
        return res.status(200).json({
          success: true,
          message: 'Transaction already refunded',
          transactionId: transaction._id,
          refundStatus: 'already_refunded',
          alreadyRefunded: true,
        });
      }

      let inventoryRestocked = false;
      let tillAdjusted = false;
      let reportAdjusted = false;

      if (previousStatus === 'completed' || previousStatus === 'credit') {
        try {
          inventoryRestocked = await restockSaleInventoryOnce(refunded._id, refunded.items || []);
        } catch (stockErr) {
          console.warn('Failed to restock inventory for refund:', stockErr.message);
        }
      }

      if (previousStatus === 'completed') {
        if (refunded.tillId) {
          try {
            const totals = await unlinkTransactionFromTill(refunded.tillId, refunded._id);
            tillAdjusted = Boolean(totals);
            reportAdjusted = Boolean(totals?.reportAdjusted);
          } catch (tillErr) {
            console.warn('Failed to adjust till on refund:', tillErr.message);
          }
        }

        try {
          await releaseRoomsFromTransaction(refunded.items || [], refunded);
        } catch (roomReleaseErr) {
          console.warn('Failed to release room availability on refund:', roomReleaseErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Transaction refunded successfully',
        transactionId: refunded._id,
        refundStatus: 'refund',
        subStatus: 'void',
        inventoryRestocked,
        tillAdjusted,
        reportAdjusted,
        transaction: {
          id: refunded._id,
          status: 'refunded',
          subStatus: 'void',
          refundedAt: refunded.refundedAt,
        },
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
