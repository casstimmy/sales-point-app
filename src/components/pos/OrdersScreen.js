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

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendar,
  faClock,
  faSliders,
  faX,
  faChevronDown,
  faSync,
  faUndo,
} from '@fortawesome/free-solid-svg-icons';
import { useCart } from '../../context/CartContext';
import { useStaff } from '../../context/StaffContext';
import { getCompletedTransactions } from '../../lib/offlineSync';

const ORDER_STATUS_TABS = ['HELD', 'ORDERED', 'PENDING', 'COMPLETE'];

export default function OrdersScreen() {
  const [activeStatus, setActiveStatus] = useState('HELD');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [completedTransactions, setCompletedTransactions] = useState([]);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState(null);
  const { isOnline, lastSyncTime, resumeOrder, orders } = useCart();
  const { staff } = useStaff();

  // Check if current staff has refund access (admin, manager, senior staff)
  const canRefund = staff && ['admin', 'manager', 'senior staff'].includes(staff.role?.toLowerCase?.());

  // Fetch completed transactions from server (online) or IndexedDB (offline)
  const fetchCompletedTransactions = useCallback(async () => {
    setIsLoadingCompleted(true);
    try {
      let completed = [];

      if (isOnline) {
        // Online: Fetch from server API - filter by today's date
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          const params = new URLSearchParams({
            startDate: today.toISOString(),
            endDate: tomorrow.toISOString(),
            limit: 500,
          });

          const response = await fetch(`/api/transactions/completed?${params}`);
          if (response.ok) {
            const result = await response.json();
            completed = result.data || result || [];
            console.log(`✅ Fetched ${completed.length} completed transactions from server (today)`);
          } else {
            console.warn('Failed to fetch from server, falling back to IndexedDB');
            completed = await getCompletedTransactions();
          }
        } catch (error) {
          console.warn('Error fetching from server:', error, 'falling back to IndexedDB');
          completed = await getCompletedTransactions();
        }
      } else {
        // Offline: Fetch from IndexedDB filtered by today
        console.log('🔴 Offline mode - fetching from IndexedDB');
        let allCompleted = await getCompletedTransactions();
        
        // Filter for today's transactions
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        completed = allCompleted.filter(tx => {
          const txDate = new Date(tx.createdAt);
          return txDate >= today && txDate < tomorrow;
        });
      }

      setCompletedTransactions(completed);
    } catch (error) {
      console.error('Failed to fetch completed transactions:', error);
      setCompletedTransactions([]);
    } finally {
      setIsLoadingCompleted(false);
    }
  }, [isOnline]);

  // Load completed transactions on mount and when switching to COMPLETE tab or online status changes
  useEffect(() => {
    if (activeStatus === 'COMPLETE') {
      fetchCompletedTransactions();
    }
  }, [activeStatus, fetchCompletedTransactions, isOnline]);

  // Handle refund request
  const handleRefund = async (order, action) => {
    if (!canRefund) {
      alert('You do not have permission to refund transactions.');
      return;
    }

    setRefundLoading(true);
    setRefundError(null);

    try {
      const payload = {
        transactionId: order.id,
        action: action, // 'recall' (to cart, no save) or 'process' (mark as edited/deleted)
        refundReason: '',
        staffId: staff._id,
      };

      if (action === 'process') {
        // Ask user if they want to process or discard
        const response = await fetch('/api/transactions/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to process refund');
        }

        const data = await response.json();
        alert(`Transaction marked as ${data.refundStatus}`);
        
        // Refresh completed transactions
        await fetchCompletedTransactions();
      } else if (action === 'recall') {
        // Recall to cart without saving as refund
        resumeOrder(order.id);
        alert('Transaction recalled to cart. Make edits and complete again to save as edited.');
      }

      setShowRefundModal(false);
      setSelectedOrder(null);
    } catch (err) {
      setRefundError(err.message);
    } finally {
      setRefundLoading(false);
    }
  };

  // Filter orders by status
  useEffect(() => {
    let sourceOrders = [];

    if (activeStatus === 'COMPLETE') {
      // Use completed transactions from IndexedDB
      sourceOrders = completedTransactions.map(tx => ({
        id: tx.id || tx._id,
        time: tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A',
        customer: tx.customerName || 'Walk-in',
        staffMember: tx.staffName || 'Unknown',
        tenderType: tx.tenderType || (tx.tenderPayments?.[0]?.tenderName) || null,
        total: tx.total || 0,
        status: 'COMPLETE',
        items: tx.items || [],
      }));
    } else {
      // Use held orders from CartContext
      if (!orders || orders.length === 0) {
        setFilteredOrders([]);
        return;
      }

      sourceOrders = orders
        .filter(order => order.status === activeStatus)
        .map(order => ({
          id: order.id,
          time: order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A',
          customer: order.customer?.name || 'Walk-in',
          staffMember: order.staffMember?.name || order.staffMember || 'Unknown',
          location: order.location?.name || order.location || 'Unknown',
          tenderType: order.status === 'HELD' ? null : (order.tenderType || null), // Don't show tender for HELD
          total: order.total || 0,
          status: order.status,
          items: order.items || [],
        }));
    }

    // Apply date filter if selected
    let filtered = sourceOrders;
    if (selectedDate) {
      const filterDate = new Date(selectedDate).toDateString();
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.time).toDateString();
        return orderDate === filterDate;
      });
    }

    setFilteredOrders(filtered);
  }, [activeStatus, selectedDate, orders, completedTransactions]);

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
        
        {/* Refresh button for completed transactions */}
        {activeStatus === 'COMPLETE' && (
          <button 
            onClick={fetchCompletedTransactions}
            disabled={isLoadingCompleted}
            className="px-4 py-2 bg-green-500 text-white rounded font-semibold text-sm hover:bg-green-600 flex items-center gap-2 transition-colors touch-manipulation disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faSync} className={`w-4 h-4 ${isLoadingCompleted ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">REFRESH</span>
          </button>
        )}
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
              {activeStatus === 'COMPLETE' && canRefund && <th className="text-center p-3 text-gray-700">ACTION</th>}
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(order => (
              <tr
                key={order.id}
                className="border-b border-gray-200 hover:bg-blue-50 transition-colors touch-manipulation"
              >
                <td 
                  className="p-3 text-gray-800 font-medium cursor-pointer"
                  onClick={() => handleOrderSelect(order)}
                >
                  {order.time}
                </td>
                <td 
                  className="p-3 text-gray-800 cursor-pointer"
                  onClick={() => handleOrderSelect(order)}
                >
                  {order.customer}
                </td>
                <td 
                  className="p-3 text-gray-800 cursor-pointer"
                  onClick={() => handleOrderSelect(order)}
                >
                  {order.staffMember}
                </td>
                <td 
                  className="p-3 text-gray-800 uppercase text-xs font-semibold cursor-pointer"
                  onClick={() => handleOrderSelect(order)}
                >
                  {order.tenderType ? (
                    <span
                      className={`px-2 py-1 rounded ${
                        order.tenderType === 'CASH'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {order.tenderType === 'HYDROGEN_POS' ? 'HYDROGEN POS' : order.tenderType}
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded bg-gray-100 text-gray-500 italic">
                      Pending
                    </span>
                  )}
                </td>
                <td 
                  className="p-3 text-gray-800 font-bold text-right cursor-pointer"
                  onClick={() => handleOrderSelect(order)}
                >
                  ₦{order.total.toLocaleString()}
                </td>
                {activeStatus === 'COMPLETE' && canRefund && (
                  <td className="p-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrder(order);
                        setShowRefundModal(true);
                      }}
                      className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded text-xs font-semibold flex items-center gap-1 mx-auto transition-colors"
                    >
                      <FontAwesomeIcon icon={faUndo} className="w-3 h-3" />
                      Refund
                    </button>
                  </td>
                )}
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

      {/* Refund Modal */}
      {showRefundModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-4">
              <h3 className="text-lg font-bold">Refund Transaction</h3>
              <p className="text-orange-100 text-sm">Order ID: {selectedOrder.id?.toString().slice(-8)}</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold text-gray-800">₦{selectedOrder.total.toLocaleString()}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Recall to Cart:</strong> Make edits and reprocess (saved as "edited")
                </p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">
                  <strong>Process Refund:</strong> Mark transaction as "deleted" and void
                </p>
              </div>

              {refundError && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-3">
                  <p className="text-sm text-red-700">{refundError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleRefund(selectedOrder, 'recall')}
                  disabled={refundLoading}
                  className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  Recall to Cart
                </button>
                <button
                  onClick={() => handleRefund(selectedOrder, 'process')}
                  disabled={refundLoading}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {refundLoading ? 'Processing...' : 'Process Refund'}
                </button>
              </div>

              <button
                onClick={() => {
                  setShowRefundModal(false);
                  setSelectedOrder(null);
                  setRefundError(null);
                }}
                disabled={refundLoading}
                className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
