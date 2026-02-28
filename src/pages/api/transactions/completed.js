/**
 * API Endpoint: GET /api/transactions/completed
 * 
 * Fetches all completed transactions from the database
 * Used by the Orders/Complete screen to display transaction history
 * Supports both online and offline access (offline uses IndexedDB)
 */

import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';

export default async function handler(req, res) {
  // Only support GET
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    });
  }

  try {
    await mongooseConnect();

    // Get filter parameters from query
    const { 
      staffId,
      location,
      tillId,
      startDate,
      endDate,
      limit = 100,
      skip = 0
    } = req.query;

    // Build query filters
    const filters = {
      status: { $in: ['completed', 'COMPLETE', 'complete'] } // Legacy + normalized status support
    };

    // Optional filters
    if (staffId) {
      filters.staff = staffId;
    }
    if (location) {
      filters.location = location;
    }
    if (tillId) {
      filters.tillId = tillId;
    }

    // Date range filter
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) {
        filters.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // Include entire end date
        filters.createdAt.$lte = endDateTime;
      }
    }

    console.log('📋 Fetching completed transactions with filters:', filters);

    // Fetch completed transactions
    const transactions = await Transaction.find(filters)
      .sort({ createdAt: -1 }) // Most recent first
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean(); // Lean query for performance

    // Format transactions for frontend
    const formattedTransactions = transactions.map(tx => ({
      id: tx._id?.toString() || tx.id,
      createdAt: tx.createdAt,
      total: tx.total || 0,
      subtotal: tx.subtotal || 0,
      tax: tx.tax || 0,
      discount: tx.discount || 0,
      amountPaid: tx.amountPaid || tx.total || 0,
      change: tx.change || 0,
      customerName: tx.customerName || 'Walk-in',
      staffName: tx.staffName || 'Unknown',
      staffId: tx.staff?.toString() || tx.staffId,
      tillId: tx.tillId?.toString() || tx.tillId,
      location: tx.location || 'Default Location',
      tenderType: tx.tenderType, // Legacy single tender
      tenderPayments: tx.tenderPayments, // New split payments
      items: tx.items || [],
      status: tx.status || 'completed',
      subStatus: tx.subStatus || null,
      device: tx.device || 'POS',
      transactionType: tx.transactionType || 'pos',
    }));

    console.log(`✅ Found ${formattedTransactions.length} completed transactions`);

    return res.status(200).json({
      success: true,
      data: formattedTransactions,
      count: formattedTransactions.length,
    });

  } catch (error) {
    console.error('❌ Error fetching completed transactions:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch completed transactions',
    });
  }
}
