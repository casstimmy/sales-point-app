import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { useStaff } from "../../context/StaffContext";
import OpenTillModal from "../pos/OpenTillModal";
import { syncCategories, syncProducts } from "../../lib/indexedDB";
import { syncPendingTillOpens, syncPendingTillCloses, syncPendingTransactions } from "../../lib/offlineSync";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClock,
  faQuestionCircle,
  faPowerOff,
  faX,
  faRedo,
  faSync,
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
  const { login, setCurrentTill, setCachedTenders } = useStaff();

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
  const [pendingTillCloseIds, setPendingTillCloseIds] = useState([]);
  const [syncingPendingCloses, setSyncingPendingCloses] = useState(false);

  const getPendingTillCloseIds = async () => {
    try {
      const request = indexedDB.open('SalesPOS', 2);
      return await new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('till_closes')) {
            resolve([]);
            return;
          }
          const tx = db.transaction(['till_closes', 'till_opens'], 'readonly');
          const store = tx.objectStore('till_closes');
          const opensStore = tx.objectStore('till_opens');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const closes = getAll.result || [];
            const pendingIds = closes
              .filter(close => close && close.synced !== true)
              .map(close => String(close._id));
            const mapPromises = pendingIds.map((id) => new Promise((res) => {
              if (!id.startsWith('offline-till-')) return res(null);
              const openReq = opensStore.get(id);
              openReq.onsuccess = () => {
                res(openReq.result?.serverTillId ? String(openReq.result.serverTillId) : null);
              };
              openReq.onerror = () => res(null);
            }));
            Promise.all(mapPromises).then((mapped) => {
              const combined = new Set(pendingIds);
              mapped.filter(Boolean).forEach(id => combined.add(id));
              resolve([...combined]);
            });
          };
          getAll.onerror = () => reject(getAll.error);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('Failed to read pending till closes:', err);
      return [];
    }
  };

  const refreshPendingTillCloseIds = async () => {
    const ids = await getPendingTillCloseIds();
    setPendingTillCloseIds(ids);
    return ids;
  };

  const handleSyncPendingCloses = async () => {
    if (!isOnline || syncingPendingCloses) return;
    setSyncingPendingCloses(true);
    try {
      await syncPendingTillOpens();
      await syncPendingTransactions();
      await syncPendingTillCloses();
      await refreshPendingTillCloseIds();
    } catch (err) {
      console.warn('⚠️ Pending close sync failed:', err?.message || err);
    } finally {
      setSyncingPendingCloses(false);
    }
  };

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
        console.log("🔄 [LOGIN] Starting data fetch...");
        
        // If offline, load from cache immediately
        if (!navigator.onLine) {
          console.log("📱 OFFLINE MODE - Loading cached data...");
          loadCachedData();
          setLoadingData(false);
          return;
        }
        
        const preloadTendersForLocations = async (locationsList = []) => {
          if (!locationsList.length) return;
          await Promise.all(
            locationsList.map(async (loc) => {
              if (!loc?._id) return;
              try {
                const tendersRes = await fetch('/api/location/tenders?locationId=' + loc._id);
                if (!tendersRes.ok) return;
                const tendersData = await tendersRes.json();
                if (tendersData?.success) {
                  setCachedTenders(loc._id, tendersData.tenders || []);
                }
              } catch (err) {
                // ignore tender preload errors
              }
            })
          );
        };

        // Step 1: Fetch store and locations
        console.log("🔄 [LOGIN] Fetching store and locations...");
        const response = await fetch("/api/store/init-locations");
        console.log(`📡 [LOGIN] Store API response status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log("📦 [LOGIN] Store API response data:", data);
          
          // Store is returned as an object with locations array
          if (data.store) {
            console.log(`✅ [LOGIN] Store found: "${data.store.storeName}"`);
            const storeObj = {
              _id: data.store._id,
              name: data.store.storeName || data.store.companyName || "Default Store",
            };
            setStores([storeObj]);
            setSelectedStore(storeObj._id);
            // Cache store for offline use
            localStorage.setItem('cachedStore', JSON.stringify(storeObj));
            
            // Set locations from store
            if (Array.isArray(data.store.locations)) {
              const activeLocations = data.store.locations.filter(loc => loc.isActive !== false);
              console.log(`✅ [LOGIN] Found ${activeLocations.length} active locations:`, activeLocations.map(l => l.name));
              setLocations(activeLocations);
              // Cache locations for offline use
              localStorage.setItem('cachedLocations', JSON.stringify(activeLocations));
              // Store metadata about when locations were synced
              localStorage.setItem('locations_metadata', JSON.stringify({
                lastSynced: new Date().toISOString(),
                count: activeLocations.length,
                locationNames: activeLocations.map(l => l.name)
              }));
              console.log(`💾 Locations cached for offline access (${activeLocations.length} locations)`);
              preloadTendersForLocations(activeLocations);
              // Auto-select first location
              if (activeLocations.length > 0) {
                setSelectedLocation(activeLocations[0]._id);
              }
            }
          }
        } else {
          console.error(`❌ [LOGIN] Store API error: ${response.status}`);
        }
        
        // Step 2: Fetch staff members
        console.log("🔄 [LOGIN] Fetching staff members...");
        const staffResponse = await fetch("/api/staff/list");
        console.log(`📡 [LOGIN] Staff API response status: ${staffResponse.status}`);
        
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          console.log("📦 [LOGIN] Staff API response data:", staffData);
          
          // API returns { success: true, count: X, data: [...] }
          const staffList = staffData.data || staffData || [];
          const staffArray = Array.isArray(staffList) ? staffList : [];
          console.log(`✅ [LOGIN] Found ${staffArray.length} staff members:`, staffArray.map(s => ({ name: s.name, role: s.role })));
          
          setStaff(staffArray);
          // Cache staff for offline use
          localStorage.setItem('cachedStaff', JSON.stringify(staffArray));
          console.log(`✅ [LOGIN] Cached ${staffArray.length} staff members`);
        } else {
          console.error(`❌ [LOGIN] Staff API error: ${staffResponse.status}`);
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

        // Try to sync any pending offline data before showing active tills
        try {
          await syncPendingTillOpens();
          await syncPendingTransactions();
          await syncPendingTillCloses();
        } catch (syncErr) {
          console.warn('⚠️ Login preload sync failed:', syncErr?.message || syncErr);
        }

        // Fetch active open tills for all locations
        const tillsResponse = await fetch("/api/till/active");
        if (tillsResponse.ok) {
          const tillsData = await tillsResponse.json();
          console.log("📋 Active tills fetched:", tillsData);
          const pendingCloseIds = await refreshPendingTillCloseIds();
          const tillsList = Array.isArray(tillsData.tills) ? tillsData.tills : [];
          const filtered = pendingCloseIds.length
            ? tillsList.filter(till => !pendingCloseIds.includes(String(till?._id)))
            : tillsList;
          setActiveTills(filtered);
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
      const cachedLocationsMetadata = localStorage.getItem('locations_metadata');
      const cachedStore = localStorage.getItem('cachedStore');

      // Load cached store first
      if (cachedStore) {
        const storeObj = JSON.parse(cachedStore);
        setStores([storeObj]);
        setSelectedStore(storeObj._id);
        console.log(`✅ Loaded store from cache: ${storeObj.name}`);
      } else {
        // Create a default store for offline mode if none cached
        const defaultStore = { _id: 'offline-store', name: 'Offline Store' };
        setStores([defaultStore]);
        setSelectedStore(defaultStore._id);
        console.log(`📦 Using default offline store`);
      }

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
        console.log(`📍 Locations available offline: ${locationsArray.map(l => l.name).join(', ')}`);
      } else {
        console.log(`⚠️ No cached locations found. Please sync when online.`);
      }

      // Log metadata about cached data
      if (cachedLocationsMetadata) {
        try {
          const metadata = JSON.parse(cachedLocationsMetadata);
          console.log(`⏱️ Locations last synced: ${new Date(metadata.lastSynced).toLocaleString()}`);
        } catch (e) {
          console.warn("Could not parse metadata:", e);
        }
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

  const attemptOfflineLogin = useCallback((reason) => {
    console.log(`📱 OFFLINE LOGIN - ${reason}`);
    console.log(`   Available locations from cache: ${locations.map(l => l.name).join(', ')}`);
    console.log(`   Available staff from cache: ${staff.map(s => s.name).join(', ')}`);

    const selectedStaffData = staff.find(s => s._id === selectedStaff);
    const selectedLocationData = locations.find(loc => loc._id === selectedLocation);

    if (!selectedStaffData || !selectedLocationData) {
      const missingItem = !selectedStaffData ? 'Staff' : 'Location';
      console.error(`❌ ${missingItem} not found in local cached data`);
      setError(`${missingItem} data not available offline. Please sync with server when online.`);
      return false;
    }

    console.log("✅ Login successful (OFFLINE MODE)!");
    console.log("📍 Staff:", selectedStaffData.name, "Location:", selectedLocationData.name);
    console.log("⚠️ NOTE: Running in OFFLINE mode - PIN validation skipped");

    const savedTill = localStorage.getItem("till");
    if (savedTill) {
      const till = JSON.parse(savedTill);
      console.log("✅ Found persisted till:", till._id);
      login(selectedStaffData, selectedLocationData);
      setCurrentTill(till);
      router.push("/");
      return true;
    }

    login(selectedStaffData, selectedLocationData);
    router.push("/");
    return true;
  }, [locations, staff, selectedStaff, selectedLocation, login, setCurrentTill, router, setError]);

  const handleLogin = useCallback(async () => {
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
          
          // Sync pending offline till/transactions before checking current till
          try {
            await syncPendingTillOpens();
            await syncPendingTransactions();
            await syncPendingTillCloses();
          } catch (err) {
            console.warn('⚠️ Sync before till check failed:', err?.message || err);
          }

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
          if (!navigator.onLine && attemptOfflineLogin("Connection lost during login")) {
            return;
          }
          setError(data.message || "Invalid passcode. Please try again.");
        }
      } else {
        // OFFLINE MODE - Use cached staff and till data
        if (attemptOfflineLogin("Offline mode")) {
          return;
        }
      }
    } catch (error) {
      console.error("❌ Login error:", error);

      if (attemptOfflineLogin("Network error")) {
        return;
      }

      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedStore, selectedLocation, selectedStaff, pin, isOnline, login, setCurrentTill, router, attemptOfflineLogin]);

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

  const handleKeyPress = useCallback((e) => {
    if (e.key === "Enter" && pin.length === 4 && selectedStore && selectedLocation && selectedStaff) {
      handleLogin();
    }
  }, [pin, selectedStore, selectedLocation, selectedStaff, handleLogin]);

  useEffect(() => {
    window.addEventListener("keypress", handleKeyPress);
    return () => window.removeEventListener("keypress", handleKeyPress);
  }, [handleKeyPress]);

  // Handle refresh of store/location data
  const handleRefreshData = async () => {
    setLoadingData(true);
    try {
      // Try online first
      if (isOnline) {
        const storeResponse = await fetch("/api/store/init-locations");
        if (storeResponse.ok) {
          const storeData = await storeResponse.json();
          if (storeData.store) {
            setStores([storeData.store]);
            setSelectedStore(storeData.store._id);
            const activeLocations = storeData.store.locations?.filter(loc => loc.isActive !== false) || [];
            setLocations(activeLocations);
            // Cache locations for offline use
            localStorage.setItem("cachedLocations", JSON.stringify(activeLocations));
            localStorage.setItem("locations_metadata", JSON.stringify({
              lastSynced: new Date().toISOString(),
              count: activeLocations.length,
              locationNames: activeLocations.map(l => l.name)
            }));
            console.log("✅ Refreshed locations from cloud and cached for offline");
            if (activeLocations.length) {
              await Promise.all(
                activeLocations.map(async (loc) => {
                  if (!loc?._id) return;
                  try {
                    const tendersRes = await fetch('/api/location/tenders?locationId=' + loc._id);
                    if (!tendersRes.ok) return;
                    const tendersData = await tendersRes.json();
                    if (tendersData?.success) {
                      setCachedTenders(loc._id, tendersData.tenders || []);
                    }
                  } catch (err) {
                    // ignore tender preload errors
                  }
                })
              );
            }
          }
        }
        
        const staffResponse = await fetch("/api/staff/list");
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          const staffList = staffData.data || staffData || [];
          const refreshedStaff = Array.isArray(staffList) ? staffList : [];
          setStaff(refreshedStaff);
          localStorage.setItem("staff", JSON.stringify(refreshedStaff));
          console.log("✅ Refreshed staff from cloud");
        }
      } else {
        // Offline - load from localStorage
        loadCachedData();
        console.log("📱 Refreshed data from local storage (offline)");
      }
    } catch (error) {
      console.error("Failed to refresh data:", error);
      loadCachedData();
    } finally {
      setLoadingData(false);
    }
  };

  // Handle exit/close system
  const handleExitSystem = () => {
    if (typeof window !== 'undefined') {
      // Try to close window (works if opened as popup)
      window.close();
      // If window.close() doesn't work (main window), redirect to blank
      setTimeout(() => {
        window.location.href = "about:blank";
      }, 100);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-b from-cyan-600 to-cyan-700 flex flex-col overflow-hidden">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-600 text-white py-1 px-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faX} className="w-3 h-3" />
            <span className="font-semibold text-sm">Offline mode</span>
          </div>
          <a href="#" className="underline hover:text-red-100 text-sm">
            Learn more →
          </a>
        </div>
      )}

      {/* Pending Till Close Banner */}
      {isOnline && pendingTillCloseIds.length > 0 && (
        <div className="bg-yellow-500 text-yellow-900 py-2 px-4 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-sm font-semibold">
            Pending till close sync: {pendingTillCloseIds.length}
          </div>
          <button
            onClick={handleSyncPendingCloses}
            disabled={syncingPendingCloses}
            className="px-4 py-1.5 bg-yellow-700 hover:bg-yellow-800 text-white rounded text-sm font-bold transition disabled:opacity-60"
          >
            {syncingPendingCloses ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="bg-cyan-700 px-4 py-2 flex items-center justify-between border-b-4 border-cyan-800 flex-shrink-0">
        {/* Clock In/Out Button */}
        <button className="px-4 py-1.5 border-2 border-white text-white rounded-full font-semibold text-sm hover:bg-cyan-600 transition flex items-center gap-2">
          <FontAwesomeIcon icon={faClock} className="w-4 h-4" />
          CLOCK IN / OUT
        </button>

        {/* Center Logo */}
        <div className="text-center flex flex-col items-center">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto mb-1 shadow-lg overflow-hidden relative">
            <Image 
              src="/images/st-micheals-logo.png" 
              alt="Store Logo" 
              width={32}
              height={32}
              className="object-contain"
              onError={(e) => {
                e.target.src = '/images/placeholder.jpg';
              }}
              unoptimized
            />
          </div>
          <p className="text-white font-bold text-xs">{currentTime}</p>
        </div>

        {/* Right Buttons */}
        <div className="flex items-center gap-3">
          <button className="px-4 py-1.5 border-2 border-white text-white rounded-full font-semibold text-sm hover:bg-cyan-600 transition flex items-center gap-2">
            <FontAwesomeIcon icon={faQuestionCircle} className="w-4 h-4" />
            HELP
          </button>
          <button
            onClick={handleExitSystem}
            className="px-4 py-1.5 bg-red-600 text-white rounded-full font-semibold text-sm hover:bg-red-700 transition flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faPowerOff} className="w-4 h-4" />
            EXIT
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Side - Store/Location/Staff Selection */}
        <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-cyan-600 to-cyan-700">
          {/* Active Open Tills Alert */}
          {activeTills && activeTills.length > 0 && (
            <div className="mb-4 bg-yellow-400 bg-opacity-90 border-l-4 border-yellow-600 p-3 rounded-lg">
              <p className="text-yellow-900 font-bold mb-2 flex items-center gap-2 text-sm">
                ⏱️ ACTIVE OPEN TILL{activeTills.length > 1 ? 'S' : ''}
              </p>
              <div className="space-y-2">
                {activeTills.map((till) => (
                  <div key={till._id} className="text-yellow-900 text-xs bg-white bg-opacity-60 p-2 rounded flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold">{till.staffName} @ {till.locationName || 'Unknown Location'}</div>
                      <div className="text-xs opacity-80">
                        Opened: {new Date(till.openedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        {' | '}Sales: ₦{till.totalSales?.toLocaleString('en-NG') || '0'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleQuickLogin(till)}
                      disabled={loading}
                      className="ml-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded whitespace-nowrap transition disabled:opacity-50"
                    >
                      {loading ? "..." : "RESUME"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Transactions Indicator */}
          {hasPendingTransactions && (
            <div className="mb-4">
              <p className="text-white font-bold text-sm flex items-center gap-2">
                📋 HAS PENDING TRANSACTIONS
              </p>
            </div>
          )}

          {loadingData ? (
            <div className="text-white text-center py-8 text-sm">Loading stores and staff...</div>
          ) : (
            <>
              {/* Sync Locations Button - Always Visible */}
              <div className="mb-4 p-3 bg-cyan-800 rounded-lg border-2 border-cyan-600">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold text-xs">
                    {isOnline ? '🌐 ONLINE' : '📴 OFFLINE MODE'}
                  </span>
                  <span className="text-cyan-300 text-xs">
                    {locations.length} location{locations.length !== 1 ? 's' : ''} cached
                  </span>
                </div>
                <button
                  onClick={handleRefreshData}
                  disabled={loadingData}
                  className="w-full px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-cyan-900 font-bold rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-md"
                >
                  <FontAwesomeIcon icon={faSync} className={`w-4 h-4 flex-shrink-0 ${loadingData ? 'animate-spin' : ''}`} />
                  <span>{loadingData ? 'Syncing...' : (isOnline ? 'Sync Data from Cloud' : 'Load Cached Data')}</span>
                </button>
                {/* Sync Status */}
                {(() => {
                  try {
                    const metadata = JSON.parse(localStorage.getItem('locations_metadata') || '{}');
                    if (metadata.lastSynced) {
                      const syncDate = new Date(metadata.lastSynced);
                      const timeAgo = Math.round((Date.now() - syncDate.getTime()) / 60000);
                      return (
                        <p className="text-xs text-cyan-300 mt-2 text-center">
                          Last synced: {timeAgo < 60 ? `${timeAgo} mins ago` : syncDate.toLocaleString()}
                        </p>
                      );
                    }
                    return <p className="text-xs text-yellow-300 mt-2 text-center">⚠️ Never synced - click to sync</p>;
                  } catch (e) {
                    return null;
                  }
                })()}
              </div>

              {/* Store Selection Grid */}
              <div className="mb-4">
                <p className="text-white font-semibold text-xs mb-2">SELECT STORE</p>
                <div className="grid grid-cols-2 gap-2">
                  {stores.length === 0 ? (
                    <div className="text-white col-span-2 text-sm">No stores available</div>
                  ) : (
                    stores.map((store) => (
                      <button
                        key={store._id}
                        onClick={() => {
                          setSelectedStore(store._id);
                          setSelectedLocation("");
                          setSelectedStaff("");
                        }}
                        className={`py-2 px-2 rounded-lg font-bold text-xs transition transform hover:scale-105 ${
                          selectedStore === store._id
                            ? "bg-cyan-900 text-white ring-2 ring-yellow-400"
                            : "bg-cyan-800 text-white hover:bg-cyan-700"
                        }`}
                      >
                        {store.name}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Location Dropdown with Refresh Button */}
              {(selectedStore || locations.length > 0) && (
                <div className="mb-4">
                  <label className="text-white font-semibold text-xs mb-1 block">
                    SELECT LOCATION {!isOnline && <span className="text-yellow-300">(Cached)</span>}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedLocation}
                      onChange={(e) => {
                        setSelectedLocation(e.target.value);
                        setSelectedStaff("");
                      }}
                      className="flex-1 px-3 py-2 bg-cyan-800 text-white border-2 border-cyan-700 rounded-lg font-semibold text-sm focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400"
                    >
                      <option value="">-- Select Location ({locations.length} available) --</option>
                      {locations.map((loc) => (
                        <option key={loc._id} value={loc._id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleRefreshData}
                      disabled={loadingData}
                      className="px-3 py-2 bg-cyan-800 hover:bg-cyan-600 text-white rounded-lg transition border-2 border-cyan-700 disabled:opacity-50"
                      title="Refresh locations from cloud/local"
                    >
                      <FontAwesomeIcon icon={faRedo} className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  {locations.length === 0 && (
                    <p className="text-yellow-300 text-xs mt-2 text-center">
                      ⚠️ No locations cached. Please sync when online.
                    </p>
                  )}
                </div>
              )}

              {/* Staff Cards */}
              {selectedLocation && (
                <div>
                  <p className="text-white font-semibold text-xs mb-2">SELECT STAFF</p>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {staff.length === 0 ? (
                      <div className="text-white text-center py-4 bg-cyan-800 rounded-lg text-sm">
                        No staff available
                      </div>
                    ) : (
                      staff.map((member) => (
                        <button
                          key={member._id}
                          onClick={() => setSelectedStaff(member._id)}
                          className={`p-2 rounded-lg text-left font-semibold transition text-sm ${
                            selectedStaff === member._id
                              ? "bg-yellow-400 text-cyan-900 ring-2 ring-yellow-300"
                              : "bg-cyan-800 text-white hover:bg-cyan-700"
                          }`}
                        >
                          <div className="font-bold text-sm">{member.name}</div>
                          <div className="text-xs opacity-80">@{member.username}</div>
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
        <div className="w-0.5 bg-cyan-800"></div>

        {/* Right Side - PIN Entry */}
        <div className="w-2/5 bg-cyan-700 p-4 flex flex-col justify-center items-center">
          {/* Title */}
          <h2 className="text-white font-bold text-lg mb-4 tracking-wide">
            PLEASE ENTER YOUR PASSCODE
          </h2>

          {/* PIN Display */}
          <div className="mb-4">
            <div className="text-4xl tracking-widest text-white font-bold text-center">
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
          <div className="w-48 h-0.5 bg-white/30 mb-4"></div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2 mb-4 w-full max-w-xs">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handlePinClick(num.toString())}
                className="py-3 bg-cyan-800 hover:bg-cyan-600 text-white font-bold text-xl rounded-lg transition active:scale-95"
              >
                {num}
              </button>
            ))}

            {/* 0 and Backspace */}
            <button
              onClick={() => handlePinClick("0")}
              className="col-span-2 py-3 bg-cyan-800 hover:bg-cyan-600 text-white font-bold text-xl rounded-lg transition active:scale-95"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              className="py-3 bg-cyan-800 hover:bg-cyan-600 text-white font-bold text-lg rounded-lg transition active:scale-95"
            >
              ⌫
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="w-full max-w-xs mb-3 p-2 bg-red-600 text-white rounded-lg text-xs text-center font-semibold">
              {error}
            </div>
          )}

          {/* Login Button - Same width as keypad */}
          <button
            onClick={handleLogin}
            disabled={loading || pin.length !== 4 || !selectedStore || !selectedLocation || !selectedStaff}
            className={`w-full max-w-xs py-3 font-bold text-base rounded-lg transition ${
              pin.length === 4 && selectedStore && selectedLocation && selectedStaff && !loading
                ? "bg-cyan-400 hover:bg-cyan-300 text-cyan-900"
                : "bg-gray-400 text-gray-600 cursor-not-allowed"
            }`}
          >
            {loading ? "LOGGING IN..." : "LOGIN"}
          </button>

          {/* Info Text */}
          <p className="text-white/60 text-xs mt-3 text-center">
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

