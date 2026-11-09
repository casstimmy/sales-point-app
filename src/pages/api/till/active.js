// pages/api/till/active.js
/**
 * GET /api/till/active
 * 
 * Fetches all currently open (OPEN status) tills across all locations
 * Used by login page to show which tills are active and available to resume
 */

import { mongooseConnect } from "@/src/lib/mongoose";
import Till from "@/src/models/Till";
import Store from "@/src/models/Store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await mongooseConnect();

    console.log("📋 Fetching all active open tills...");

    // Find all tills with OPEN status
    const activeTills = await Till.find({ status: "OPEN" })
      .sort({ openedAt: -1 }) // Most recent first
      .lean()
      .exec();

    console.log(`✅ Found ${activeTills.length} active till${activeTills.length !== 1 ? 's' : ''}`);

    // This endpoint is public (the login screen uses it before anyone signs in),
    // so it only says which tills are open - never how much money is in them.
    const storeCache = new Map();
    const enrichedTills = await Promise.all(
      activeTills.map(async (till) => {
        const storeKey = String(till.storeId || "");
        if (storeKey && !storeCache.has(storeKey)) {
          storeCache.set(storeKey, Store.findById(till.storeId).select("locations").lean());
        }
        const store = storeKey ? await storeCache.get(storeKey) : null;
        const location = store?.locations?.find(
          (loc) => String(loc._id) === String(till.locationId || "")
        );

        return {
          _id: till._id,
          staffId: till.staffId,
          staffName: till.staffName,
          locationName: location?.name || "Unknown Location",
          locationId: till.locationId,
          openedAt: till.openedAt,
          storeId: till.storeId,
          status: till.status,
        };
      })
    );

    return res.status(200).json({
      success: true,
      tills: enrichedTills,
      count: enrichedTills.length,
    });
  } catch (error) {
    console.error("❌ Error fetching active tills:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active tills",
      error: error.message,
    });
  }
}
