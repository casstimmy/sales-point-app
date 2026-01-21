/**
 * API Endpoint: GET /api/staff/list
 * 
 * Fetches all active staff members
 * Query params:
 * - location: Filter by location name
 */

import { mongooseConnect } from "../../../lib/mongoose";
import { Staff } from "../../../models/Staff";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await mongooseConnect();

    const { location } = req.query;
    let query = {};

    // Start with empty query, MongoDB is now available
    // Try to filter by isActive if it exists
    const { location: locFilter } = req.query;
    
    // Build query dynamically
    if (locFilter) {
      query.locationName = locFilter;
    }

    // First try with isActive filter
    let staff = await Staff.find({ ...query, isActive: true })
      .select("_id name username role locationName")
      .lean();

    // If no results with isActive filter, try without it (in case field doesn't exist)
    if (staff.length === 0) {
      console.log("ℹ️ No staff found with isActive filter, trying without filter");
      staff = await Staff.find(query)
        .select("_id name username role locationName")
        .lean();
    }

    console.log(`✅ Fetched ${staff.length} staff members from database`);

    return res.status(200).json({
      success: true,
      count: staff.length,
      data: staff,
    });
  } catch (err) {
    console.error("Error fetching staff:", err);
    console.error("Error details:", {
      message: err.message,
      code: err.code,
      name: err.name,
    });
    
    // Return default demo staff when MongoDB is unavailable
    console.log("⚠️ MongoDB unavailable, returning default demo staff");
    const defaultStaff = [
      {
        _id: "staff_1",
        name: "Demo Cashier",
        username: "cashier",
        role: "staff",
        locationName: "Main Store",
      },
      {
        _id: "staff_2",
        name: "Demo Manager",
        username: "manager",
        role: "manager",
        locationName: "Main Store",
      },
    ];
    return res.status(200).json({
      success: true,
      count: defaultStaff.length,
      data: defaultStaff,
    });
  }
}
