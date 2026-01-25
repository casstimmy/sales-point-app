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

export default function POSLayout({ children }) {
  const router = useRouter();
  const { staff, logout } = useStaff();
  const [storeData, setStoreData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("MENU");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        if (response.ok) {
          const data = await response.json();
          setStoreData(data);
        }
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

  // Show loading screen if not staff is not set yet
  if (!staff && loading === false) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-gradient-to-br from-cyan-600 to-cyan-700">
        <div className="text-center">
          {/* Logo */}
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
            <Image 
              src="/images/st-micheals-logo.png" 
              alt="Store Logo" 
              width={64}
              height={64}
              className="object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/images/placeholder.jpg';
              }}
              unoptimized
            />
          </div>
          <div className="text-white font-semibold text-lg mb-2">Not Logged In</div>
          <div className="text-cyan-200 text-sm">Redirecting to login page...</div>
          
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
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg overflow-hidden">
            <Image 
              src="/images/st-micheals-logo.png" 
              alt="Store Logo" 
              width={80}
              height={80}
              className="object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/images/placeholder.jpg';
              }}
              unoptimized
            />
          </div>
          
          {/* Loading Text */}
          <p className="text-white font-semibold text-lg mb-4">Loading POS System...</p>
          
          {/* Progress Bar */}
          <div className="w-48 h-2 bg-cyan-900 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-cyan-300 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CartProvider>
      <div className="flex h-screen bg-neutral-50 flex-col md:flex-row">
        {/* Left Sidebar - Overlay Mode */}
        <div className="fixed inset-y-0 left-0 z-50">
          <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
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
          <div className="hidden lg:flex w-[37%] min-w-[360px] bg-white flex-col border-l border-neutral-200 overflow-hidden">
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
          <div className="max-h-96 overflow-y-auto flex-1">
            <CartPanel />
          </div>
        </div>
      </div>
    </CartProvider>
  );
}
