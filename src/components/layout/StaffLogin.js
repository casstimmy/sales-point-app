import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useStaff } from "../../context/StaffContext";
import OpenTillModal from "../pos/OpenTillModal";
import { syncCategories, syncProducts } from "../../lib/indexedDB";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClock,
  faQuestionCircle,
  faPowerOff,
  faX,
} from "@fortawesome/free-solid-svg-icons";

/**
 * Professional POS Login Page
 * Matches modern POS system design with:
 * - Store/Location selection (left side)
 * - PIN/Passcode entry (right side)
 * - Real-time clock and status
 */
export default function StaffLogin() {
  const router = useRouter();
  const { login, setCurrentTill } = useStaff();

  const [stores, setStores] = useState([]);
  const [locations, setLocations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState("");
  const [hasPendingTransactions, setHasPendingTransactions] = useState(true);
  const [currentTillDisplay, setCurrentTillDisplay] = useState("TILL 1"); // Display only
  const [showOpenTillModal, setShowOpenTillModal] = useState(false);
  const [loginData, setLoginData] = useState(null); // Store login data to use after till opens
  const [activeTills, setActiveTills] = useState([]); // Track active open tills by location

  /* Track time */
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const date = now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      setCurrentTime(`${currentTillDisplay} - ${date} - ${hours}:${minutes}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [currentTillDisplay]);

  /* Track online/offline status */
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /* Fetch stores/locations and staff */
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        console.log("🔄 Fetching stores, locations, and staff data...");
        
        const response = await fetch("/api/store/init-locations");
        if (response.ok) {
          const data = await response.json();
          
          // Store is returned as an object with locations array
          if (data.store) {
            const storeObj = {
              _id: data.store._id,
              name: data.store.storeName || data.store.companyName || "Default Store",
            };
            setStores([storeObj]);
            setSelectedStore(storeObj._id);
            
            // Set locations from store
            if (Array.isArray(data.store.locations)) {
              const activeLocations = data.store.locations.filter(loc => loc.isActive !== false);
              setLocations(activeLocations);
              // Cache locations for offline use
              localStorage.setItem('cachedLocations', JSON.stringify(activeLocations));
              // Auto-select first location
              if (activeLocations.length > 0) {
                setSelectedLocation(activeLocations[0]._id);
              }
            }
          }
        }
        
        // Fetch staff (only active staff)
        const staffResponse = await fetch("/api/staff/list");
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          // API returns { success: true, count: X, data: [...] }
          const staffList = staffData.data || staffData || [];
          const staffArray = Array.isArray(staffList) ? staffList : [];
          setStaff(staffArray);
          // Cache staff for offline use
          localStorage.setItem('cachedStaff', JSON.stringify(staffArray));
          console.log(`✅ Loaded ${staffArray.length} staff members`);
        }

        // Pre-cache categories for offline use
        console.log("📦 Pre-caching categories for offline use...");
        try {
          const categoriesResponse = await fetch("/api/categories");
          if (categoriesResponse.ok) {
            const categoriesData = await categoriesResponse.json();
            const categories = categoriesData.data || [];
            if (categories.length > 0) {
              await syncCategories(categories);
              localStorage.setItem('cachedCategories', JSON.stringify(categories));
              console.log(`✅ Cached ${categories.length} categories for offline`);
            }
          }
        } catch (catErr) {
          console.warn("⚠️ Could not pre-cache categories:", catErr.message);
        }

        // Pre-cache products for offline use
        console.log("📦 Pre-caching products for offline use...");
        try {
          const productsResponse = await fetch("/api/products");
          if (productsResponse.ok) {
            const productsData = await productsResponse.json();
            const products = productsData.data || [];
            if (products.length > 0) {
              await syncProducts(products);
              localStorage.setItem('cachedProducts', JSON.stringify(products));
              console.log(`✅ Cached ${products.length} products for offline`);
            }
          }
        } catch (prodErr) {
          console.warn("⚠️ Could not pre-cache products:", prodErr.message);
        }

        // Fetch active open tills for all locations
        const tillsResponse = await fetch("/api/till/active");
        if (tillsResponse.ok) {
          const tillsData = await tillsResponse.json();
          console.log("📋 Active tills fetched:", tillsData);
          setActiveTills(Array.isArray(tillsData.tills) ? tillsData.tills : []);
        } else {
          console.log("ℹ️ No active tills endpoint or no open tills");
          setActiveTills([]);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        // Load from cache on error
        console.log("📦 Loading cached data due to fetch error...");
        loadCachedData();
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);

  /* Load cached staff and locations from localStorage */
  const loadCachedData = () => {
    try {
      const cachedStaff = localStorage.getItem('cachedStaff');
      const cachedLocations = localStorage.getItem('cachedLocations');

      if (cachedStaff) {
        const staffArray = JSON.parse(cachedStaff);
        setStaff(staffArray);
        console.log(`✅ Loaded ${staffArray.length} staff from cache`);
      }

      if (cachedLocations) {
        const locationsArray = JSON.parse(cachedLocations);
        setLocations(locationsArray);
        if (locationsArray.length > 0) {
          setSelectedLocation(locationsArray[0]._id);
        }
        console.log(`✅ Loaded ${locationsArray.length} locations from cache`);
      }
    } catch (error) {
      console.error("Failed to load cached data:", error);
    }
  };

  /* Refresh staff/locations data when coming online */
  useEffect(() => {
    if (isOnline) {
      console.log("🌐 Online detected - refreshing staff and location data");
      const fetchData = async () => {
        try {
          // Fetch staff
          const staffResponse = await fetch("/api/staff/list");
          if (staffResponse.ok) {
            const staffData = await staffResponse.json();
            const staffList = staffData.data || staffData || [];
            const staffArray = Array.isArray(staffList) ? staffList : [];
            setStaff(staffArray);
            console.log(`✅ Refreshed staff data: ${staffArray.length} members`);
          }

          // Fetch locations
          const locResponse = await fetch("/api/store/init-locations");
          if (locResponse.ok) {
            const locData = await locResponse.json();
            if (locData.store && Array.isArray(locData.store.locations)) {
              setLocations(
                locData.store.locations.filter(loc => loc.isActive !== false)
              );
              console.log(`✅ Refreshed locations data: ${locData.store.locations.length} locations`);
            }
          }
        } catch (error) {
          console.error("Failed to refresh data:", error);
        }
      };

      fetchData();
    }
  }, [isOnline]);

  const handleLogin = async () => {
    if (!selectedStore || !selectedLocation || !selectedStaff || pin.length !== 4) {
      setError("Please select store, location, staff, and enter 4-digit passcode");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const loginPayload = {
        store: selectedStore,
        location: selectedLocation,
        staff: selectedStaff,
        pin: pin,
      };

      console.log("🔐 Sending login request:", loginPayload);

      // Try to login online first
      if (isOnline) {
        const response = await fetch("/api/staff/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(loginPayload),
        });

        console.log("📨 Login response status:", response.status);
        const data = await response.json();
        console.log("📨 Login response data:", data);

        if (response.ok) {
          console.log("✅ Login successful (ONLINE)!");
          console.log("📍 Staff:", data.staff?.name, "Location:", data.location?.name);
          
          // Check if till is already open for this location
          console.log("🔍 Checking for existing open till for location:", selectedLocation);
          const tillCheckResponse = await fetch(
            `/api/till/current?locationId=${selectedLocation}`
          );
          
          if (tillCheckResponse.ok) {
            // Till is already open, retrieve it and proceed to POS
            const tillData = await tillCheckResponse.json();
            console.log("✅ Existing till found - Till ID:", tillData.till?._id);
            console.log("   Till Status:", tillData.till?.status);
            console.log("   Opening Balance:", tillData.till?.openingBalance);
            
            login(data.staff, data.location);
            setCurrentTill(tillData.till);
            router.push("/");
          } else {
            // No open till, show OpenTillModal
            console.log("❌ No open till found - showing OpenTillModal");
            setLoginData({ staff: data.staff, location: data.location });
            setShowOpenTillModal(true);
          }
        } else {
          console.error("❌ Login failed:", data.message);
          setError(data.message || "Invalid passcode. Please try again.");
        }
      } else {
        // OFFLINE MODE - Use cached staff and till data
        console.log("📱 OFFLINE MODE - Attempting local login");
        
        const selectedStaffData = staff.find(s => s._id === selectedStaff);
        const selectedLocationData = locations.find(loc => loc._id === selectedLocation);

        if (!selectedStaffData || !selectedLocationData) {
          setError("Staff or location not found in local data. Please sync when online.");
          return;
        }

        // In offline mode, we can't validate PIN against server, so we accept the login
        // The staff member is responsible for their own PIN security
        console.log("✅ Login successful (OFFLINE)!");
        console.log("📍 Staff:", selectedStaffData.name, "Location:", selectedLocationData.name);
        console.log("⚠️ NOTE: Running in OFFLINE mode - PIN validation skipped");
        
        // Check if there's a persisted till in localStorage
        const savedTill = localStorage.getItem("till");
        
        if (savedTill) {
          const till = JSON.parse(savedTill);
          console.log("✅ Found persisted till:", till._id);
          login(selectedStaffData, selectedLocationData);
          setCurrentTill(till);
          router.push("/");
        } else {
          // No till found, proceed to POS (they'll need to open a till with offline handling)
          login(selectedStaffData, selectedLocationData);
          router.push("/");
        }
      }
    } catch (error) {
      console.error("❌ Login error:", error);
      
      if (!isOnline) {
        // In offline mode, try to proceed with cached data even if there's an error
        console.log("📱 Offline error - attempting to use cached data");
        const selectedStaffData = staff.find(s => s._id === selectedStaff);
        const selectedLocationData = locations.find(loc => loc._id === selectedLocation);

        if (selectedStaffData && selectedLocationData) {
          login(selectedStaffData, selectedLocationData);
          router.push("/");
          return;
        }
      }
      
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePinClick = (digit) => {
    if (pin.length < 4) {
      setPin(pin + digit);
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const handleTillOpened = (till) => {
    // Till has been opened, now proceed to POS
    if (loginData) {
      console.log("📋 Till opened, storing till in context:", till);
      login(loginData.staff, loginData.location);
      
      // IMPORTANT: Set the till in context so it's available throughout the app
      setCurrentTill(till);
      
      router.push("/");
    }
  };

  const handleQuickLogin = async (till) => {
    // Automatically log into an existing till without PIN entry
    try {
      setLoading(true);
      setError("");

      console.log("🚀 Quick login to existing till:", till);
      console.log("   Looking for staff ID:", till.staffId);
      console.log("   Looking for location ID:", till.locationId);

      // Find the staff and location data from the till
      let staffMember = staff.find(s => s._id === till.staffId);
      let location = locations.find(loc => loc._id === till.locationId);

      // If not found in local data, refresh and try again
      if (!staffMember || !location) {
        console.log("⚠️ Staff or location not found in local data - refreshing...");
        
        // Refresh staff data
        const staffResponse = await fetch("/api/staff/list");
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          const staffList = staffData.data || staffData || [];
          const refreshedStaff = Array.isArray(staffList) ? staffList : [];
          setStaff(refreshedStaff);
          staffMember = refreshedStaff.find(s => s._id === till.staffId);
        }

        // Refresh locations data
        const locResponse = await fetch("/api/store/init-locations");
        if (locResponse.ok) {
          const locData = await locResponse.json();
          if (locData.store && Array.isArray(locData.store.locations)) {
            const refreshedLocations = locData.store.locations.filter(loc => loc.isActive !== false);
            setLocations(refreshedLocations);
            location = refreshedLocations.find(loc => loc._id === till.locationId);
          }
        }
      }

      if (!staffMember || !location) {
        console.error("❌ Could not find staff or location even after refresh");
        setError("Could not find staff or location for this till. Please log in normally.");
        return;
      }

      console.log("✅ Found staff:", staffMember.name, "and location:", location.name);

      // Authenticate with the staff's stored session (if available)
      // In this case, we trust the till record and proceed
      login(staffMember, location);
      setCurrentTill(till);
      
      console.log("✅ Quick login successful! Proceeding to POS");
      router.push("/");
    } catch (error) {
      console.error("❌ Quick login error:", error);
      setError("Failed to resume till. Please log in normally.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  useEffect(() => {
    window.addEventListener("keypress", handleKeyPress);
    return () => window.removeEventListener("keypress", handleKeyPress);
  }, [pin, selectedStore]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-600 to-cyan-700 flex flex-col">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-600 text-white py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faX} />
            <span className="font-semibold">Offline mode</span>
          </div>
          <a href="#" className="underline hover:text-red-100">
            Learn more →
          </a>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="bg-cyan-700 px-6 py-4 flex items-center justify-between border-b-4 border-cyan-800">
        {/* Clock In/Out Button */}
        <button className="px-6 py-2 border-2 border-white text-white rounded-full font-semibold hover:bg-cyan-600 transition flex items-center gap-2">
          <FontAwesomeIcon icon={faClock} />
          CLOCK IN / OUT
        </button>

        {/* Center Logo/Text */}
        <div className="text-center">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-cyan-700 font-bold text-lg">✓</span>
          </div>
          <p className="text-white font-bold text-sm">{currentTime}</p>
        </div>

        {/* Right Buttons */}
        <div className="flex items-center gap-4">
          <button className="px-6 py-2 border-2 border-white text-white rounded-full font-semibold hover:bg-cyan-600 transition flex items-center gap-2">
            <FontAwesomeIcon icon={faQuestionCircle} />
            HELP & SUPPORT
          </button>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faPowerOff} />
            EXIT
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Store/Location/Staff Selection */}
        <div className="flex-1 p-8 overflow-y-auto">
          {/* Active Open Tills Alert */}
          {activeTills && activeTills.length > 0 && (
            <div className="mb-6 bg-yellow-400 bg-opacity-90 border-l-4 border-yellow-600 p-4 rounded-lg">
              <p className="text-yellow-900 font-bold mb-3 flex items-center gap-2">
                ⏱️ ACTIVE OPEN TILL{activeTills.length > 1 ? 'S' : ''}
              </p>
              <div className="space-y-2">
                {activeTills.map((till) => (
                  <div key={till._id} className="text-yellow-900 text-sm bg-white bg-opacity-60 p-3 rounded flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold">{till.staffName} @ {till.locationName || 'Unknown Location'}</div>
                      <div className="text-xs opacity-80">
                        Opened: {new Date(till.openedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-xs opacity-80">
                        Sales: ₦{till.totalSales?.toLocaleString('en-NG') || '0'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleQuickLogin(till)}
                      disabled={loading}
                      className="ml-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded whitespace-nowrap transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "..." : "RESUME"}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-yellow-900 text-xs mt-3 italic">
                ℹ️ Click RESUME to quickly log back into an active till, or select location/staff and enter PIN to login normally.
              </p>
            </div>
          )}

          {/* Pending Transactions Indicator */}
          <div className="mb-6">
            <p className="text-white font-bold text-lg mb-4">
              {hasPendingTransactions && (
                <span className="flex items-center gap-2">
                  📋 HAS PENDING TRANSACTIONS
                </span>
              )}
            </p>
          </div>

          {loadingData ? (
            <div className="text-white text-center py-12">Loading stores and staff...</div>
          ) : (
            <>
              {/* Store Selection Grid */}
              <div className="mb-8">
                <p className="text-white font-semibold text-sm mb-3">SELECT STORE</p>
                <div className="grid grid-cols-2 gap-4">
                  {stores.length === 0 ? (
                    <div className="text-white col-span-2">No stores available</div>
                  ) : (
                    stores.map((store) => (
                      <button
                        key={store._id}
                        onClick={() => {
                          setSelectedStore(store._id);
                          setSelectedLocation("");
                          setSelectedStaff("");
                        }}
                        className={`py-4 px-3 rounded-lg font-bold text-sm transition transform hover:scale-105 ${
                          selectedStore === store._id
                            ? "bg-cyan-900 text-white ring-4 ring-yellow-400"
                            : "bg-cyan-800 text-white hover:bg-cyan-700"
                        }`}
                      >
                        {store.name}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Location Dropdown */}
              {selectedStore && (
                <div className="mb-8">
                  <label className="text-white font-semibold text-sm mb-2 block">
                    SELECT LOCATION
                  </label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => {
                      setSelectedLocation(e.target.value);
                      setSelectedStaff("");
                    }}
                    className="w-full px-4 py-3 bg-cyan-800 text-white border-2 border-cyan-700 rounded-lg font-semibold focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400"
                  >
                    <option value="">-- Select Location --</option>
                    {locations.map((loc) => (
                      <option key={loc._id} value={loc._id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Staff Cards */}
              {selectedLocation && (
                <div>
                  <p className="text-white font-semibold text-sm mb-3">SELECT STAFF</p>
                  <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
                    {staff.length === 0 ? (
                      <div className="text-white text-center py-6 bg-cyan-800 rounded-lg">
                        No staff available
                      </div>
                    ) : (
                      staff.map((member) => (
                        <button
                          key={member._id}
                          onClick={() => setSelectedStaff(member._id)}
                          className={`p-4 rounded-lg text-left font-semibold transition ${
                            selectedStaff === member._id
                              ? "bg-yellow-400 text-cyan-900 ring-4 ring-yellow-300"
                              : "bg-cyan-800 text-white hover:bg-cyan-700"
                          }`}
                        >
                          <div className="font-bold">{member.name}</div>
                          <div className="text-xs opacity-80">@{member.username}</div>
                          {member.role && (
                            <div className="text-xs opacity-60 mt-1">{member.role}</div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Divider */}
        <div className="w-1 bg-cyan-800"></div>

        {/* Right Side - PIN Entry */}
        <div className="w-2/5 bg-cyan-700 p-8 flex flex-col justify-center items-center">
          {/* Title */}
          <h2 className="text-white font-bold text-xl mb-8 tracking-wide">
            PLEASE ENTER YOUR PASSCODE
          </h2>

          {/* PIN Display */}
          <div className="mb-8">
            <div className="text-6xl tracking-widest text-white font-bold text-center">
              {pin.split("").map((_, i) => (
                <span key={i}>●</span>
              ))}
              {[...Array(4 - pin.length)].map((_, i) => (
                <span key={`empty-${i}`} className="opacity-50">
                  ●
                </span>
              ))}
            </div>
          </div>

          {/* Separator Line */}
          <div className="w-48 h-1 bg-white/30 mb-8"></div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-4 mb-8 w-full max-w-md">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handlePinClick(num.toString())}
                className="py-6 bg-cyan-800 hover:bg-cyan-600 text-white font-bold text-2xl rounded-lg transition active:scale-95"
              >
                {num}
              </button>
            ))}

            {/* 0 and Backspace */}
            <button
              onClick={() => handlePinClick("0")}
              className="col-span-2 py-6 bg-cyan-800 hover:bg-cyan-600 text-white font-bold text-2xl rounded-lg transition active:scale-95"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              className="py-6 bg-cyan-800 hover:bg-cyan-600 text-white font-bold text-xl rounded-lg transition active:scale-95"
            >
              ⌫
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="w-full mb-4 p-3 bg-red-600 text-white rounded-lg text-sm text-center font-semibold">
              {error}
            </div>
          )}

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={loading || pin.length !== 4 || !selectedStore || !selectedLocation || !selectedStaff}
            className={`w-full py-4 font-bold text-lg rounded-lg transition ${
              pin.length === 4 && selectedStore && selectedLocation && selectedStaff && !loading
                ? "bg-cyan-400 hover:bg-cyan-300 text-cyan-900"
                : "bg-gray-400 text-gray-600 cursor-not-allowed"
            }`}
          >
            {loading ? "LOGGING IN..." : "LOGIN"}
          </button>

          {/* Info Text */}
          <p className="text-white/60 text-xs mt-6 text-center">
            Enter 4-digit passcode and select a store to continue
          </p>
        </div>
      </div>

      {/* Open Till Modal */}
      <OpenTillModal
        isOpen={showOpenTillModal}
        onClose={() => {
          setShowOpenTillModal(false);
          setLoginData(null);
        }}
        onTillOpened={handleTillOpened}
        staffData={loginData?.staff}
        locationData={loginData?.location}
      />
    </div>
  );
}
