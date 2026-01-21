/**
 * TabNavigation Component
 * 
 * Screen switching tabs displayed in gray container
 * - MENU: Product selection and ordering
 * - CUSTOMERS: Customer management
 * - ORDERS: Order history and management
 */

import React from 'react';

export default function TabNavigation({ activeTab, onTabChange }) {
  return (
    <div className="bg-neutral-300 rounded-lg flex gap-4 px-6 py-3 items-center w-full">
      {['MENU', 'CUSTOMERS', 'ORDERS'].map(tab => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-8 py-3 font-semibold text-lg transition-colors duration-base rounded-lg touch-manipulation flex-1 min-h-12 ${
            activeTab === tab
              ? 'bg-white text-neutral-700 shadow-md'
              : 'bg-transparent text-neutral-600 hover:text-neutral-800'
          }`}
        >
          <span className="hidden sm:inline">{tab}</span>
          <span className="sm:hidden">{tab.slice(0, 3)}</span>
        </button>
      ))}
    </div>
  );
}
