/**
 * TopBar Component
 * 
 * Persistent top navigation showing:
 * - Store name and till info
 * - Date and time (live updated)
 * - Offline mode banner when disconnected
 * - Tab navigation (MENU, CUSTOMERS, ORDERS)
 * - Search and logout icons
 */

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faSignOutAlt,
  faX,
  faWifi,
  faBars,
  faSync,
} from '@fortawesome/free-solid-svg-icons';
import { useCart } from '../../context/CartContext';

export default function TopBar({ activeTab, onTabChange, onLogout, storeData, staffData, onToggleSidebar }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { isOnline, pendingSyncCount } = useCart();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    return date.toLocaleDateString('en-NG', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Get store and staff info from props or defaults
  const storeName = storeData?.name || 'IBILE 1 SALES';
  const storeLocation = storeData?.location || 'Lagos';
  const staffName = staffData?.name || 'Staff';
  const staffRole = staffData?.role || 'Attendant';
  const locationName = staffData?.location?.name || staffData?.locationName || storeLocation;

  return (
    <div className="flex flex-col bg-gradient-to-r from-primary-600 to-primary-700 text-white">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-600 px-4 py-2 flex items-center justify-between gap-2 text-sm font-medium">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faX} className="w-4 h-4" />
            <span>OFFLINE MODE - Changes will sync when online</span>
          </div>
          {pendingSyncCount > 0 && (
            <div className="bg-white text-red-600 px-3 py-1 rounded-lg font-bold text-xs">
              {pendingSyncCount} pending
            </div>
          )}
        </div>
      )}

      {/* Main Top Bar - Primary Section with Store Info */}
      <div className="px-4 py-4 flex items-center justify-between gap-4">
        {/* Left: Hamburger + Store & Staff Info */}
        <div className="flex items-center gap-4 flex-1">
          {/* Hamburger - Visible on all screens */}
          <button
            onClick={onToggleSidebar}
            className="p-3 hover:bg-white/20 active:bg-white/30 active:scale-95 rounded-xl transition-all min-h-12 min-w-12"
            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
            title="Toggle menu"
          >
            <FontAwesomeIcon icon={faBars} className="w-6 h-6" />
          </button>

          {/* Store & Location Info */}
          <div className="flex-1">
            <div className="text-base font-semibold">{storeName}</div>
            <div className="text-sm opacity-90">{locationName}</div>
          </div>

          {/* Staff Details */}
          <div className="hidden sm:block border-l border-white/30 pl-4">
            <div className="text-base font-semibold">{staffName}</div>
            <div className="text-sm opacity-90">{staffRole}</div>
          </div>

          {/* Date & Time */}
          <div className="hidden sm:block border-l border-white/30 pl-4">
            <div className="text-sm opacity-90">{formatDate(currentTime)}</div>
            <div className="text-sm opacity-90">{formatTime(currentTime)}</div>
          </div>
        </div>

        {/* Right: Search & Logout */}
        <div className="flex items-center gap-3">
          {/* Online/Offline Status Indicator */}
          <div className="text-sm flex items-center gap-2">
            <FontAwesomeIcon 
              icon={isOnline ? faWifi : faX} 
              className={`w-5 h-5 ${isOnline ? 'text-green-300' : 'text-red-300'}`}
            />
            {pendingSyncCount > 0 && (
              <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                {pendingSyncCount}
              </span>
            )}
          </div>
          <button
            className="p-3 hover:bg-white/20 active:bg-white/30 active:scale-95 rounded-xl transition-all min-h-12 min-w-12"
            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
            title="Search products"
          >
            <FontAwesomeIcon icon={faSearch} className="w-6 h-6" />
          </button>
          <button
            onClick={onLogout}
            className="p-3 hover:bg-white/20 active:bg-white/30 active:scale-95 rounded-xl transition-all min-h-12 min-w-12"
            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
            title="Logout or switch user"
          >
            <FontAwesomeIcon icon={faSignOutAlt} className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
