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
    console.log("🏪 Store API: Starting request...");
    await mongooseConnect();
    console.log("✅ Store API: Connected to MongoDB");

    console.log("📥 Store API: Fetching store from database...");
    const store = await Store.findOne().lean();

    if (store) {
      console.log(`✅ Store API: Found store "${store.storeName || store.companyName}"`);
      console.log(`📍 Store API: Found ${store.locations?.length || 0} locations`);
    } else {
      console.log("⚠️ Store API: No store found in database");
    }

    if (!store || !store.locations || store.locations.length === 0) {
      // Return default store and location if none found
      console.log("📦 Store API: Returning default store configuration");
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
    console.error("❌ Store API Error:", {
      message: err.message,
      code: err.code,
      name: err.name,
    });
    
    // Return default store/locations even if MongoDB is unavailable
    console.log("⚠️ MongoDB unavailable, returning default store configuration");
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
}

