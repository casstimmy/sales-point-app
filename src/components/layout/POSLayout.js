/**
 * POSLayout - Main POS Layout
 * 
 * Database-driven layout for professional POS system.
 * Provides: CartProvider, Sidebar, TopBar, Screen content, CartPanel
 * Fetches store, staff, and till information from database.
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { useStaff } from "../../context/StaffContext";
import TopBar from "../pos/TopBar";
import TabNavigation from "../pos/TabNavigation";
import Sidebar from "../pos/Sidebar";
import CartPanel from "../pos/CartPanel";
import { CartProvider } from "../../context/CartContext";
import { useErrorHandler } from "../../hooks/useErrorHandler";
import { saveUiSettings } from "@/src/lib/uiSettings";
import { getUiSettings } from "@/src/lib/uiSettings";

export default function POSLayout({ children }) {
  const router = useRouter();
  const { staff, logout } = useStaff();
  const { handleApiError, forceLoginRedirect } = useErrorHandler();
  const [storeData, setStoreData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("MENU");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState(getUiSettings());

  // Check authentication - redirect to login if not logged in
  useEffect(() => {
    if (!staff) {
      console.log("⚠️ No staff logged in - redirecting to login page");
      router.push("/");
      return;
    }
  }, [staff, router]);

  // Fetch store and till data from database
  useEffect(() => {
    const fetchStoreData = async () => {
      try {
        const response = await fetch("/api/store/init");
        
        // Check for auth errors
        const { ok: isOk, error } = await handleApiError(response, {
          context: 'POSLayout - fetchStoreData',
          showAlert: false
        });
        
        if (!isOk) {
          // If auth error, handleApiError will trigger logout
          // Use defaults for other errors
          setStoreData({
            name: "Store Name",
            tillId: "Till_001",
            location: "Store Location",
          });
          setLoading(false);
          return;
        }
        
        const data = await response.json();
        setStoreData(data);
      } catch (err) {
        console.error("Failed to fetch store data:", err);
        // Use defaults if API fails
        setStoreData({
          name: "Store Name",
          tillId: "Till_001",
          location: "Store Location",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStoreData();
  }, [handleApiError]);

  useEffect(() => {
    const fetchUiSettings = async () => {
      if (!staff?.storeId) return;
      try {
        const res = await fetch(`/api/ui-settings?storeId=${staff.storeId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.settings) {
          saveUiSettings(data.settings);
        }
      } catch (err) {
        // Keep local settings if offline
      }
    };

    fetchUiSettings();
  }, [staff?.storeId]);

  useEffect(() => {
    const handleSettingsUpdate = (event) => {
      if (event?.detail) {
        setUiSettings(event.detail);
      } else {
        setUiSettings(getUiSettings());
      }
    };

    handleSettingsUpdate();
    window.addEventListener('uiSettings:updated', handleSettingsUpdate);
    return () => window.removeEventListener('uiSettings:updated', handleSettingsUpdate);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('staffMember');
    localStorage.removeItem('staffToken');
    logout();
    router.push("/");
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const densityClass = {
    compact: "text-[15px]",
    comfortable: "text-[17px]",
    spacious: "text-[19px]",
  }[uiSettings.layout?.contentDensity || "comfortable"] || "text-[17px]";

  const sidebarWidths = {
    compact: { desktop: "w-48", mobile: "w-40" },
    standard: { desktop: "w-56", mobile: "w-48" },
    wide: { desktop: "w-64", mobile: "w-56" },
  }[uiSettings.layout?.sidebarWidth || "standard"] || { desktop: "w-56", mobile: "w-48" };

  const cartPanelWidthClass = {
    compact: "w-[32%] min-w-[320px]",
    standard: "w-[37%] min-w-[360px]",
    wide: "w-[42%] min-w-[400px]",
  }[uiSettings.layout?.cartPanelWidth || "standard"] || "w-[37%] min-w-[360px]";

  // Show loading screen if not staff is not set yet
  if (!staff && loading === false) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-gradient-to-br from-cyan-600 to-cyan-700">
        <div className="text-center">
          {/* Logo */}
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg overflow-hidden">
            <Image 
              src="/images/st-micheals-logo.png" 
              alt="Store Logo" 
              width={56}
              height={56}
              className="object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/images/placeholder.jpg';
              }}
              unoptimized
            />
          </div>
          <div className="text-white font-semibold text-base mb-2">Not Logged In</div>
          <div className="text-cyan-200 text-xs">Redirecting to login page...</div>
          
          {/* Progress Bar */}
          <div className="w-40 h-1.5 bg-cyan-900 rounded-full mx-auto mt-4 overflow-hidden">
            <div className="h-full bg-cyan-300 rounded-full animate-pulse" style={{ width: '80%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-cyan-600 to-cyan-700">
        <div className="text-center">
          {/* Logo */}
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
            <Image 
              src="/images/st-micheals-logo.png" 
              alt="Store Logo" 
              width={70}
              height={70}
              className="object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/images/placeholder.jpg';
              }}
              unoptimized
            />
          </div>
          
          {/* Loading Text */}
          <p className="text-white font-semibold text-base mb-3">Loading POS System...</p>
          
          {/* Progress Bar */}
          <div className="w-40 h-1.5 bg-cyan-900 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-cyan-300 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CartProvider>
      <div className={`flex h-screen bg-neutral-50 flex-col md:flex-row ${densityClass}`}>
        {/* Left Sidebar - Overlay Mode */}
        <div className="fixed inset-y-0 left-0 z-50">
          <Sidebar
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            widthClass={sidebarWidths?.desktop}
            mobileWidthClass={sidebarWidths?.mobile}
          />
        </div>

        {/* Overlay Backdrop */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={toggleSidebar}
          />
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden gap-0">
          {/* Left: TopBar + Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Bar - Store info and staff details */}
            <TopBar 
              onLogout={handleLogout}
              storeData={storeData}
              staffData={staff}
              onToggleSidebar={toggleSidebar}
            />

            {/* Screen content */}
            <div className="flex-1 overflow-auto">
              {React.cloneElement(children, { activeTab, onTabChange: setActiveTab })}
            </div>
          </div>

          {/* Right: TabNavigation + CartPanel - Full Height - 37% Width */}
          <div className={`hidden lg:flex ${cartPanelWidthClass} bg-white flex-col border-l border-neutral-200 overflow-hidden`}>
            {/* Tab Navigation - Screen Switching */}
            <div className="px-3 py-3 flex-shrink-0">
              <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
            </div>

            {/* Cart Panel - Takes remaining height */}
            <div className="flex-1 overflow-y-auto">
              <CartPanel />
            </div>
          </div>
        </div>

        {/* Mobile: TabNavigation + Cart Panel (Bottom Sheet - Hidden on desktop) */}
        <div className="lg:hidden border-t border-neutral-200 bg-white flex flex-col">
          {/* Tab Navigation */}
          <div className="px-4 py-3 flex-shrink-0 border-b border-neutral-200">
            <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
          
          {/* Cart Panel */}
          <div className="max-h-[60vh] min-h-[40vh] overflow-y-auto flex-1">
            <CartPanel />
          </div>
        </div>
      </div>
    </CartProvider>
  );
}
