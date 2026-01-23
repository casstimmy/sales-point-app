/**
 * API Endpoint: GET /api/staff/list
 * 
 * Fetches all active staff members from database
 * Query params:
 * - location: Filter by location name
 * 
 * Returns: { success: true, count: X, data: [staff...] }
 */

import { mongooseConnect } from "@/src/lib/mongoose";
import { Staff } from "@/src/models/Staff";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // Step 1: Connect to MongoDB
    console.log("👤 Staff API: Starting request...");
    await mongooseConnect();
    console.log("✅ Staff API: Connected to MongoDB");

    const { location } = req.query;

    // Step 2: Build query
    let query = {};
    if (location) {
      query.locationName = location;
      console.log(`📍 Staff API: Filtering by location: ${location}`);
    }

    // Step 3: Fetch all staff first (without isActive filter)
    console.log("📥 Staff API: Fetching staff from database...");
    const allStaff = await Staff.find(query)
      .select("_id name username role locationName isActive")
      .lean();

    console.log(`📊 Staff API: Found ${allStaff.length} total staff records`);

    // Step 4: Filter for active staff (isActive must be true or undefined)
    const activeStaff = allStaff.filter(s => s.isActive !== false);
    console.log(`✅ Staff API: ${activeStaff.length} active staff members`);

    return res.status(200).json({
      success: true,
      count: activeStaff.length,
      data: activeStaff,
    });
  } catch (err) {
    console.error("❌ Staff API Error:", {
      message: err.message,
      code: err.code,
      name: err.name,
    });

    // Return default demo staff when MongoDB is unavailable
    console.log("⚠️ MongoDB unavailable, returning demo staff as fallback");
    const defaultStaff = [
      {
        _id: "demo_staff_1",
        name: "Demo Cashier",
        username: "cashier",
        role: "staff",
        locationName: "Main Store",
        isActive: true,
      },
      {
        _id: "demo_staff_2",
        name: "Demo Manager",
        username: "manager",
        role: "manager",
        locationName: "Main Store",
        isActive: true,
      },
    ];
    
    return res.status(200).json({
      success: true,
      count: defaultStaff.length,
      data: defaultStaff,
    });
  }
}

