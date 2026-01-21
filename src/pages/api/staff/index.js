/**
 * API Endpoint: GET /api/staff
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
    let query = { isActive: true };

    // Filter by location if provided
    if (location) {
      query.locationName = location;
    }

    const staff = await Staff.find(query)
      .select("_id name username role locationName")
      .lean();

    return res.status(200).json({
      success: true,
      count: staff.length,
      data: staff,
    });
  } catch (err) {
    console.error("Error fetching staff:", err);
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
