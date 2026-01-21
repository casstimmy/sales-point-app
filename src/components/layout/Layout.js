/**
 * Main Layout Component - POS System
 * 
 * Handles authentication and routes to appropriate layout.
 * Uses StaffLogin for auth and EpoNowLayout for POS interface.
 */

import { useEffect, useState } from "react";
import StaffLogin from "./StaffLogin";
import POSLayout from "./POSLayout";
import { useStaff } from "../../context/StaffContext";

const Layout = ({ children }) => {
  const { staff } = useStaff();
  const [isMounted, setIsMounted] = useState(false);

  // Prevent hydration mismatch - ensure client-side rendering
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-gradient-to-br from-neutral-50 to-neutral-100">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-neutral-300 border-t-secondary-500"></div>
          </div>
          <div>
            <p className="text-neutral-800 font-semibold text-lg">Loading POS System</p>
            <p className="text-neutral-500 text-sm mt-2">Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!staff) {
    return <StaffLogin />;
  }

  // Show POS layout with children
  return (
    <POSLayout>
      {children}
    </POSLayout>
  );
};

export default Layout;
