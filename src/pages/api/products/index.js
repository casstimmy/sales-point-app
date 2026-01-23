/**
 * API Endpoint: GET /api/products
 * 
 * Fetches all products from database with optional filtering
 * Query params:
 * - category: Filter by category name
 * - search: Search by product name
 */

import { mongooseConnect } from "@/src/lib/mongoose";
import Product from "@/src/models/Product";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    console.log("🛍️ Products API: Connecting to MongoDB...");
    await mongooseConnect();
    console.log("✅ Products API: Connected to MongoDB");

    const { category, search } = req.query;
    console.log("🛍️ Products API: Query params - category:", category, "search:", search);
    
    let query = {};

    // Filter by category if provided
    // The category param is the ObjectId (MongoDB _id) of the category
    if (category) {
      // Products store category as an ObjectId string, so we match directly
      query.category = category;
      console.log("🛍️ Products API: Filtering by category (ID):", category);
    }

    // Search by product name if provided
    if (search) {
      query.name = { $regex: search, $options: "i" };
      console.log("🛍️ Products API: Searching for:", search);
    }

    console.log("🛍️ Products API: MongoDB query object:", JSON.stringify(query));
    
    const products = await Product.find(query)
      .select("_id name category salePriceIncTax quantity images description")
      .limit(500)
      .lean();

    console.log(`✅ Products API: Found ${products.length} products`);
    if (products.length > 0) {
      console.log("✅ Products API: First product:", products[0]);
    }

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (err) {
    console.error("❌ Products API Error:", err);
    console.error("❌ Stack:", err.stack);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: err.message,
    });
  }
}
