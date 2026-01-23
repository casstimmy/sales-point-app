// pages/api/till/[tillId].js
import { mongooseConnect } from "@/src/lib/mongoose";
import Till from "@/src/models/Till";
import { Transaction } from "@/src/models/Transactions";
import mongoose from "mongoose";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await mongooseConnect();

    const { tillId } = req.query;

    if (!tillId) {
      return res.status(400).json({ message: "Till ID is required" });
    }

    // Find till by ID and populate all transactions with full details
    const till = await Till.findById(tillId)
      .populate({
        path: "transactions",
        select: "tenderType total amountPaid createdAt items transactionType"
      });

    if (!till) {
      return res.status(404).json({ message: "Till not found" });
    }

    console.log(`\n📊 ===== TILL FETCH REQUEST =====`);
    console.log(`📊 Till ID: ${tillId}`);
    console.log(`   Status: ${till.status}`);
    console.log(`   Opening Balance: ₦${till.openingBalance}`);
    console.log(`   Total Sales (stored): ₦${till.totalSales}`);
    console.log(`   Transaction Count (stored): ${till.transactionCount}`);
    console.log(`   Linked transactions array length: ${till.transactions?.length || 0}`);
    
    if (till.transactions && till.transactions.length > 0) {
      console.log(`   Transaction IDs: ${till.transactions.slice(0, 3).map(t => t.toString()).join(', ')}${till.transactions.length > 3 ? '...' : ''}`);
    }

    // **BEST METHOD: Use MongoDB aggregation to calculate tender breakdown from linked transactions**
    // This ensures we have the accurate breakdown from actual transaction data
    
    let tenderBreakdownForResponse = {};

    if (till.transactions && till.transactions.length > 0) {
      console.log(`\n💰 ===== AGGREGATING TRANSACTIONS BY TENDER =====`);
      console.log(`   Processing ${till.transactions.length} transaction IDs`);
      
      // Convert to ObjectIds if needed
      const transactionIds = till.transactions.map(t => {
        if (typeof t === 'string') {
          return new mongoose.Types.ObjectId(t);
        }
        return t;
      });
      
      console.log(`   Converted transaction IDs to ObjectIds`);
      
      // Use aggregation pipeline to group transactions by tender
      const aggregationResult = await Transaction.aggregate([
        // Match transactions in the till's transaction array
        {
          $match: {
            _id: { $in: transactionIds }
          }
        },
        // Add a debug stage to see what we're matching
        {
          $addFields: {
            debug_id: { $toString: "$_id" },
            debug_tenderType: "$tenderType",
            debug_tenderPaymentsCount: { $size: { $ifNull: ["$tenderPayments", []] } }
          }
        },
        // Use conditional to handle both split payments and legacy single tender
        {
          $addFields: {
            normalizedPayments: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$tenderPayments", []] } }, 0] },
                "$tenderPayments",
                [{ tenderName: { $ifNull: ["$tenderType", "CASH"] }, amount: "$total" }]
              ]
            }
          }
        },
        // Unwind the normalized payments array
        {
          $unwind: "$normalizedPayments"
        },
        // Group by tender name and sum amounts
        {
          $group: {
            _id: "$normalizedPayments.tenderName",
            totalAmount: { $sum: "$normalizedPayments.amount" },
            transactionCount: { $sum: 1 }
          }
        },
        // Sort by tender name
        {
          $sort: { _id: 1 }
        }
      ]);

      console.log(`✅ Aggregation complete - Found ${aggregationResult.length} tender types\n`);
      
      if (aggregationResult.length === 0) {
        console.log(`⚠️  Aggregation returned empty result. This means either:`);
        console.log(`   - The transactions don't have tenderType or tenderPayments`);
        console.log(`   - The ObjectIds don't match any transactions`);
      }

      // Convert aggregation results to breakdown object
      aggregationResult.forEach(group => {
        const tenderKey = group._id || "CASH";
        const amount = group.totalAmount || 0;
        const count = group.transactionCount || 0;
        
        tenderBreakdownForResponse[tenderKey] = amount;
        
        console.log(`   💳 ${tenderKey}: ₦${amount.toLocaleString('en-NG')} (${count} transaction${count !== 1 ? 's' : ''})`);
      });

      console.log(`\n✅ Final Tender Breakdown:`, tenderBreakdownForResponse);
    } else {
      console.log(`⚠️ No transactions linked to till - breakdown will be empty`);
    }

    // If aggregation found nothing, try stored breakdown as fallback
    if (Object.keys(tenderBreakdownForResponse).length === 0 && till.tenderBreakdown) {
      console.log(`\n🔄 Aggregation returned no results, using stored breakdown as fallback`);
      if (till.tenderBreakdown instanceof Map) {
        till.tenderBreakdown.forEach((value, key) => {
          tenderBreakdownForResponse[key] = value;
        });
      } else {
        Object.assign(tenderBreakdownForResponse, till.tenderBreakdown);
      }
      console.log(`   Fallback breakdown:`, tenderBreakdownForResponse);
    }

    const tillResponse = till.toObject();
    tillResponse.tenderBreakdown = tenderBreakdownForResponse;

    console.log(`\n✅ Returning till with tenderBreakdown containing ${Object.keys(tenderBreakdownForResponse).length} tender types\n`);

    return res.status(200).json({
      message: "Till found",
      till: tillResponse,
    });
  } catch (error) {
    console.error("❌ Error fetching till:", error);
    return res.status(500).json({
      message: "Failed to fetch till",
      error: error.message,
    });
  }
}
