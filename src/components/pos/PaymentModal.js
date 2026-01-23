/**
 * PaymentModal Component - Redesigned
 * 
 * Modern, touch-optimized payment modal:
 * - Large, touch-friendly buttons
 * - Clear visual hierarchy
 * - Split payment support
 * - Responsive design
 * - Consistent color scheme
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faXmark, 
  faCheckCircle, 
  faTimes, 
  faMoneyBill, 
  faCreditCard, 
  faMobile, 
  faUniversity,
  faBackspace,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { useStaff } from '@/src/context/StaffContext';
import { useLocationTenders } from '@/src/hooks/useLocationTenders';

// Icon mapping for tender types
const TENDER_ICONS = {
  'Cash': faMoneyBill,
  'Card': faCreditCard,
  'Transfer': faUniversity,
  'Mobile': faMobile,
};

// Color mapping for tender types
const TENDER_COLORS = {
  'Cash': { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600', active: 'active:bg-emerald-700', ring: 'ring-emerald-400' },
  'Card': { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', active: 'active:bg-blue-700', ring: 'ring-blue-400' },
  'Transfer': { bg: 'bg-purple-500', hover: 'hover:bg-purple-600', active: 'active:bg-purple-700', ring: 'ring-purple-400' },
  'Mobile': { bg: 'bg-orange-500', hover: 'hover:bg-orange-600', active: 'active:bg-orange-700', ring: 'ring-orange-400' },
  'default': { bg: 'bg-slate-500', hover: 'hover:bg-slate-600', active: 'active:bg-slate-700', ring: 'ring-slate-400' },
};

export default function PaymentModal({ total, onConfirm, onCancel }) {
  const { location } = useStaff();
  const { tenders: locationTenders, loading: tendersLoading, error: tendersError } = useLocationTenders();
  
  const [availableTenders, setAvailableTenders] = useState([]);
  const [tenders, setTenders] = useState({});
  const [selectedTender, setSelectedTender] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize tenders from hook
  useEffect(() => {
    if (tendersLoading) {
      setLoading(true);
      return;
    }

    if (tendersError && locationTenders.length === 0) {
      setError(tendersError);
      setLoading(false);
      return;
    }

    if (locationTenders.length === 0) {
      setError(null);
      setAvailableTenders([]);
      setLoading(false);
      return;
    }

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

  // Calculate totals
  const totalPaid = Object.values(tenders).reduce((sum, val) => sum + val, 0);
  const remaining = Math.max(0, total - totalPaid);
  const change = Math.max(0, totalPaid - total);
  const isPaymentComplete = totalPaid >= total;

  // Format currency
  const formatCurrency = (amount) => {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Get tender color scheme
  const getTenderColors = (tenderName) => {
    return TENDER_COLORS[tenderName] || TENDER_COLORS['default'];
  };

  // Handle keypad input
  const handleKeyPress = useCallback((key) => {
    if (key === 'backspace') {
      setInputValue(prev => prev.slice(0, -1));
    } else if (key === 'clear') {
      setInputValue('');
    } else if (key === '.') {
      if (!inputValue.includes('.')) {
        setInputValue(prev => prev + '.');
      }
    } else if (key === 'exact') {
      setInputValue(remaining.toFixed(2));
    } else {
      setInputValue(prev => prev + key);
    }
  }, [inputValue, remaining]);

  // Add amount to selected tender
  const handleAddAmount = () => {
    const amount = parseFloat(inputValue) || 0;
    if (amount > 0 && selectedTender) {
      setTenders(prev => ({
        ...prev,
        [selectedTender]: prev[selectedTender] + amount
      }));
      setInputValue('');
    }
  };

  // Clear tender amount
  const handleClearTender = (tenderId) => {
    setTenders(prev => ({
      ...prev,
      [tenderId]: 0
    }));
  };

  // Handle confirm
  const handleConfirm = () => {
    if (!isPaymentComplete) return;

    const selectedTenderObj = availableTenders.find(t => t.id === selectedTender);
    const tenderName = selectedTenderObj?.name || selectedTender;

    // Convert tenders object to names
    const tendersWithNames = {};
    Object.entries(tenders).forEach(([tenderId, amount]) => {
      const tender = availableTenders.find(t => t.id === tenderId);
      const name = tender?.name || tenderId;
      tendersWithNames[name] = amount;
    });

    // Build split payment array
    const tenderPayments = [];
    Object.entries(tenders).forEach(([tenderId, amount]) => {
      if (parseFloat(amount) > 0) {
        const tender = availableTenders.find(t => t.id === tenderId);
        tenderPayments.push({
          tenderId: tender?.id || tenderId,
          tenderName: tender?.name || tenderId,
          amount: parseFloat(amount)
        });
      }
    });

    onConfirm({
      tenderType: tenderName,
      tenderPayments,
      tenders: tendersWithNames,
      totalPaid,
      change,
      amountPaid: totalPaid,
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-neutral-600 font-medium">Loading payment methods...</p>
        </div>
      </div>
    );
  }

  // No tenders error state
  if (error || availableTenders.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h3 className="text-xl font-bold text-neutral-900">No Payment Methods</h3>
            <p className="text-neutral-600 mt-2">
              No payment methods configured for <strong>{location?.name || 'this location'}</strong>
            </p>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-blue-900 text-sm font-semibold mb-2">To enable payments:</p>
            <ol className="text-blue-800 text-sm list-decimal list-inside space-y-1">
              <li>Go to Settings → Location Tenders</li>
              <li>Select your location</li>
              <li>Enable payment methods (Cash, Card, etc.)</li>
            </ol>
          </div>

          <button
            onClick={onCancel}
            className="w-full px-4 py-3 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-xl font-semibold transition-all active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-5 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-bold">Complete Payment</h2>
            <p className="text-primary-100 text-sm mt-1">{location?.name || 'Point of Sale'}</p>
          </div>
          <button
            onClick={onCancel}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 flex items-center justify-center transition-all active:scale-95"
          >
            <FontAwesomeIcon icon={faXmark} className="text-xl" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left Column - Amount Summary & Tenders */}
            <div className="space-y-5">
              
              {/* Amount Summary Card */}
              <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-xl p-5 border border-neutral-200">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-neutral-500 text-sm font-medium">Total Due</p>
                    <p className="text-3xl font-bold text-neutral-900">{formatCurrency(total)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-neutral-500 text-sm font-medium">Amount Paid</p>
                    <p className={`text-3xl font-bold ${isPaymentComplete ? 'text-emerald-600' : 'text-neutral-900'}`}>
                      {formatCurrency(totalPaid)}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden mb-4">
                  <div 
                    className={`h-full transition-all duration-300 rounded-full ${isPaymentComplete ? 'bg-emerald-500' : 'bg-primary-500'}`}
                    style={{ width: `${Math.min(100, (totalPaid / total) * 100)}%` }}
                  />
                </div>

                {/* Remaining or Change */}
                {isPaymentComplete ? (
                  <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 text-center">
                    <p className="text-emerald-700 text-sm font-semibold uppercase tracking-wide">Change Due</p>
                    <p className="text-4xl font-bold text-emerald-600">{formatCurrency(change)}</p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
                    <p className="text-amber-700 text-sm font-semibold uppercase tracking-wide">Remaining</p>
                    <p className="text-4xl font-bold text-amber-600">{formatCurrency(remaining)}</p>
                  </div>
                )}
              </div>

              {/* Payment Methods */}
              <div>
                <p className="text-sm font-semibold text-neutral-700 mb-3 uppercase tracking-wide">Payment Methods</p>
                <div className="grid grid-cols-2 gap-3">
                  {availableTenders.map(tender => {
                    const colors = getTenderColors(tender.classification || tender.name);
                    const isSelected = selectedTender === tender.id;
                    const amount = tenders[tender.id] || 0;
                    const icon = TENDER_ICONS[tender.classification || tender.name] || faMoneyBill;

                    return (
                      <button
                        key={tender.id}
                        onClick={() => {
                          setSelectedTender(tender.id);
                          setInputValue('');
                        }}
                        className={`relative flex flex-col items-center justify-center p-4 rounded-xl font-semibold transition-all min-h-[80px] active:scale-95 ${
                          isSelected 
                            ? `${colors.bg} text-white ring-4 ${colors.ring} ring-offset-2` 
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                        style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                      >
                        <FontAwesomeIcon icon={icon} className="text-2xl mb-1" />
                        <span className="font-semibold">{tender.name}</span>
                        {amount > 0 && (
                          <span className={`text-xs mt-1 ${isSelected ? 'text-white/90' : 'text-neutral-600'}`}>
                            {formatCurrency(amount)}
                          </span>
                        )}
                        {amount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearTender(tender.id);
                            }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 active:scale-95"
                          >
                            ×
                          </button>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tender Summary */}
              {Object.values(tenders).some(v => v > 0) && (
                <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                  <p className="text-sm font-semibold text-neutral-700 mb-2">Payment Breakdown</p>
                  <div className="space-y-2">
                    {availableTenders.map(tender => (
                      tenders[tender.id] > 0 && (
                        <div key={tender.id} className="flex justify-between items-center">
                          <span className="text-neutral-700">{tender.name}</span>
                          <span className="font-bold text-neutral-900">{formatCurrency(tenders[tender.id])}</span>
                        </div>
                      )
                    ))}
                    <div className="border-t border-neutral-300 pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-neutral-700">Total Paid</span>
                        <span className="font-bold text-lg text-emerald-600">{formatCurrency(totalPaid)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Keypad */}
            <div className="space-y-4">
              
              {/* Input Display */}
              <div className="bg-neutral-900 rounded-xl p-4">
                <p className="text-neutral-400 text-xs font-medium mb-1 uppercase tracking-wide">
                  Amount for {availableTenders.find(t => t.id === selectedTender)?.name || 'Payment'}
                </p>
                <p className="text-4xl font-bold text-white text-right font-mono">
                  ₦{inputValue || '0'}
                </p>
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-3 gap-2">
                {[100, 200, 500, 1000, 2000, 5000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setInputValue(amount.toString())}
                    className="flex items-center justify-center font-bold text-lg rounded-lg transition-all min-h-[56px] bg-blue-100 text-blue-700 hover:bg-blue-200 active:scale-95"
                    style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  >
                    ₦{amount.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Exact Amount Button */}
              {remaining > 0 && (
                <button
                  onClick={() => handleKeyPress('exact')}
                  className="w-full flex items-center justify-center font-bold text-2xl rounded-lg transition-all min-h-[56px] bg-amber-100 text-amber-700 hover:bg-amber-200 active:scale-95"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  EXACT: {formatCurrency(remaining)}
                </button>
              )}

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => handleKeyPress(num.toString())}
                    className="flex items-center justify-center font-bold text-2xl rounded-lg transition-all min-h-[56px] bg-neutral-100 hover:bg-neutral-200 text-neutral-800 active:scale-95"
                    style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => handleKeyPress('.')}
                  className="flex items-center justify-center font-bold text-2xl rounded-lg transition-all min-h-[56px] bg-neutral-200 hover:bg-neutral-300 text-neutral-800 active:scale-95"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  .
                </button>
                <button
                  onClick={() => handleKeyPress('0')}
                  className="flex items-center justify-center font-bold text-2xl rounded-lg transition-all min-h-[56px] bg-neutral-100 hover:bg-neutral-200 text-neutral-800 active:scale-95"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  0
                </button>
                <button
                  onClick={() => handleKeyPress('backspace')}
                  className="flex items-center justify-center font-bold text-2xl rounded-lg transition-all min-h-[56px] bg-red-100 hover:bg-red-200 text-red-700 active:scale-95"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  <FontAwesomeIcon icon={faBackspace} />
                </button>
              </div>

              {/* Clear and Add Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleKeyPress('clear')}
                  className="flex items-center justify-center font-bold text-xl rounded-lg transition-all min-h-[56px] bg-neutral-200 hover:bg-neutral-300 text-neutral-700 active:scale-95"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  CLEAR
                </button>
                <button
                  onClick={handleAddAmount}
                  disabled={!inputValue || parseFloat(inputValue) <= 0}
                  className="flex items-center justify-center font-bold text-xl rounded-lg transition-all min-h-[56px] bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-2" />
                  ADD
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-neutral-200 p-5 bg-neutral-50 shrink-0">
          <div className="flex gap-4 justify-end">
            <button
              onClick={onCancel}
              className="px-8 py-4 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-xl font-semibold transition-all flex items-center gap-2 min-h-[52px] active:scale-95"
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
            >
              <FontAwesomeIcon icon={faTimes} />
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isPaymentComplete}
              className={`px-8 py-4 rounded-xl font-semibold transition-all flex items-center gap-2 min-h-[52px] ${
                isPaymentComplete
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                  : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
            >
              <FontAwesomeIcon icon={faCheckCircle} />
              Complete Payment
            </button>
          </div>
          
          {!isPaymentComplete && totalPaid > 0 && (
            <p className="text-center text-amber-600 text-sm mt-3 font-medium">
              Add {formatCurrency(remaining)} more to complete payment
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
