/**
 * POSLayout - Main POS Layout
 * 
 * Database-driven layout for professional POS system.
 * Provides: CartProvider, Sidebar, TopBar, Screen content, CartPanel
 * Fetches store, staff, and till information from database.
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
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
          name: "IBILE 1 SALES",
          tillId: "TILL 1",
          location: "Lagos",
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-100">
        <div className="text-center">
          <div className="text-4xl mb-4">📦</div>
          <p className="text-neutral-600">Loading POS System...</p>
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

          {/* Right: TabNavigation + CartPanel - Full Height */}
          <div className="hidden lg:flex w-[40rem] bg-white flex-col border-l border-neutral-200 overflow-hidden">
            {/* Tab Navigation - Screen Switching */}
            <div className="px-4 py-3 flex-shrink-0">
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
