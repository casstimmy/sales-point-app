// components/pos/OpenTillModal.js
import { useState, useEffect } from "react";
import { useStaff } from "../../context/StaffContext";

export default function OpenTillModal({ isOpen, onClose, onTillOpened, staffData = null, locationData = null }) {
  const contextStaff = useStaff();
  const staff = staffData || contextStaff?.staff;
  const location = locationData || contextStaff?.location;
  const { setCurrentTill } = contextStaff;
  
  const [openingBalance, setOpeningBalance] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(true);

  // Track online/offline status
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Save till to localStorage for offline use
  const saveTillOffline = (tillData) => {
    const till = {
      ...tillData,
      _id: tillData._id || `offline-till-${Date.now()}`,
      openedAt: new Date().toISOString(),
      status: 'open',
      transactions: [],
      totalSales: 0,
      transactionCount: 0,
      tenderBreakdown: {},
      synced: false,
    };
    localStorage.setItem("till", JSON.stringify(till));
    console.log("💾 Till saved to localStorage for offline use:", till);
    return till;
  };

  const handleOpenTill = async () => {
    // Validate input
    if (openingBalance === "" || isNaN(openingBalance)) {
      setError("Please enter a valid opening balance");
      return;
    }

    // Validate required data
    if (!staff?._id) {
      setError("Staff ID is missing. Please log in again.");
      return;
    }

    if (!location?._id) {
      setError("Location ID is missing. Please log in again.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        staffId: staff._id,
        staffName: staff.name,
        storeId: staff.storeId || "default-store",
        locationId: location._id,
        openingBalance: parseFloat(openingBalance),
      };
      
      console.log("📋 Opening till with payload:", payload);

      if (isOnline) {
        // ONLINE: Send to server
        const response = await fetch("/api/till/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        console.log("📋 Till API response status:", response.status);
        
        const data = await response.json();
        console.log("📋 Till API response data:", data);

        if (response.status === 400 && data.message?.includes("already open")) {
          // Till is already open, retrieve it instead
          console.log("⚠️ Till already open for this location, retrieving existing till");
          const existingTill = data.existingTill;
          
          if (existingTill) {
            console.log("✅ Using existing till:", existingTill);
            setCurrentTill(existingTill);
            saveTillOffline(existingTill); // Save for offline use
            setOpeningBalance("");
            setError(null);
            onTillOpened(existingTill);
            onClose();
            return;
          }
        }

        if (!response.ok) {
          const errorMsg = data.message || data.error || "Failed to open till";
          console.error("❌ Till API error:", errorMsg);
          throw new Error(errorMsg);
        }

        console.log("✅ Till opened, storing in context:", data.till);
        setCurrentTill(data.till);
        saveTillOffline(data.till); // Save for offline use
        setOpeningBalance("");
        setError(null);
        
        console.log("✅ Till opened successfully, calling callback");
        onTillOpened(data.till);
        onClose();
      } else {
        // OFFLINE: Create local till
        console.log("📴 Offline - Creating local till");
        
        const localTill = saveTillOffline({
          staffId: staff._id,
          staffName: staff.name,
          storeId: staff.storeId || "default-store",
          locationId: location._id,
          locationName: location.name,
          openingBalance: parseFloat(openingBalance),
        });
        
        setCurrentTill(localTill);
        setOpeningBalance("");
        setError(null);
        
        console.log("✅ Offline till created successfully:", localTill);
        onTillOpened(localTill);
        onClose();
      }
    } catch (err) {
      console.error("❌ Error opening till:", err.message, err);
      
      // If online request fails, try to create offline till
      if (!isOnline || err.message.includes("fetch")) {
        console.log("📴 Falling back to offline till creation");
        try {
          const localTill = saveTillOffline({
            staffId: staff._id,
            staffName: staff.name,
            storeId: staff.storeId || "default-store",
            locationId: location._id,
            locationName: location.name,
            openingBalance: parseFloat(openingBalance),
          });
          
          setCurrentTill(localTill);
          setOpeningBalance("");
          setError(null);
          
          console.log("✅ Offline till created as fallback:", localTill);
          onTillOpened(localTill);
          onClose();
          return;
        } catch (offlineErr) {
          console.error("❌ Offline fallback failed:", offlineErr);
        }
      }
      
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-800">Open Till</h2>
          {!isOnline && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-1 rounded text-sm font-semibold flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-yellow-600 rounded-full animate-pulse"></span>
              OFFLINE
            </div>
          )}
        </div>

        {/* Staff & Location Info */}
        <div className="bg-gray-50 p-5 rounded mb-6">
          <p className="text-base text-gray-600 mb-2">
            <strong>Staff:</strong> {staff?.name || "Unknown"}
          </p>
          <p className="text-base text-gray-600 mb-2">
            <strong>Location:</strong> {location?.name || "Unknown"}
          </p>
          <p className="text-base text-gray-600">
            <strong>Date:</strong> {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Offline Notice */}
        {!isOnline && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4 text-sm">
            <p className="font-semibold">📴 Offline Mode</p>
            <p className="mt-1">Till will be created locally and synced when back online.</p>
          </div>
        )}

        {/* Opening Balance Input */}
        <div className="mb-6">
          <label className="block text-gray-700 font-semibold mb-3 text-lg">
            Opening Balance (Cash in Till)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-300 rounded px-4 py-4 text-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <p className="text-base text-gray-500 mt-2">
            Enter the amount of cash currently in the till
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-4 rounded mb-4 flex items-start gap-2">
            <span className="text-2xl mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold text-base">{error}</p>
              {error.includes("already open") && (
                <p className="text-sm mt-2 text-red-600">
                  The till for this location is already open. Click &quot;Continue&quot; to proceed with the existing till session.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-4 border-2 border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-lg min-h-14"
          >
            Cancel
          </button>
          <button
            onClick={handleOpenTill}
            disabled={loading || (!openingBalance && !error?.includes("already open"))}
            className="flex-1 px-4 py-4 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:opacity-50 text-lg min-h-14"
          >
            {loading ? "Processing..." : error?.includes("already open") ? "Continue" : "Open Till"}
          </button>
        </div>
      </div>
    </div>
  );
}
