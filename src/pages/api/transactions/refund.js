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
import Till from '@/src/models/Till';
import Product from '@/src/models/Product';

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

      if (transaction.status === 'refunded') {
        return res.status(200).json({
          success: true,
          message: 'Transaction already refunded',
          transactionId: transaction._id,
          refundStatus: 'already_refunded',
          alreadyRefunded: true,
        });
      }

      const previousStatus = transaction.status;

	      // Update transaction status to refunded/void
	      transaction.status = 'refunded';
	      transaction.subStatus = 'void';
	      transaction.refundReason = refundReason || 'Refunded by staff';
      transaction.refundBy = staffId;
      transaction.refundedAt = new Date();
      transaction.updatedAt = new Date();

      await transaction.save();

      console.log(`✅ Transaction ${transactionId} marked as refunded`);

      let inventoryRestocked = false;
      let tillAdjusted = false;

      // Only reverse inventory/till impact if the transaction previously counted as a completed sale
      if (previousStatus === 'completed') {
        // Restock inventory once (idempotent)
        if (transaction.inventoryUpdated && !transaction.inventoryRestockedAt) {
          try {
            const mappedItems = (transaction.items || []).map((item) => ({
              productId: item.productId || item.id,
              qty: item.qty || item.quantity || 0,
            }));

            for (const item of mappedItems) {
              if (!item.productId || !item.qty) continue;
              await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { quantity: Number(item.qty) } },
                { new: true }
              );
            }

            transaction.inventoryRestockedAt = new Date();
            await transaction.save();
            inventoryRestocked = true;
          } catch (stockErr) {
            console.warn('⚠️ Failed to restock inventory for refund:', stockErr.message);
          }
        }

        // Reverse till totals if till is still open
        if (transaction.tillId) {
          try {
            const till = await Till.findById(transaction.tillId);
            if (till && till.status === 'OPEN') {
              till.transactions = (till.transactions || []).filter(
                (txId) => String(txId) !== String(transaction._id)
              );
              till.transactionCount = till.transactions.length;
              till.totalSales = Math.max(
                0,
                Number(till.totalSales || 0) - Number(transaction.total || 0)
              );

              if (!(till.tenderBreakdown instanceof Map)) {
                till.tenderBreakdown = new Map(Object.entries(till.tenderBreakdown || {}));
              }

              const subtractTenderAmount = (tenderName, amount) => {
                const key = tenderName || 'CASH';
                const current = Number(till.tenderBreakdown.get(key) || 0);
                const next = Math.max(0, current - Number(amount || 0));
                till.tenderBreakdown.set(key, next);
              };

              if (Array.isArray(transaction.tenderPayments) && transaction.tenderPayments.length > 0) {
                transaction.tenderPayments.forEach((payment) => {
                  subtractTenderAmount(payment?.tenderName, payment?.amount);
                });
              } else {
                subtractTenderAmount(transaction.tenderType || 'CASH', transaction.total);
              }

              till.markModified('tenderBreakdown');
              await till.save();
              tillAdjusted = true;
            }
          } catch (tillErr) {
            console.warn('⚠️ Failed to adjust till on refund:', tillErr.message);
          }
        }
      }

	      return res.status(200).json({
	        success: true,
	        message: 'Transaction refunded successfully',
	        transactionId: transaction._id,
	        refundStatus: 'refund',
	        subStatus: 'void',
	        inventoryRestocked,
	        tillAdjusted,
	        transaction: {
	          id: transaction._id,
	          status: 'refund',
	          subStatus: 'void',
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
