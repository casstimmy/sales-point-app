import { mongooseConnect } from "@/src/lib/mongoose";
import { Staff } from "@/src/models/Staff";
import Store from "@/src/models/Store";
import bcrypt from "bcryptjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Handle both old format (staff, pin, location) and new format (store, location, staff, pin)
  let { staff: staffId, pin, location, store, staff: newStaffId } = req.body;
  
  // Support new format from StaffLogin component
  staffId = newStaffId || staffId;

  if (!staffId || !pin) {
    return res.status(400).json({
      message: "Staff ID and PIN are required",
    });
  }

  // PIN must be 4 digits
  if (pin.length !== 4 || isNaN(pin)) {
    return res.status(400).json({
      message: "PIN must be 4 digits",
    });
  }

  try {
    await mongooseConnect();

    // Fetch staff member
    const staffMember = await Staff.findById(staffId).lean();

    if (!staffMember) {
      return res.status(401).json({ message: "Staff member not found" });
    }

    if (!staffMember.isActive) {
      return res.status(401).json({ message: "Staff account is inactive" });
    }

    // Check PIN - try both password and pin fields
    let isPinCorrect = false;
    
    if (staffMember.password) {
      try {
        isPinCorrect = await bcrypt.compare(pin, staffMember.password);
      } catch (err) {
        console.error("Password hash comparison failed:", err.message);
      }
    }

    // Also try the pin field if password check failed
    if (!isPinCorrect && staffMember.pin) {
      try {
        isPinCorrect = await bcrypt.compare(pin, staffMember.pin);
      } catch (err) {
        console.error("PIN field comparison failed:", err.message);
      }
    }

    // If bcrypt comparison fails, try plain text comparison (for testing)
    if (!isPinCorrect) {
      isPinCorrect = pin === staffMember.pin || pin === staffMember.password;
    }

    if (!isPinCorrect) {
      return res.status(401).json({ message: "Invalid PIN" });
    }

    // Fetch store information
    const storeData = await Store.findOne();  // Don't use .lean() to preserve ObjectIds
    let locationData = null;
    let storeName = "Default Store";
    
    console.log("🔍 Login: Searching for location...");
    console.log("   Location ID from request:", location);
    console.log("   Store exists:", !!storeData);
    console.log("   Store locations count:", storeData?.locations?.length || 0);
    
    if (storeData) {
      storeName = storeData.storeName || storeData.companyName || "Default Store";
      
      // Find location by ID if provided
      if (location && storeData.locations && Array.isArray(storeData.locations)) {
        console.log("   Available location IDs:", storeData.locations.map(l => ({
          _id: l._id?.toString(),
          name: l.name,
        })));
        
        locationData = storeData.locations.find(
          (l) => {
            const idMatch = l._id?.toString() === location?.toString();
            const nameMatch = l.name === location;
            console.log(`   Checking location "${l.name}": ID match=${idMatch}, Name match=${nameMatch}`);
            return idMatch || nameMatch;
          }
        );
        
        if (locationData) {
          console.log(`✅ Found location: "${locationData.name}"`);
        } else {
          console.log(`❌ Location not found with ID/name: ${location}`);
        }
      } else if (storeData.locations && storeData.locations.length > 0) {
        // Use first location if none specified
        locationData = storeData.locations[0];
        console.log(`✅ Using first location: "${locationData.name}"`);
      }
    }

    // Ensure location data is always returned properly
    const finalLocationData = locationData || {
      _id: location || "default",
      name: "Main Store",
    };

    const responseData = {
      message: "Login successful",
      staff: {
        _id: staffMember._id,
        name: staffMember.name,
        username: staffMember.username,
        role: staffMember.role,
        locationId: finalLocationData?._id,
        locationName: finalLocationData?.name || staffMember.locationName || "Main Store",
      },
      store: {
        _id: storeData?._id,
        name: storeName,
      },
      location: {
        _id: finalLocationData?._id,
        name: finalLocationData?.name,
        address: finalLocationData?.address || "",
        phone: finalLocationData?.phone || "",
        email: finalLocationData?.email || "",
      },
    };

    console.log("✅ Login response prepared:", {
      staff: responseData.staff.name,
      location: responseData.location?.name,
      locationId: responseData.location?._id?.toString(),
    });

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Something went wrong",
      error: error.message,
    });
  }
}
