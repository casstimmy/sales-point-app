// components/pos/CloseTillModal.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useStaff } from "../../context/StaffContext";
import { useLocationTenders } from "../../hooks/useLocationTenders";
import { getOnlineStatus } from "../../lib/offlineSync";

export default function CloseTillModal({ isOpen, onClose, onTillClosed }) {
  const router = useRouter();
  const { till: contextTill, setCurrentTill, logout, location } = useStaff();
  const { tenders, loading: tendersLoading } = useLocationTenders(location?._id);
  const [till, setTill] = useState(null); // Fresh till data from API
  const [tenderCounts, setTenderCounts] = useState({}); // Physical count per tender
  const [closingNotes, setClosingNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [fetchingTill, setFetchingTill] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Track online/offline status
  useEffect(() => {
    setIsOnline(getOnlineStatus());
    
    const handleOnline = () => {
      console.log("🌐 Online detected in CloseTillModal");
      setIsOnline(true);
    };
    const handleOffline = () => {
      console.log("📴 Offline detected in CloseTillModal");
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Function to save till close to IndexedDB (offline)
  const saveTillCloseOffline = async (closeData) => {
    try {
      const request = indexedDB.open('SalesPOS', 1);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const db = event.target.result;
          const txStore = db.transaction(['till_closes'], 'readwrite').objectStore('till_closes');
          
          const tillCloseData = {
            ...closeData,
            synced: false,
            savedAt: new Date(),
          };

          const addRequest = txStore.put(tillCloseData);

          addRequest.onsuccess = () => {
            console.log('💾 Till close saved to IndexedDB:', addRequest.result);
            resolve(addRequest.result);
          };

          addRequest.onerror = () => {
            console.error('❌ Failed to save till close:', addRequest.error);
            reject(addRequest.error);
          };
        };

        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error('❌ Error saving till close offline:', err);
      throw err;
    }
  };

  // Fetch fresh till data when modal opens
  useEffect(() => {
    if (isOpen && contextTill?._id) {
      setFetchingTill(true);
      // Reset tender counts when opening modal
      setTenderCounts({});
      console.log("🔄 Modal opened - reset tenderCounts to: {}");
      console.log("🔄 Available tenders from hook:", tenders);
      console.log("🔄 Tenders loading state:", tendersLoading);
      
      // Fetch till by ID to get all populated data including transactions
      fetch(`/api/till/${contextTill._id}`)
        .then(res => res.json())
        .then(data => {
          if (data.till) {
            console.log("📋 Fresh till data fetched:", data.till);
            console.log("📋 Transactions count:", data.till.transactions?.length || 0);
            console.log("📋 Raw tender breakdown:", data.till.tenderBreakdown);
            console.log("📋 Tender breakdown type:", typeof data.till.tenderBreakdown);
            console.log("📋 Tender breakdown keys:", Object.keys(data.till.tenderBreakdown || {}));
            
            // Log each tender amount with formatting
            if (data.till.tenderBreakdown) {
              console.log("\n   🏦 EXPECTED AMOUNTS BY TENDER:");
              Object.entries(data.till.tenderBreakdown).forEach(([key, value]) => {
                console.log(`      💳 ${key}: ₦${(value || 0).toLocaleString('en-NG')}`);
              });
              console.log("");
            }
            
            setTill(data.till);
          } else {
            console.warn("⚠️ Failed to fetch till data:", data.message);
            setTill(contextTill); // Fallback to context till
          }
        })
        .catch(err => {
          console.error("❌ Error fetching till:", err);
          setTill(contextTill); // Fallback to context till
        })
        .finally(() => setFetchingTill(false));
    }
  }, [isOpen, contextTill]);

  useEffect(() => {
    if (till && isOpen) {
      // Calculate expected closing balance (opening + sales)
      const expectedClosing = till.openingBalance + (till.totalSales || 0);
      console.log("\n📊 ===== TILL SUMMARY FOR RECONCILIATION =====");
      console.log(`   Opening Balance: ₦${(till.openingBalance || 0).toLocaleString('en-NG')}`);
      console.log(`   Total Sales (stored): ₦${(till.totalSales || 0).toLocaleString('en-NG')}`);
      console.log(`   Expected Closing: ₦${expectedClosing.toLocaleString('en-NG')}`);
      console.log(`   Transaction Count: ${till.transactionCount || 0}`);
      console.log(`   Linked Transactions Array: ${till.transactions?.length || 0}`);
      
      // Convert tenderBreakdown to plain object
      let tenderBreakdownObj = {};
      if (till.tenderBreakdown) {
        if (typeof till.tenderBreakdown === 'object' && till.tenderBreakdown !== null) {
          // If it's already an object, use it directly
          if (Array.isArray(till.tenderBreakdown)) {
            // Handle if it's an array format
            console.log("⚠️ Tender breakdown is array format:", till.tenderBreakdown);
          } else {
            // Direct object assignment
            tenderBreakdownObj = { ...till.tenderBreakdown };
            
            console.log(`\n💰 TENDER BREAKDOWN (${Object.keys(tenderBreakdownObj).length} types):`);
            Object.entries(tenderBreakdownObj).forEach(([key, value]) => {
              console.log(`      💳 ${key}: ₦${(value || 0).toLocaleString('en-NG')}`);
            });
            console.log("");
          }
        }
      }
      
      setSummary({
        openingBalance: till.openingBalance,
        totalSales: till.totalSales || 0,
        expectedClosingBalance: expectedClosing,
        tenderBreakdown: tenderBreakdownObj,
      });
    }
  }, [till, isOpen]);

  // Debug: Log tenderCounts whenever it changes
  useEffect(() => {
    if (isOpen) {
      console.log("\n📊 Current tenderCounts state:");
      console.log("   Object:", tenderCounts);
      console.log("   Keys:", Object.keys(tenderCounts));
      Object.entries(tenderCounts).forEach(([id, value]) => {
        const tender = tenders?.find(t => t.id === id);
        console.log(`   💳 ${tender?.name || 'Unknown'} (${id}): ${value}`);
      });
    }
  }, [tenderCounts, isOpen]);

  const handleCloseTill = async () => {
    // Check if all tenders have been reconciled
    console.log("\n🔍 VALIDATION CHECK IN handleCloseTill");
    console.log("   Tenders array:", tenders);
    console.log("   Tenders length:", tenders?.length);
    console.log("   TenderCounts:", tenderCounts);
    console.log("   Online Status:", isOnline);
    
    if (!tenders || tenders.length === 0) {
      console.error("❌ Validation failed: No tenders available");
      setError("No payment methods available");
      return;
    }

    console.log("\n📋 Checking each tender:");
    const hasEmptyTenders = tenders.some(t => {
      const value = tenderCounts[t.id];
      const isEmpty = value === undefined || value === "" || value === null;
      console.log(`   💳 ${t.name} (${t.id}): value="${value}", isEmpty=${isEmpty}`);
      return isEmpty;
    });
    
    if (hasEmptyTenders) {
      console.error("❌ Validation failed: Some tenders are empty");
      setError("Please enter physical count for all payment methods");
      return;
    }
    console.log("✅ Validation passed - all tenders have values\n");

    setLoading(true);
    setError(null);

    try {
      console.log("📋 Closing till");
      console.log("   Till object:", till);
      console.log("   Till._id:", till._id);
      console.log("   Till._id type:", typeof till._id);
      
      // Build tender counts object with tender names as keys (for API)
      const tenderCountsForAPI = {};
      tenders.forEach(tender => {
        const physicalCount = parseFloat(tenderCounts[tender.id]) || 0;
        tenderCountsForAPI[tender.id] = physicalCount;
        console.log(`   💳 ${tender.name}: ₦${physicalCount.toFixed(2)}`);
      });
      
      console.log("📋 Tender counts to submit:", tenderCountsForAPI);

      // Convert till._id to string for sending
      const tillIdString = String(till._id);
      console.log(`📤 Sending till ID to API: "${tillIdString}"`);

      const payload = {
        tillId: tillIdString,
        tenderCounts: tenderCountsForAPI,
        closingNotes: closingNotes.trim(),
        summary: summary, // Include summary for offline storage
      };

      console.log("📋 Close till payload:", JSON.stringify(payload, null, 2));

      if (isOnline) {
        // ONLINE: Send to server
        console.log("🌐 Online - Sending till close to server");
        
        const response = await fetch("/api/till/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        console.log("📋 Close till response status:", response.status);

        if (!response.ok) {
          const data = await response.json();
          console.error("❌ API error response:", data);
          throw new Error(data.message || "Failed to close till");
        }

        const data = await response.json();
        console.log("✅ Till closed response:", data);

        setCurrentTill(null); // Clear till from context
        setTenderCounts({});
        setClosingNotes("");
        setError(null);

        console.log("✅ Till closed successfully");
        console.log("📊 EndOfDay report has been saved for inventory manager");
        onTillClosed(data.till);
      } else {
        // OFFLINE: Save to IndexedDB
        console.log("📴 Offline - Saving till close to IndexedDB");
        
        const tillCloseData = {
          _id: till._id,
          staffId: contextTill?.staffId || till.staffId,
          locationId: location?._id,
          tenderCounts: tenderCountsForAPI,
          closingNotes: closingNotes.trim(),
          summary: summary,
          tenderBreakdown: till.tenderBreakdown,
          transactionCount: till.transactionCount,
          openingBalance: till.openingBalance,
          totalSales: till.totalSales || 0,
          closedAt: new Date().toISOString(),
        };

        await saveTillCloseOffline(tillCloseData);
        
        setCurrentTill(null); // Clear till from context
        setTenderCounts({});
        setClosingNotes("");
        setError(null);

        console.log("✅ Till close saved offline - will sync when online");
        console.log("📊 Till reconciliation saved locally for sync");
        onTillClosed({ ...payload, offline: true });
      }
      
      // Clear context first, then close modal and redirect
      logout(); // Clear staff and location from context
      onClose();
      
      // Redirect to home - Layout will show login screen when staff is null
      console.log("🔄 Redirecting to login...");
      router.push("/").then(() => {
        console.log("✅ Redirected to login");
      }).catch(err => {
        console.error("❌ Redirect error:", err);
      });
    } catch (err) {
      console.error("❌ Error closing till:", err.message);
      console.error("❌ Full error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Show loading while fetching fresh till data
  if (fetchingTill) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg p-8 w-96 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-300 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading till data...</p>
        </div>
      </div>
    );
  }

  if (!till || !summary) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full mx-auto p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold text-gray-800">Close Till & Reconciliation</h2>
          {!isOnline && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-1 rounded text-sm font-semibold flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-yellow-600 rounded-full animate-pulse"></span>
              OFFLINE
            </div>
          )}
        </div>
        
        {/* Scrollable Content Area */}
        <div className="overflow-y-auto flex-1 pr-2">
          {/* Till Session Info */}
          <div className="text-sm text-gray-600 mb-4 pb-3 border-b border-gray-200">
            <p>Till Session: {till?.openedAt ? new Date(till.openedAt).toLocaleTimeString() : 'Unknown'}</p>
            <p className="text-xs text-gray-500">Reconciling {till?.transactionCount || 0} transactions from this session</p>
            {!isOnline && (
              <p className="text-xs text-yellow-600 mt-2 font-semibold">
                ℹ️ Working offline - reconciliation data will be saved locally and synced when back online
              </p>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Opening Balance */}
            <div className="bg-blue-50 border border-blue-200 p-4 rounded">
              <p className="text-sm text-gray-600">Opening Balance</p>
              <p className="text-2xl font-bold text-blue-600">
                {summary.openingBalance.toFixed(2)}
              </p>
            </div>

            {/* Transaction Count */}
            <div className="bg-orange-50 border border-orange-200 p-4 rounded">
              <p className="text-sm text-gray-600">Transactions</p>
              <p className="text-2xl font-bold text-orange-600">
                {till?.transactionCount || 0}
              </p>
            </div>

            {/* Total Sales */}
            <div className="bg-green-50 border border-green-200 p-4 rounded">
              <p className="text-sm text-gray-600">Total Sales</p>
              <p className="text-2xl font-bold text-green-600">
                {summary.totalSales.toFixed(2)}
              </p>
          </div>

          {/* Expected Closing Balance */}
          <div className="bg-purple-50 border border-purple-200 p-4 rounded">
            <p className="text-sm text-gray-600">Expected Closing</p>
            <p className="text-2xl font-bold text-purple-600">
              {summary.expectedClosingBalance.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Available Payment Methods (Tenders) */}
        {tenders && tenders.length > 0 && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded mb-6 border border-purple-200">
            <p className="font-semibold text-gray-800 mb-3">Available Payment Methods</p>
            <div className="grid grid-cols-2 gap-3">
              {tenders.map((tender) => {
                const tenderAmount = summary.tenderBreakdown[tender.name] || 0;
                return (
                  <div
                    key={tender.id}
                    className="p-3 rounded border-l-4 flex items-center justify-between"
                    style={{
                      borderLeftColor: tender.buttonColor || "#9dccebff",
                      backgroundColor: "white",
                    }}
                  >
                    <div>
                      <p className="font-medium text-gray-700">{tender.name}</p>
                      <p className="text-xs text-gray-500">{tender.classification}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tenderAmount > 0 ? "text-green-600" : "text-gray-400"}`}>
                        ₦{tenderAmount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tender Reconciliation Inputs */}
        {tenders && tenders.length > 0 && (
          <div className="bg-indigo-50 p-4 rounded mb-6 border border-indigo-200">
            <p className="font-semibold text-gray-800 mb-4">Reconcile Each Payment Method</p>
            <div className="space-y-4">
              {tenders.map((tender) => {
                // Get processed amount from tender breakdown (keyed by tender name)
                const processedAmount = summary?.tenderBreakdown?.[tender.name] || 0;
                const physicalCount = parseFloat(tenderCounts[tender.id]) || 0;
                const variance = physicalCount - processedAmount;
                
                console.log(`💳 ${tender.name}: processed=${processedAmount}, physical=${physicalCount}, variance=${variance}`);
                
                return (
                  <div
                    key={tender.id}
                    className="bg-white p-4 rounded border-l-4"
                    style={{ borderLeftColor: tender.buttonColor || "#9dccebff" }}
                  >
                    {/* Tender Header */}
                    <div className="mb-4 pb-3 border-b border-gray-200">
                      <p className="font-bold text-gray-800 text-lg">{tender.name}</p>
                      <p className="text-xs text-gray-500">{tender.classification}</p>
                    </div>
                    
                    {/* Three-column layout: Expected | Physical | Variance */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {/* Expected/Processed Amount */}
                      <div className="bg-blue-50 p-3 rounded border border-blue-200">
                        <p className="text-xs text-gray-600 font-semibold mb-1 uppercase">Expected</p>
                        <p className="text-xl font-bold text-blue-700">₦{processedAmount.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">From transactions</p>
                      </div>
                      
                      {/* Physical Count Input */}
                      <div className="bg-amber-50 p-4 rounded border border-amber-200">
                        <label className="text-sm text-gray-600 font-semibold mb-3 block uppercase">Physical Count</label>
                        <input
                          key={`physical-${tender.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={tenderCounts[tender.id] !== undefined ? tenderCounts[tender.id] : ""}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            const tenderId = tender.id;
                            const tenderName = tender.name;
                            
                            console.log(`\n========================================`);
                            console.log(`📝 INPUT CHANGED FOR: ${tenderName}`);
                            console.log(`   Tender ID: ${tenderId}`);
                            console.log(`   New Value: ${newValue}`);
                            console.log(`   Previous tenderCounts:`, { ...tenderCounts });
                            
                            setTenderCounts(prev => {
                              const updated = { ...prev };
                              updated[tenderId] = newValue;
                              
                              console.log(`   Updated tenderCounts:`, updated);
                              console.log(`   Breakdown:`);
                              Object.entries(updated).forEach(([id, val]) => {
                                const t = tenders?.find(x => x.id === id);
                                console.log(`      💳 ${t?.name || 'Unknown'} (${id}): ${val}`);
                              });
                              console.log(`========================================\n`);
                              
                              return updated;
                            });
                          }}
                          placeholder="0.00"
                          className="w-full border border-amber-300 rounded px-3 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                          disabled={loading}
                        />
                      </div>
                      
                      {/* Variance Display */}
                      <div className={`p-3 rounded border-2 flex flex-col justify-center ${
                        physicalCount === 0
                          ? "bg-gray-50 border-gray-300"
                          : variance === 0
                          ? "bg-green-50 border-green-500"
                          : variance > 0
                          ? "bg-yellow-50 border-yellow-500"
                          : "bg-red-50 border-red-500"
                      }`}>
                        <p className="text-xs text-gray-600 font-semibold mb-1 uppercase">Variance</p>
                        <p className={`text-xl font-bold ${
                          physicalCount === 0
                            ? "text-gray-400"
                            : variance === 0
                            ? "text-green-700"
                            : variance > 0
                            ? "text-yellow-700"
                            : "text-red-700"
                        }`}>
                          {physicalCount === 0 ? "—" : `${variance >= 0 ? "+" : ""}₦${variance.toFixed(2)}`}
                        </p>
                        <p className={`text-xs mt-1 ${
                          physicalCount === 0
                            ? "text-gray-500"
                            : variance === 0
                            ? "text-green-600 font-semibold"
                            : variance > 0
                            ? "text-yellow-600"
                            : "text-red-600 font-semibold"
                        }`}>
                          {physicalCount === 0 ? "Pending" : variance === 0 ? "✓ Perfect" : variance > 0 ? "Over" : "Short"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Closing Notes */}
        <div className="mb-6">
          <label className="block text-gray-700 font-semibold mb-3 text-lg">
            Closing Notes (Optional)
          </label>
          <textarea
            value={closingNotes}
            onChange={(e) => setClosingNotes(e.target.value)}
            placeholder="Note any discrepancies or issues..."
            className="w-full border border-gray-300 rounded px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="3"
            disabled={loading}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        </div>

        {/* Buttons - Fixed at bottom, outside scroll area */}
        <div className="flex gap-3 mt-4 flex-shrink-0 border-t border-gray-200 pt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-4 border-2 border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-lg min-h-14"
          >
            Cancel
          </button>
          {(() => {
            const isDisabled = loading || !tenders?.length || tenders?.some(t => tenderCounts[t.id] === undefined || tenderCounts[t.id] === "");
            if (isDisabled) {
              console.log("🔴 Close Till button is DISABLED:");
              console.log("   loading:", loading);
              console.log("   tenders?.length:", tenders?.length);
              if (tenders?.length > 0) {
                tenders.forEach(t => {
                  const val = tenderCounts[t.id];
                  console.log(`   ${t.name}: tenderCounts[${t.id}] = "${val}" (undefined: ${val === undefined}, empty: ${val === ""})`);
                });
              }
            }
            return (
              <button
                onClick={handleCloseTill}
                disabled={isDisabled}
                className="flex-1 px-4 py-4 bg-red-600 text-white rounded font-semibold hover:bg-red-700 disabled:opacity-50 text-lg min-h-14"
              >
                {loading ? "Closing..." : "Close Till"}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
