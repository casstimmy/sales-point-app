import { mongooseConnect } from "@/src/lib/mongoose";
import { Staff } from "@/src/models/Staff";
import { normalizePosPermissions } from "@/src/lib/posPermissions";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await mongooseConnect();

    const staff = await Staff.find({})
      .select("_id name username role locationName locationId isActive posPermissions")
      .lean();

    const normalized = staff.map((member) => ({
      ...member,
      posPermissions: normalizePosPermissions(member.role, member.posPermissions),
    }));

    return res.status(200).json({
      success: true,
      count: normalized.length,
      data: normalized,
    });
  } catch (err) {
    console.error("Staff list error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}