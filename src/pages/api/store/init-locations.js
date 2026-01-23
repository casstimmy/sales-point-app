import { mongooseConnect } from "@/src/lib/mongoose";
import Store from "@/src/models/Store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    console.log("\n\n========== STORE API REQUEST ==========");
    console.log("MongoDB URI:", process.env.MONGODB_URI?.substring(0, 50) + "...");
    
    await mongooseConnect();
    console.log("✅ Connected to MongoDB");

    console.log("📥 Querying Store collection...");
    const store = await Store.findOne({});
    
    console.log("\n📦 STORE FETCHED:");
    console.log("Store object:", JSON.stringify(store, null, 2));
    
    if (!store) {
      console.log("\n❌ Store is NULL");
      const count = await Store.countDocuments();
      console.log(`Store collection has ${count} documents`);
      return res.status(200).json({ success: false, message: "No store found", count });
    }

    console.log("\n✅ Store found!");
    console.log("Store name:", store.storeName);
    console.log("Locations count:", store.locations?.length || 0);
    console.log("Locations:", JSON.stringify(store.locations, null, 2));

    return res.status(200).json({
      success: true,
      store: {
        _id: store._id,
        storeName: store.storeName,
        locations: store.locations || [],
      },
    });
  } catch (err) {
    console.error("\n\n❌❌❌ ERROR ❌❌❌");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    return res.status(500).json({ 
      success: false, 
      error: err.message,
      stack: err.stack 
    });
  }
}

