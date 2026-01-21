/**
 * AdjustFloatModal Component
 * 
 * Modal to add additional cash to the till's opening balance (startup funds).
 * This tops up the float without creating a transaction.
 */

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faX } from '@fortawesome/free-solid-svg-icons';
import { useStaff } from '../../context/StaffContext';

export default function AdjustFloatModal({ isOpen, onClose }) {
  const { till, setCurrentTill } = useStaff();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleAdjustFloat = async (e) => {
    e.preventDefault();
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/till/${till._id}/adjust-float`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          adjustmentAmount: parseFloat(amount),
          reason: "Manual float adjustment"
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to adjust float");
        return;
      }

      setSuccess(`Float adjusted by ₦${parseFloat(amount).toFixed(2)}`);
      setAmount("");
      
      // Update till in context with the new opening balance
      if (data.till) {
        setCurrentTill({
          ...till,
          openingBalance: data.till.openingBalance,
        });
      }

      // Close after 1.5 seconds
      setTimeout(() => {
        onClose();
        setSuccess("");
      }, 1500);
    } catch (err) {
      console.error("Error adjusting float:", err);
      setError("Failed to adjust float");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentFloat = till?.openingBalance || 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-neutral-900">Adjust Float</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <FontAwesomeIcon icon={faX} className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Current Float Display */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600 mb-1">Current Opening Balance</p>
          <p className="text-2xl font-bold text-blue-700">
            ₦{currentFloat.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleAdjustFloat} className="space-y-4">
          {/* Amount Input */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-2">
              Amount to Add
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
              placeholder="0.00"
              disabled={loading}
              className="w-full px-4 py-3 text-lg border-2 border-neutral-300 rounded-lg focus:outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              autoFocus
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-3">
              <p className="text-sm font-medium text-green-700">{success}</p>
            </div>
          )}

          {/* New Balance Preview */}
          {amount && !error && (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
              <p className="text-xs text-gray-600 mb-1">New Opening Balance</p>
              <p className="text-xl font-bold text-green-700">
                ₦{(currentFloat + parseFloat(amount || 0)).toLocaleString('en-NG', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gray-400 hover:bg-gray-500 text-white font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !amount || isNaN(amount)}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Adjusting..." : "Adjust Float"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
