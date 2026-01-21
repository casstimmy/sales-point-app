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
    return res.status(500).json({
      success: false,
      message: "Failed to fetch staff members",
      error: err.message,
    });
  }
}
