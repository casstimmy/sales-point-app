/**
 * API Endpoint: GET /api/store/init-locations
 * 
 * Fetches store information with locations for login
 * Response format: { store: { _id, storeName, locations: [] } }
 */

import { mongooseConnect } from "@/src/lib/mongoose";
import Store from "@/src/models/Store";
import mongoose from "mongoose";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    console.log("🏪 Store API: Starting request...");
    console.log("   MongoDB URI exists:", !!process.env.MONGODB_URI);
    console.log("   MongoDB URI (first 50 chars):", process.env.MONGODB_URI?.substring(0, 50) || "NOT SET");
    
    await mongooseConnect();
    console.log("✅ Store API: Connected to MongoDB");
    console.log("   Mongoose connection state:", mongoose.connection.readyState);

    console.log("📥 Store API: Fetching store from database...");
    const store = await Store.findOne({});  // Empty query to get first document

    if (!store) {
      console.log("⚠️ Store API: No store found - checking collection...");
      const count = await Store.countDocuments();
      console.log(`   Total stores in collection: ${count}`);
      
      if (count === 0) {
        console.log("⚠️ Store collection is EMPTY - returning demo data");
      } else {
        console.log("❌ ERROR: Store collection has data but query returned null!");
      }
    } else {
      console.log(`✅ Store API: Found store "${store.storeName || store.companyName}"`);
      console.log(`📍 Store API: Found ${store.locations?.length || 0} locations`);
      if (store.locations && store.locations.length > 0) {
        console.log("   Location details:", store.locations.map(l => ({ 
          _id: l._id?.toString(), 
          name: l.name, 
          isActive: l.isActive 
        })));
      }
    }

    if (!store || !store.locations || store.locations.length === 0) {
      // Return default store and location if none found
      console.log("📦 Store API: Returning default store configuration (FALLBACK MODE)");
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

    // Convert to object and filter locations
    const storeObj = store.toObject ? store.toObject() : store;
    
    // Filter out inactive locations, ensure all fields are present
    const activeLocations = (storeObj.locations || [])
      .filter(loc => loc.isActive !== false)
      .map(loc => ({
        _id: loc._id,
        name: loc.name,
        address: loc.address || "",
        phone: loc.phone || "",
        email: loc.email || "",
        code: loc.code || "",
        isActive: loc.isActive,
        tenders: loc.tenders || [],
        categories: loc.categories || [],
      }));
    
    console.log(`✅ Store API: Returning ${activeLocations.length} ACTUAL locations from database (${(storeObj.locations || []).length - activeLocations.length} inactive)`);

    return res.status(200).json({
      success: true,
      store: {
        _id: storeObj._id,
        storeName: storeObj.storeName || storeObj.companyName || "Default Store",
        locations: activeLocations,
      },
    });
  } catch (err) {
    console.error("❌ Store API Error:", {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack,
    });
    console.error("   Full error:", err);
    
    // Return default store/locations even if MongoDB is unavailable
    console.log("⚠️ MongoDB ERROR - returning default store configuration (FALLBACK MODE)");
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

