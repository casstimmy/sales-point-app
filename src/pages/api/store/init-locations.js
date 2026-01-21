/**
 * API Endpoint: GET /api/store/init-locations
 * 
 * Fetches store information with locations for login
 * Response format: { store: { _id, storeName, locations: [] } }
 */

import { mongooseConnect } from "../../../lib/mongoose";
import Store from "../../../models/Store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    await mongooseConnect();

    const store = await Store.findOne().lean();

    if (!store || !store.locations || store.locations.length === 0) {
      // Return default store and location if none found
      return res.status(200).json({
        success: true,
        store: {
          _id: null,
          storeName: "Default Store",
          locations: [
            {
              _id: "default",
              name: "Main Store",
              address: "",
              phone: "",
              isActive: true,
            },
          ],
        },
      });
    }

    return res.status(200).json({
      success: true,
      store: {
        _id: store._id,
        storeName: store.storeName || store.companyName || "Default Store",
        locations: store.locations,
      },
    });
  } catch (err) {
    console.error("Error fetching store locations:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch store locations",
      error: err.message,
    });
  }
}
