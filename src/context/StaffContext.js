import { createContext, useContext, useEffect, useState } from "react";

const StaffContext = createContext();

export function StaffProvider({ children }) {
  const [staff, setStaff] = useState(null);
  const [location, setLocation] = useState(null);
  const [till, setTill] = useState(null); // Current till session
  const [shift, setShift] = useState({
    start: null,
    salesCount: 0,
  });
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from storage (client-side only) - prevents hydration mismatch
  useEffect(() => {
    try {
      const savedStaff = localStorage.getItem("staff");
      const savedLocation = localStorage.getItem("location");
      const savedShift = localStorage.getItem("shift");
      const savedTill = localStorage.getItem("till");

      if (savedStaff) setStaff(JSON.parse(savedStaff));
      if (savedLocation) setLocation(JSON.parse(savedLocation));
      if (savedShift) setShift(JSON.parse(savedShift));
      if (savedTill) setTill(JSON.parse(savedTill));
    } catch (error) {
      console.error("Failed to load staff data from storage:", error);
    }
    setIsHydrated(true);
  }, []);

  // Persist to storage
  useEffect(() => {
    if (isHydrated) {
      try {
        if (staff) {
          localStorage.setItem("staff", JSON.stringify(staff));
        }
        if (location) {
          localStorage.setItem("location", JSON.stringify(location));
        }
        if (till) {
          console.log('💾 Persisting till to localStorage:', till._id);
          localStorage.setItem("till", JSON.stringify(till));
          console.log('✅ Till persisted to localStorage');
        }
        localStorage.setItem("shift", JSON.stringify(shift));
      } catch (error) {
        console.error("Failed to save staff data to storage:", error);
      }
    }
  }, [staff, location, shift, till, isHydrated]);

  const login = (staffData, locationData) => {
    setStaff(staffData);
    setLocation(locationData);
    setShift({
      start: new Date().toISOString(),
      salesCount: 0,
    });
  };

  const setCachedTenders = (locationId, tenders) => {
    if (isHydrated) {
      localStorage.setItem(`tenders_${locationId}`, JSON.stringify(tenders));
      console.log(`✅ Cached ${tenders.length} tenders for location ${locationId}`);
    }
  };

  const getCachedTenders = (locationId) => {
    try {
      const cached = localStorage.getItem(`tenders_${locationId}`);
      if (cached) {
        const tenders = JSON.parse(cached);
        console.log(`✅ Retrieved ${tenders.length} cached tenders for location ${locationId}`);
        return tenders;
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to get cached tenders:', error);
      return null;
    }
  };

  const logout = () => {
    setStaff(null);
    setLocation(null);
    // NOTE: Do NOT clear till on logout - it should persist for next staff to use
    setShift({ start: null, salesCount: 0 });
    localStorage.removeItem("staff");
    localStorage.removeItem("location");
    localStorage.removeItem("shift");
    // NOTE: Do NOT remove till from localStorage - it should persist across logouts
  };

  const setCurrentTill = (tillData) => {
    if (tillData) {
      console.log('💾 Setting till in context:', tillData._id);
      console.log('   Till ID:', tillData._id);
      console.log('   Till status:', tillData.status);
    } else {
      console.log('💾 Clearing till from context');
    }
    setTill(tillData);
  };

  const incrementSales = () => {
    setShift((s) => ({ ...s, salesCount: s.salesCount + 1 }));
  };

  return (
    <StaffContext.Provider
      value={{ staff, location, till, shift, login, logout, setCurrentTill, incrementSales, setCachedTenders, getCachedTenders }}
    >
      {children}
    </StaffContext.Provider>
  );
}

export const useStaff = () => useContext(StaffContext);
