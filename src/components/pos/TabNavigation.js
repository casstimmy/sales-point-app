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
    <div className="bg-neutral-300 rounded-lg flex gap-1.5 px-2 py-2 items-center w-full">
      {['MENU', 'CUSTOMERS', 'ORDERS'].map(tab => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-3 py-2 font-semibold text-xs transition-colors duration-base rounded-lg touch-manipulation flex-1 min-h-9 ${
            activeTab === tab
              ? 'bg-white text-neutral-700 shadow-md'
              : 'bg-transparent text-neutral-600 hover:text-neutral-800'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
