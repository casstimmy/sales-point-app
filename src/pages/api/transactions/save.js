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
        const updateResult = await Till.findByIdAndUpdate(
          tillId,
          {
            $addToSet: { transactions: savedTransaction._id }, // Add to transactions array (prevents duplicates)
            $inc: { transactionCount: 1 } // Increment transaction count
          },
          { new: true }
        );
        
        if (updateResult) {
          console.log(`✅ Transaction linked to till - Till now has ${updateResult.transactions.length} transactions`);
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
