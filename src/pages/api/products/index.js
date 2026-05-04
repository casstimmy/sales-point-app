/**
 * API Endpoint: GET /api/products
 * 
 * Fetches all products from database with optional filtering
 * Query params:
 * - category: Filter by category ObjectId
 * - search: Search by product name
 * - locationId: Filter by store location ID (resolves name from Store)
 */

import { mongooseConnect } from "@/src/lib/mongoose";
import Product from "@/src/models/Product";
import Store from "@/src/models/Store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await mongooseConnect();

    const { category, search, locationId } = req.query;
    
    let query = {};

    // Filter by category if provided
    if (category) {
      query.category = category;
    }

    // Search by product name if provided
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    let products = await Product.find(query)
      .select("_id name category salePriceIncTax quantity images description locations isChildProduct parentProduct packType qtyPerPack childSalePrice productType roomStatus currentBooking")
      .limit(500)
      .lean();

    // Filter by location in JavaScript (more reliable than $or with mixed data)
    // Products with no locations assigned are available at all locations
    if (locationId && products.length > 0) {
      let locationName = null;
      try {
        const store = await Store.findOne().lean();
        if (store?.locations && Array.isArray(store.locations)) {
          const found = store.locations.find(
            (loc) => (loc._id?.toString ? loc._id.toString() : String(loc._id)) === locationId
          );
          if (found) locationName = found.name;
        }
      } catch (storeErr) {
        console.warn("⚠️ Could not look up store for location filter:", storeErr.message);
      }

      if (locationName) {
        products = products.filter((p) => {
          // No locations assigned = available everywhere
          if (!p.locations || !Array.isArray(p.locations) || p.locations.length === 0) {
            return true;
          }
          // Check if any entry in locations matches the name or ID
          return p.locations.some(
            (loc) => loc === locationName || loc === locationId || 
                     String(loc).toLowerCase() === locationName.toLowerCase()
          );
        });
        console.log(`📍 Location filter: "${locationName}" | ${products.length} products after filter`);
      }
    }

    // Derive child product quantities from their parent
    // Child qty = parent.qty × qtyPerPack (always computed, never stored independently)
    const childProducts = products.filter((p) => p.isChildProduct && p.parentProduct);
    if (childProducts.length > 0) {
      // Collect all parent IDs needed
      const parentIds = [...new Set(childProducts.map((p) => String(p.parentProduct)))];
      const parents = await Product.find({ _id: { $in: parentIds } })
        .select("_id quantity qtyPerPack")
        .lean();
      const parentMap = new Map(parents.map((p) => [String(p._id), p]));

      for (const child of childProducts) {
        const parent = parentMap.get(String(child.parentProduct));
        if (parent && parent.qtyPerPack > 0) {
          child.quantity = parent.quantity * parent.qtyPerPack;
        }
      }
    }

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (err) {
    console.error("❌ Products API Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: err.message,
    });
  }
}
