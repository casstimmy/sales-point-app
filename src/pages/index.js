/**
 * Main POS System Page
 * 
 * Screen content only.
 * Layout, CartPanel, Sidebar, TopBar all provided by EpoNowLayout wrapper.
 */

import React, { useState, useEffect } from 'react';
import MenuScreen from '../components/pos/MenuScreen';
import OrdersScreen from '../components/pos/OrdersScreen';

export default function POSPage({ activeTab, onTabChange }) {
  // Use prop if provided by layout, otherwise use local state
  const [localActiveTab, setLocalActiveTab] = useState('MENU');
  const currentTab = activeTab !== undefined ? activeTab : localActiveTab;
  const setCurrentTab = onTabChange || setLocalActiveTab;

  const renderScreen = () => {
    switch (currentTab) {
      case 'MENU':
        return <MenuScreen />;
      case 'CUSTOMERS':
        return (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-center bg-gray-50">
            <div>
              <div className="text-4xl mb-2">👥</div>
              <div>Customer Management Coming Soon</div>
              <div className="text-sm mt-2">Select MENU to start adding items</div>
            </div>
          </div>
        );
      case 'ORDERS':
        return <OrdersScreen />;
      default:
        return <MenuScreen />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {renderScreen()}
    </div>
  );
}
