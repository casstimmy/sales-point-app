/**
 * API Endpoint: POST /api/transactions
 * 
 * Handles transaction syncing from offline clients
 * Receives individual offline transactions and stores them in the database
 */

import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';
import Till from '@/src/models/Till';

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
      staffName = 'Unknown',
      staffId,
      discount = 0,
      location = 'Default Location',
      device,
      tableName,
      customerName,
      createdAt,
      status = 'completed',
      tillId // Till session ID
    } = req.body;
    
    // Determine which payment method is being used
    const hasMultiplePayments = tenderPayments && Array.isArray(tenderPayments) && tenderPayments.length > 0;
    const hasSingleTender = tenderType && !hasMultiplePayments;
    
    console.log(`📦 Processing transaction - till: ${tillId}, amount: ${total}`);
    if (hasMultiplePayments) {
      console.log(`   Multiple payments: ${tenderPayments.map(tp => `${tp.tenderName}:${tp.amount}`).join(', ')}`);
    } else if (hasSingleTender) {
      console.log(`   Single tender: ${tenderType}`);
    }

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error('❌ Invalid transaction: items array required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: items array required',
      });
    }

    if (total === undefined || (!hasSingleTender && !hasMultiplePayments)) {
      console.error('❌ Invalid transaction: total and (tenderType or tenderPayments) required');
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: total and (tenderType or tenderPayments) required',
      });
    }

    // DUPLICATE PREVENTION: Check if this transaction already exists
    // Based on createdAt timestamp, total, tillId, and staffName
    if (createdAt && tillId) {
      const existingTransaction = await Transaction.findOne({
        createdAt: new Date(createdAt),
        total: total,
        tillId: new (require('mongoose')).Types.ObjectId(tillId),
        staffName: staffName
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
      // Payment method: can be single (legacy) or multiple (split)
      ...(hasSingleTender && { tenderType }),
      ...(hasMultiplePayments && { tenderPayments }),
      
      amountPaid: amountPaid || total,
      total: total,
      staff: staffId || null,
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
          till.transactionCount = (till.transactionCount || 0) + 1;
          
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

    // Update product quantities after successful transaction save
    try {
      await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/products/update-quantities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: mappedItems }),
      });
      console.log('✅ Product quantities updated');
    } catch (updateErr) {
      console.warn('⚠️ Failed to update product quantities:', updateErr.message);
      // Don't fail the transaction if quantity update fails
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
    console.error('❌ Error saving transaction:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to save transaction',
      message: error.message
    });
  }
}
