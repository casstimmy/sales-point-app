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
import { faXmark, faCheckCircle, faTimes } from '@fortawesome/free-solid-svg-icons';
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
    if (isPaymentComplete) {
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 rounded-t-lg flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold">Payment Required</h2>
            <p className="text-blue-100 mt-1">Enter payment method and amount</p>
          </div>
          <button
            onClick={onCancel}
            className="hover:bg-white hover:bg-opacity-20 p-2 rounded transition-all"
          >
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Left: Tender Selection and Amount */}
            <div className="col-span-2 space-y-4">
              {/* Total Due and Payment Progress */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between mb-4">
                  <div>
                    <p className="text-gray-600 text-sm">Total Due</p>
                    <p className="text-4xl font-bold text-gray-800">
                      {formatNaira(total)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-600 text-sm">Amount Paid</p>
                    <p className={`text-4xl font-bold ${isPaymentComplete ? 'text-green-600' : 'text-red-600'}`}>
                      {formatNaira(totalPaid)}
                    </p>
                  </div>
                </div>

                {/* Change Display */}
                {isPaymentComplete && (
                  <div className="bg-green-50 border-2 border-green-300 rounded p-3">
                    <p className="text-green-700 text-sm font-semibold">CHANGE</p>
                    <p className="text-3xl font-bold text-green-600">
                      {formatNaira(change)}
                    </p>
                  </div>
                )}
              </div>

              {/* Tender Type Buttons */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">Select Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  {availableTenders.map(tender => (
                    <button
                      key={tender.id}
                      onClick={() => {
                        setSelectedTender(tender.id);
                        handleClear();
                      }}
                      className={`p-4 rounded font-semibold transition-all transform text-lg ${
                        selectedTender === tender.id
                          ? `${TENDER_COLOR_MAP[tender.classification] || 'bg-indigo-500'} text-white scale-105 shadow-lg`
                          : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                      }`}
                    >
                      {tender.name}
                      <div className="text-sm mt-1">
                        {formatNaira(tenders[tender.id])}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input Display */}
              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                <p className="text-blue-700 text-sm font-semibold mb-2">
                  Amount for {availableTenders.find(t => t.id === selectedTender)?.name}
                </p>
                <p className="text-5xl font-bold text-blue-600 text-right">
                  ₦{displayAmount}
                </p>
              </div>
            </div>

            {/* Right: Numeric Keypad */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700 text-center">NUMERIC KEYPAD</p>

              {/* Number Grid */}
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumberClick(num)}
                    className="bg-gray-200 hover:bg-gray-300 p-6 rounded font-bold text-2xl transition-all min-h-16"
                  >
                    {num}
                  </button>
                ))}

                {/* Zero and Decimal */}
                <button
                  onClick={() => handleNumberClick(0)}
                  className="col-span-2 bg-gray-200 hover:bg-gray-300 p-6 rounded font-bold text-2xl transition-all min-h-16"
                >
                  0
                </button>
                <button
                  onClick={handleDecimal}
                  className="bg-blue-400 hover:bg-blue-500 text-white p-6 rounded font-bold text-2xl transition-all min-h-16"
                >
                  .
                </button>

                {/* Backspace */}
                <button
                  onClick={handleBackspace}
                  className="col-span-3 bg-red-400 hover:bg-red-500 text-white p-4 rounded font-semibold transition-all text-lg min-h-14"
                >
                  ← BACKSPACE
                </button>

                {/* Clear */}
                <button
                  onClick={handleClear}
                  className="col-span-3 bg-yellow-400 hover:bg-yellow-500 text-gray-800 p-4 rounded font-semibold transition-all text-lg min-h-14"
                >
                  CLEAR
                </button>

                {/* Add Amount */}
                <button
                  onClick={handleAdd}
                  className="col-span-3 bg-green-500 hover:bg-green-600 text-white p-5 rounded font-bold text-xl transition-all min-h-16"
                >
                  ADD AMOUNT
                </button>
              </div>

              {/* Tender Summary */}
              <div className="bg-gray-100 rounded-lg p-3 text-xs">
                <p className="font-semibold text-gray-700 mb-2">Tenders Summary</p>
                <div className="space-y-1">
                  {availableTenders.map(tender => (
                    tenders[tender.id] > 0 && (
                      <div key={tender.id} className="flex justify-between text-gray-800">
                        <span>{tender.name}</span>
                        <span className="font-semibold">
                          {formatNaira(tenders[tender.id])}
                        </span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex gap-4 justify-end">
            <button
              onClick={onCancel}
              className="px-8 py-4 bg-gray-400 hover:bg-gray-500 text-white rounded-lg font-semibold transition-all flex items-center gap-2 text-lg min-h-14"
            >
              <FontAwesomeIcon icon={faTimes} />
              CANCEL
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isPaymentComplete}
              className={`px-8 py-4 rounded-lg font-semibold transition-all flex items-center gap-2 text-lg min-h-14 ${
                isPaymentComplete
                  ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <FontAwesomeIcon icon={faCheckCircle} />
              CONFIRM PAYMENT
            </button>
          </div>

          {!isPaymentComplete && totalPaid > 0 && (
            <p className="text-center text-red-600 text-sm mt-3 font-semibold">
              Still need {formatNaira(total - totalPaid)} more
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
