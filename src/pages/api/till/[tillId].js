// pages/api/till/[tillId].js
import { mongooseConnect } from "@/src/lib/mongoose";
import Till from "@/src/models/Till";

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

    const till = await Till.findById(tillId);

    if (!till) {
      return res.status(404).json({ message: "Till not found" });
    }

    // Convert to plain object for response
    const tillResponse = till.toObject();

    // Ensure tenderBreakdown is a plain object (Mongoose Map → Object)
    let tenderBreakdownObj = {};
    if (till.tenderBreakdown) {
      if (till.tenderBreakdown instanceof Map) {
        till.tenderBreakdown.forEach((value, key) => {
          tenderBreakdownObj[key] = value;
        });
      } else if (typeof till.tenderBreakdown === 'object') {
        // Handle case where toObject() already converted Map to object with $__ internals
        const raw = till.tenderBreakdown.toJSON
          ? till.tenderBreakdown.toJSON()
          : till.tenderBreakdown;
        Object.entries(raw).forEach(([key, value]) => {
          if (typeof value === 'number') {
            tenderBreakdownObj[key] = value;
          }
        });
      }
    }

    tillResponse.tenderBreakdown = tenderBreakdownObj;

    // Use stored values — these are maintained in real-time by /api/transactions
    tillResponse.totalSales = till.totalSales || 0;
    tillResponse.transactionCount = till.transactions?.length || till.transactionCount || 0;

    console.log(`📊 Till ${tillId}: sales=₦${tillResponse.totalSales}, txCount=${tillResponse.transactionCount}, tenders=${JSON.stringify(tenderBreakdownObj)}`);

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
