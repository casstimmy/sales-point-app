import { mongooseConnect } from "@/src/lib/mongoose";
import { Staff } from "@/src/models/Staff";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    console.log("\n\n========== STAFF API REQUEST ==========");
    console.log("MongoDB URI exists:", !!process.env.MONGODB_URI);
    
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI environment variable is not set");
    }
    
    await mongooseConnect();
    console.log("✅ Connected to MongoDB");

    console.log("📥 Querying Staff collection...");
    const staff = await Staff.find({});
    
    console.log("\n📦 STAFF FETCHED:");
    console.log("Total staff:", staff.length);
    console.log("Staff data:", JSON.stringify(staff, null, 2));

    return res.status(200).json({
      success: true,
      count: staff.length,
      data: staff,
    });
  } catch (err) {
    console.error("\n\n❌❌❌ ERROR ❌❌❌");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    console.error("Full error:", err);
    return res.status(500).json({ 
      success: false, 
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
}

