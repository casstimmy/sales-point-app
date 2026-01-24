/**
 * PaymentModal Component
 * 
 * Modal for collecting payment details:
 * - Fetches tender types assigned to the location
 * - Amount paid for each tender
 * - Change calculation
 * - Numeric keypad for amounts
 * - Confirm/Cancel buttons
 * - Uses Nigerian Naira (₦) currency
 */

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCheckCircle, faTimes, faBackspace } from '@fortawesome/free-solid-svg-icons';
import { useStaff } from '@/src/context/StaffContext';
import { useLocationTenders } from '@/src/hooks/useLocationTenders';

const TENDER_COLOR_MAP = {
  'Cash': 'bg-green-500',
  'Card': 'bg-primary-500',
  'Transfer': 'bg-purple-500',
  'Cheque': 'bg-neutral-500',
  'Other': 'bg-indigo-500',
};

export default function PaymentModal({ total, onConfirm, onCancel }) {
  const { location } = useStaff();
  const { tenders: locationTenders, loading: tendersLoading, error: tendersError } = useLocationTenders();
  
  const [availableTenders, setAvailableTenders] = useState([]);
  const [tenders, setTenders] = useState({});
  const [selectedTender, setSelectedTender] = useState(null);
  const [displayAmount, setDisplayAmount] = useState('0');
  const [currentAmount, setCurrentAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false); // Prevent double-click

  // Use pre-fetched location tenders from hook
  useEffect(() => {
    console.log('💳 PaymentModal: Using location tenders from hook');
    console.log('📍 Location:', location?.name);
    console.log('🏪 Location tenders:', locationTenders);
    console.log('📋 Tenders loading:', tendersLoading, 'Error:', tendersError);

    if (tendersLoading) {
      setLoading(true);
      return;
    }

    if (tendersError && locationTenders.length === 0) {
      console.warn('⚠️ Error loading tenders:', tendersError);
      setError(tendersError);
      setLoading(false);
      return;
    }

    if (locationTenders.length === 0) {
      console.warn('⚠️ No tenders available for location');
      setError(null);
      setAvailableTenders([]);
      setLoading(false);
      return;
    }

    // Tenders are already normalized from the hook
    setAvailableTenders(locationTenders);

    // Initialize tenders object
    const tendersObj = {};
    locationTenders.forEach(tender => {
      tendersObj[tender.id] = 0;
    });
    setTenders(tendersObj);

    // Set first tender as selected
    if (locationTenders.length > 0) {
      setSelectedTender(locationTenders[0].id);
    }

    setLoading(false);
  }, [locationTenders, tendersLoading, tendersError]);

  console.log('💳 PaymentModal opened with total:', total);
  console.log('📍 Location:', location);
  console.log('📍 Location._id:', location?._id);
  console.log('🏪 Available tenders:', availableTenders);

  // Calculate total paid and change
  const totalPaid = Object.values(tenders).reduce((sum, val) => sum + val, 0);
  const change = Math.max(0, totalPaid - total);
  const isPaymentComplete = totalPaid >= total;

  // Format Nigerian Naira
  const formatNaira = (amount) => {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Handle numeric input
  const handleNumberClick = (num) => {
    const newAmount = currentAmount + num.toString();
    setCurrentAmount(newAmount);
    setDisplayAmount(newAmount || '0');
  };

  // Handle decimal point
  const handleDecimal = () => {
    if (!currentAmount.includes('.')) {
      const newAmount = currentAmount + '.';
      setCurrentAmount(newAmount);
      setDisplayAmount(newAmount);
    }
  };

  // Handle backspace
  const handleBackspace = () => {
    const newAmount = currentAmount.slice(0, -1);
    setCurrentAmount(newAmount);
    setDisplayAmount(newAmount || '0');
  };

  // Clear current amount
  const handleClear = () => {
    setCurrentAmount('');
    setDisplayAmount('0');
  };

  // Clear all tenders (Payment Breakdown)
  const handleClearAllTenders = () => {
    const clearedTenders = {};
    availableTenders.forEach(tender => {
      clearedTenders[tender.id] = 0;
    });
    setTenders(clearedTenders);
    handleClear();
  };

  // Add amount to selected tender
  const handleAdd = () => {
    const amount = parseFloat(currentAmount) || 0;
    if (amount > 0) {
      setTenders(prev => ({
        ...prev,
        [selectedTender]: prev[selectedTender] + amount
      }));
      handleClear();
    }
  };

  // Remove last tender entry for selected type (simple undo)
  const handleRemoveLastTender = () => {
    setTenders(prev => ({
      ...prev,
      [selectedTender]: Math.max(0, prev[selectedTender] - (parseFloat(currentAmount) || 1))
    }));
  };

  // Handle confirm
  const handleConfirm = () => {
    if (isPaymentComplete && !isProcessing) {
      setIsProcessing(true); // Prevent double-click
      // Find the selected tender object to get the name
      const selectedTenderObj = availableTenders.find(t => t.id === selectedTender || t._id === selectedTender);
      const tenderName = selectedTenderObj?.name || selectedTender;
      
      // Convert tenders object from ID keys to name keys
      const tendersWithNames = {};
      Object.entries(tenders).forEach(([tenderId, amount]) => {
        const tender = availableTenders.find(t => t.id === tenderId || t._id === tenderId);
        const name = tender?.name || tenderId;
        tendersWithNames[name] = amount;
      });
      
      console.log('💳 Payment confirmed with tenderType:', tenderName);
      console.log('💳 Tenders breakdown:', tendersWithNames);
      
      // NEW: Build split payment array for multiple tender support
      const tenderPayments = [];
      Object.entries(tenders).forEach(([tenderId, amount]) => {
        if (parseFloat(amount) > 0) {
          const tender = availableTenders.find(t => t.id === tenderId || t._id === tenderId);
          tenderPayments.push({
            tenderId: tender?.id || tenderId,
            tenderName: tender?.name || tenderId,
            amount: parseFloat(amount)
          });
        }
      });
      
      // If split payment is used, send tenderPayments; otherwise use legacy tenderType
      onConfirm({
        tenderType: tenderName,           // Legacy: primary tender name
        tenderPayments: tenderPayments,    // New: array of split payments
        tenders: tendersWithNames,         // Breakdown by name
        totalPaid: totalPaid,
        change: change,
        amountPaid: totalPaid,
      });
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6 text-center">
          <p className="text-neutral-600">Loading available payment methods...</p>
        </div>
      </div>
    );
  }

  if (error || availableTenders.length === 0) {
    // NOTE: Do NOT auto-redirect - let user close modal and handle login through Layout
    // The Layout component will show StaffLogin when staff is null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6">
          {error && <p className="text-red-600 font-semibold mb-4">Error: {error}</p>}
          {!error && availableTenders.length === 0 && !loading && (
            <>
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">⚠️</span>
                <div>
                  <p className="text-red-600 font-semibold text-lg">No Payment Methods Configured</p>
                  <p className="text-gray-600 text-sm mt-1">
                    Location: <span className="font-medium">{location?.name || 'Unknown'}</span>
                  </p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                <p className="text-blue-900 text-sm font-semibold mb-3">📋 To Enable Payment Methods:</p>
                <ol className="text-blue-800 text-sm list-decimal list-inside space-y-2">
                  <li>Go to <span className="bg-blue-100 px-2 py-1 rounded">Settings → Location Tenders & Categories</span></li>
                  <li>Select <span className="font-medium">&quot;{location?.name}&quot;</span> from the location dropdown</li>
                  <li>Check the payment methods you want to enable (Cash, Card, Mobile Money, etc.)</li>
                  <li>Return to POS and try processing a transaction again</li>
                </ol>
              </div>
              <p className="text-gray-600 text-xs">
                💡 Contact your inventory manager if you need help assigning payment methods to this location.
              </p>
            </>
          )}
          <button
            onClick={onCancel}
            className="mt-6 w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[calc(100vh-1rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold">Complete Payment</h2>
            <p className="text-cyan-100 text-sm">Select payment method and enter amount</p>
          </div>
          <button
            onClick={onCancel}
            className="hover:bg-white/20 p-2 rounded-lg transition-all active:scale-95"
          >
            <FontAwesomeIcon icon={faXmark} className="w-6 h-6" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-4 grid grid-cols-3 gap-4 overflow-hidden">
          {/* Left Column: Amount Summary */}
          <div className="space-y-3">
            {/* Total Due Card */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase">Total Due</p>
              <p className="text-3xl font-black text-gray-800">
                {formatNaira(total)}
              </p>
            </div>

            {/* Amount Paid Card */}
            <div className={`rounded-xl p-4 border-2 ${
              isPaymentComplete 
                ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300' 
                : 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-300'
            }`}>
              <p className={`text-xs font-semibold uppercase ${isPaymentComplete ? 'text-green-600' : 'text-orange-600'}`}>
                Amount Paid
              </p>
              <p className={`text-3xl font-black ${isPaymentComplete ? 'text-green-700' : 'text-orange-700'}`}>
                {formatNaira(totalPaid)}
              </p>
            </div>

            {/* Change Display */}
            {isPaymentComplete && (
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-2 border-cyan-300 rounded-xl p-4">
                <p className="text-xs text-cyan-600 font-semibold uppercase">Change Due</p>
                <p className="text-3xl font-black text-cyan-700">
                  {formatNaira(change)}
                </p>
              </div>
            )}

            {/* Remaining */}
            {!isPaymentComplete && totalPaid > 0 && (
              <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 rounded-xl p-4">
                <p className="text-xs text-red-600 font-semibold uppercase">Still Needed</p>
                <p className="text-3xl font-black text-red-700">
                  {formatNaira(total - totalPaid)}
                </p>
              </div>
            )}

            {/* Tenders Summary */}
            <div className="bg-white border-2 border-gray-200 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-bold text-gray-600 uppercase">Payment Breakdown</p>
                {Object.values(tenders).some(v => v > 0) && (
                  <button
                    onClick={handleClearAllTenders}
                    className="text-xs px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold rounded transition-all"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {availableTenders.map(tender => (
                  tenders[tender.id] > 0 && (
                    <div key={tender.id} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700 font-medium">{tender.name}</span>
                      <span className="font-bold text-cyan-700">
                        {formatNaira(tenders[tender.id])}
                      </span>
                    </div>
                  )
                ))}
                {Object.values(tenders).every(v => v === 0) && (
                  <p className="text-gray-400 text-xs text-center py-2">No payments added yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Middle Column: Payment Methods & Input */}
          <div className="flex flex-col space-y-3">
            {/* Payment Methods */}
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase mb-2">Payment Methods</p>
              <div className="grid grid-cols-2 gap-2">
                {availableTenders.map(tender => (
                  <button
                    key={tender.id}
                    onClick={() => {
                      setSelectedTender(tender.id);
                      handleClear();
                    }}
                    className={`p-3 rounded-xl font-semibold transition-all text-sm active:scale-[0.98] ${
                      selectedTender === tender.id
                        ? 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg ring-2 ring-cyan-300'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-2 border-gray-200'
                    }`}
                  >
                    <div className="font-bold">{tender.name}</div>
                    <div className={`text-xs mt-0.5 ${selectedTender === tender.id ? 'text-cyan-100' : 'text-gray-500'}`}>
                      {formatNaira(tenders[tender.id])}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Input Display */}
            <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-2 border-cyan-300 rounded-xl p-4">
              <p className="text-cyan-600 text-xs font-bold uppercase mb-1">
                Entering for: {availableTenders.find(t => t.id === selectedTender)?.name || 'Select Method'}
              </p>
              <p className="text-4xl font-black text-cyan-700 text-right font-mono">
                ₦{displayAmount}
              </p>
            </div>

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {[500, 1000, 2000, 5000, 10000, 20000, 50000].map(amount => (
                <button
                  key={amount}
                  onClick={() => {
                    setCurrentAmount(amount.toString());
                    setDisplayAmount(amount.toString());
                  }}
                  className="py-2 px-1 bg-gray-100 hover:bg-cyan-100 border-2 border-gray-200 hover:border-cyan-300 rounded-lg text-xs font-bold text-gray-700 transition-all active:scale-95"
                >
                  ₦{amount >= 1000 ? `${amount / 1000}K` : amount}
                </button>
              ))}
              <button
                onClick={() => {
                  setCurrentAmount(total.toString());
                  setDisplayAmount(total.toString());
                }}
                className="py-2 px-1 bg-cyan-100 hover:bg-cyan-200 border-2 border-cyan-300 rounded-lg text-xs font-bold text-cyan-700 transition-all active:scale-95"
              >
                EXACT
              </button>
            </div>
          </div>

          {/* Right Column: Numeric Keypad */}
          <div className="flex flex-col space-y-2">
            <p className="text-xs font-bold text-gray-600 uppercase text-center">Keypad</p>

            {/* Number Grid */}
            <div className="grid grid-cols-3 gap-2 flex-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num)}
                  className="bg-gray-100 hover:bg-gray-200 border-2 border-gray-200 rounded-xl font-bold text-2xl transition-all active:scale-95 active:bg-cyan-100"
                >
                  {num}
                </button>
              ))}

              {/* Zero and Decimal */}
              <button
                onClick={() => handleNumberClick(0)}
                className="col-span-2 bg-gray-100 hover:bg-gray-200 border-2 border-gray-200 rounded-xl font-bold text-2xl transition-all active:scale-95"
              >
                0
              </button>
              <button
                onClick={handleDecimal}
                className="bg-cyan-100 hover:bg-cyan-200 border-2 border-cyan-300 text-cyan-700 rounded-xl font-bold text-2xl transition-all active:scale-95"
              >
                .
              </button>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleBackspace}
                className="w-full py-3 bg-orange-100 hover:bg-orange-200 border-2 border-orange-300 text-orange-700 rounded-xl font-bold transition-all active:scale-[0.98]"
              >
                ← BACK
              </button>
              <button
                onClick={handleClear}
                className="w-full py-3 bg-gray-200 hover:bg-gray-300 border-2 border-gray-300 text-gray-700 rounded-xl font-bold transition-all active:scale-[0.98]"
              >
                CLEAR
              </button>
              <button
                onClick={handleAdd}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-bold text-lg shadow-lg transition-all active:scale-[0.98]"
              >
                + ADD AMOUNT
              </button>
            </div>
          </div>
        </div>

        {/* Footer - Action Buttons */}
        <div className="px-4 py-3 bg-gray-100 border-t border-gray-200 grid grid-cols-2 gap-4 flex-shrink-0">
          <button
            onClick={onCancel}
            className="flex items-center justify-center gap-2 py-4 bg-gray-200 hover:bg-gray-300 rounded-xl transition-all active:scale-[0.98]"
          >
            <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center">
              <FontAwesomeIcon icon={faTimes} className="w-6 h-6 text-white" />
            </div>
            <span className="text-gray-700 font-bold">Cancel</span>
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isPaymentComplete || isProcessing}
            className={`flex items-center justify-center gap-2 py-4 rounded-xl transition-all active:scale-[0.98] ${
              isPaymentComplete && !isProcessing
                ? 'bg-cyan-100 hover:bg-cyan-200 border-2 border-cyan-300'
                : 'bg-gray-100 cursor-not-allowed opacity-50 border-2 border-gray-200'
            }`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isPaymentComplete && !isProcessing ? 'bg-cyan-600' : 'bg-gray-400'
            }`}>
              <FontAwesomeIcon icon={faCheckCircle} className="w-6 h-6 text-white" />
            </div>
            <span className={`font-bold ${isPaymentComplete && !isProcessing ? 'text-cyan-700' : 'text-gray-400'}`}>
              {isProcessing ? 'Processing...' : 'Confirm'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
