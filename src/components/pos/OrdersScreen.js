/**
 * OrdersScreen Component
 * 
 * ORDERS tab - displays transaction history with advanced filtering.
 * - Order lifecycle tabs: HELD, ORDERED, PENDING, COMPLETE
 * - Date and time picker filters
 * - Advanced filter button for staff/customer/tender type
 * - Clickable rows that load order into cart panel
 * - Offline sync warning banner
 */

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendar,
  faClock,
  faSliders,
  faX,
  faChevronDown,
} from '@fortawesome/free-solid-svg-icons';
import { useCart } from '../../context/CartContext';

const ORDER_STATUS_TABS = ['HELD', 'ORDERED', 'PENDING', 'COMPLETE'];

export default function OrdersScreen() {
  const [activeStatus, setActiveStatus] = useState('HELD');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [filteredOrders, setFilteredOrders] = useState([]);
  const { isOnline, lastSyncTime, resumeOrder, orders } = useCart();

  // Filter orders by status
  useEffect(() => {
    if (!orders || orders.length === 0) {
      setFilteredOrders([]);
      return;
    }

    // Format orders from CartContext to display format
    let filtered = orders
      .filter(order => order.status === activeStatus)
      .map(order => ({
        id: order.id,
        time: order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A',
        customer: order.customer?.name || 'Unknown',
        staffMember: order.staffMember?.name || 'Unknown',
        tenderType: order.tenderType || 'CASH',
        total: order.total || 0,
        status: order.status,
        items: order.items || [],
      }));

    // Apply date filter if selected
    if (selectedDate) {
      const filterDate = new Date(selectedDate).toDateString();
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.time).toDateString();
        return orderDate === filterDate;
      });
    }

    setFilteredOrders(filtered);
  }, [activeStatus, selectedDate, orders]);

  const handleOrderSelect = (order) => {
    // Convert mock order to cart format and load it
    resumeOrder(order.id);
  };

  const formatSyncTime = (isoString) => {
    if (!isoString) return 'Never synced';
    const date = new Date(isoString);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    if (diffMins < 1) return 'Just synced';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 flex items-start gap-2 text-sm text-yellow-800">
          <FontAwesomeIcon icon={faX} className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">Out of sync</div>
            <div className="text-xs text-yellow-700">
              Last synced: {formatSyncTime(lastSyncTime)}. New orders or changes from other devices won&apos;t appear until
              you are back online.
            </div>
          </div>
        </div>
      )}

      {/* Status Tabs */}
      <div className="bg-blue-600 text-white px-4 py-3 flex gap-2 overflow-x-auto">
        {ORDER_STATUS_TABS.map(status => (
          <button
            key={status}
            onClick={() => setActiveStatus(status)}
            className={`px-4 py-2 font-semibold text-sm whitespace-nowrap rounded transition-colors touch-manipulation ${
              activeStatus === status
                ? 'bg-blue-800 text-white'
                : 'bg-blue-700 hover:bg-blue-500 text-blue-100'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Filter Controls */}
      <div className="bg-white border-b border-gray-200 p-3 flex gap-2 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-300">
            <FontAwesomeIcon icon={faCalendar} className="w-4 h-4 text-gray-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm w-full outline-none"
              placeholder="Choose Date"
            />
          </label>
        </div>

        <div className="flex-1 min-w-48">
          <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-300">
            <FontAwesomeIcon icon={faClock} className="w-4 h-4 text-gray-600" />
            <input
              type="time"
              value={selectedTime}
              onChange={e => setSelectedTime(e.target.value)}
              className="bg-transparent text-sm w-full outline-none"
              placeholder="Choose Time"
            />
          </label>
        </div>

        <button className="px-4 py-2 bg-blue-500 text-white rounded font-semibold text-sm hover:bg-blue-600 flex items-center gap-2 transition-colors touch-manipulation">
          <FontAwesomeIcon icon={faSliders} className="w-4 h-4" />
          <span className="hidden sm:inline">ADVANCED FILTER</span>
          <span className="sm:hidden">FILTER</span>
        </button>
      </div>

      {/* Orders Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-200 sticky top-0">
            <tr className="border-b border-gray-300">
              <th className="text-left p-3 text-gray-700">TIME</th>
              <th className="text-left p-3 text-gray-700">CUSTOMER</th>
              <th className="text-left p-3 text-gray-700">STAFF MEMBER</th>
              <th className="text-left p-3 text-gray-700">TENDER TYPE</th>
              <th className="text-right p-3 text-gray-700">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(order => (
              <tr
                key={order.id}
                onClick={() => handleOrderSelect(order)}
                className="border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors touch-manipulation"
              >
                <td className="p-3 text-gray-800 font-medium">{order.time}</td>
                <td className="p-3 text-gray-800">{order.customer}</td>
                <td className="p-3 text-gray-800">{order.staffMember}</td>
                <td className="p-3 text-gray-800 uppercase text-xs font-semibold">
                  <span
                    className={`px-2 py-1 rounded ${
                      order.tenderType === 'CASH'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {order.tenderType === 'HYDROGEN_POS' ? 'HYDROGEN POS' : order.tenderType}
                  </span>
                </td>
                <td className="p-3 text-gray-800 font-bold text-right">₦{order.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredOrders.length === 0 && (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <div className="text-3xl mb-2">📋</div>
              <div>No {activeStatus.toLowerCase()} orders</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
