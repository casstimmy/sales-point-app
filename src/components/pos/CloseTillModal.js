// components/pos/CloseTillModal.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useStaff } from "../../context/StaffContext";
import { useLocationTenders } from "../../hooks/useLocationTenders";
import { getOnlineStatus, resolveTillId } from "../../lib/offlineSync";
import NumKeypad from "../common/NumKeypad";

// Helper to get offline till data from IndexedDB
const getOfflineTillData = async (tillId) => {
  try {
    const request = indexedDB.open('SalesPOS', 2);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        // Get transactions for this till
        const txStore = db.transaction(['transactions'], 'readonly').objectStore('transactions');
        const allTxRequest = txStore.getAll();
        
        allTxRequest.onsuccess = () => {
          const allTransactions = allTxRequest.result || [];
          // Filter transactions for this till
          const tillTransactions = allTransactions.filter(tx => tx.tillId === tillId);
          
          // Calculate totals from offline transactions
          let totalSales = 0;
          const tenderBreakdown = {};
          let unsyncedCount = 0;
          
          tillTransactions.forEach(tx => {
            totalSales += tx.total || 0;
            if (tx.synced !== true) {
              unsyncedCount += 1;
            }
            
            // Process tender payments
            if (tx.tenderPayments && Array.isArray(tx.tenderPayments)) {
              tx.tenderPayments.forEach(tp => {
                const tenderName = tp.tenderName || 'Cash';
                tenderBreakdown[tenderName] = (tenderBreakdown[tenderName] || 0) + (tp.amount || 0);
              });
            } else if (tx.tenderType) {
              tenderBreakdown[tx.tenderType] = (tenderBreakdown[tx.tenderType] || 0) + (tx.total || 0);
            }
          });
          
          resolve({
            transactionCount: tillTransactions.length,
            totalSales,
            tenderBreakdown,
            unsyncedCount,
          });
        };
        
        allTxRequest.onerror = () => reject(allTxRequest.error);
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error getting offline till data:', err);
    return { transactionCount: 0, totalSales: 0, tenderBreakdown: {}, unsyncedCount: 0 };
  }
};

const getPendingTransactionsForTill = async (tillId) => {
  try {
    const extraTillIds = [];
    try {
      const savedTill = typeof window !== 'undefined' ? localStorage.getItem('till') : null;
      if (savedTill) {
        const parsed = JSON.parse(savedTill);
        if (parsed?._id && parsed._id !== tillId) {
          extraTillIds.push(parsed._id);
        }
      }
    } catch (err) {
      // ignore localStorage errors
    }

    const request = indexedDB.open('SalesPOS', 2);
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const txStore = db.transaction(['transactions'], 'readonly').objectStore('transactions');
        const allTxRequest = txStore.getAll();
        allTxRequest.onsuccess = () => {
          const allTransactions = allTxRequest.result || [];
          const pending = allTransactions.filter(tx => {
            if (tx.synced === true) return false;
            if (tx.tillId === tillId) return true;
            return extraTillIds.includes(tx.tillId);
          });
          resolve(pending.length);
        };
        allTxRequest.onerror = () => reject(allTxRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error checking pending till transactions:', err);
    return 0;
  }
};

export default function CloseTillModal({ isOpen, onClose, onTillClosed }) {
  const router = useRouter();
  const { till: contextTill, setCurrentTill, logout, location } = useStaff();
  const { tenders, loading: tendersLoading } = useLocationTenders(location?._id);
  const [till, setTill] = useState(null);
  const [tenderCounts, setTenderCounts] = useState({});
  const [closingNotes, setClosingNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pendingLocalTransactions, setPendingLocalTransactions] = useState(0);
  const [fetchingTill, setFetchingTill] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [activeTenderKeypad, setActiveTenderKeypad] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Track online/offline status
  useEffect(() => {
    setIsOnline(getOnlineStatus());
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const updateIsMobile = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.matchMedia('(max-width: 640px)').matches);
    };
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  }, []);

  // Save till close to IndexedDB (offline)
  const saveTillCloseOffline = async (closeData) => {
    try {
      const request = indexedDB.open('SalesPOS', 2);
      
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
          addRequest.onsuccess = () => resolve(addRequest.result);
          addRequest.onerror = () => reject(addRequest.error);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error('Error saving till close offline:', err);
      throw err;
    }
  };

  // Fetch till data when modal opens (online or offline)
  useEffect(() => {
    if (isOpen && contextTill?._id) {
      setFetchingTill(true);
      setTenderCounts({});
      
      const fetchTillData = async () => {
        if (isOnline) {
          // Online: Fetch from API
          try {
            const res = await fetch(`/api/till/${contextTill._id}`);
            const data = await res.json();
            if (data.till) {
              setTill(data.till);
            } else {
              setTill(contextTill);
            }
            const offlineData = await getOfflineTillData(contextTill._id);
            setPendingLocalTransactions(offlineData.unsyncedCount || 0);
          } catch (err) {
            console.error("Error fetching till:", err);
            // Fallback to offline data
            const offlineData = await getOfflineTillData(contextTill._id);
            setTill({
              ...contextTill,
              ...offlineData,
            });
            setPendingLocalTransactions(offlineData.unsyncedCount || 0);
          }
        } else {
          // Offline: Use context + IndexedDB data
          const offlineData = await getOfflineTillData(contextTill._id);
          setTill({
            ...contextTill,
            transactionCount: offlineData.transactionCount || contextTill.transactionCount || 0,
            totalSales: offlineData.totalSales || contextTill.totalSales || 0,
            tenderBreakdown: offlineData.tenderBreakdown || contextTill.tenderBreakdown || {},
          });
          setPendingLocalTransactions(offlineData.unsyncedCount || 0);
        }
        setFetchingTill(false);
      };
      
      fetchTillData();
    }
  }, [isOpen, contextTill, isOnline]);

  useEffect(() => {
    if (!isOpen || contextTill?._id) return;
    if (typeof window === 'undefined') return;
    try {
      const persistedTill = localStorage.getItem('till');
      if (!persistedTill) return;
      const parsedTill = JSON.parse(persistedTill);
      if (parsedTill?._id) {
        setCurrentTill(parsedTill);
        setTill(parsedTill);
      }
    } catch (error) {
      console.warn('Failed to hydrate till for close modal:', error);
    }
  }, [isOpen, contextTill, setCurrentTill]);

  // Calculate summary when till data is available
  useEffect(() => {
    if (till && isOpen) {
      const expectedClosing = (till.openingBalance || 0) + (till.totalSales || 0);
      
      let tenderBreakdownObj = {};
      if (till.tenderBreakdown && typeof till.tenderBreakdown === 'object') {
        tenderBreakdownObj = { ...till.tenderBreakdown };
      }
      
      setSummary({
        openingBalance: till.openingBalance || 0,
        totalSales: till.totalSales || 0,
        expectedClosingBalance: expectedClosing,
        tenderBreakdown: tenderBreakdownObj,
        pendingLocalTransactions: pendingLocalTransactions || 0,
      });
    }
  }, [till, isOpen, pendingLocalTransactions]);

  const handleCloseTill = async () => {
    if (!tenders || tenders.length === 0) {
      setError("No payment methods available");
      return;
    }

    if (isOnline && pendingLocalTransactions > 0) {
      setError("Pending transactions have not synced. Please sync before closing the till.");
      return;
    }

    const hasEmptyTenders = tenders.some(t => 
      tenderCounts[t.id] === undefined || tenderCounts[t.id] === ""
    );
    
    if (hasEmptyTenders) {
      setError("Please enter physical count for all payment methods");
      return;
    }

    // Show confirmation modal instead of proceeding directly
    setShowConfirmation(true);
  };

  const handleConfirmCloseTill = async () => {
    setShowConfirmation(false);
    setLoading(true);
    setError(null);

    try {
      const tenderCountsForAPI = {};
      tenders.forEach(tender => {
        tenderCountsForAPI[tender.id] = parseFloat(tenderCounts[tender.id]) || 0;
      });

      let resolvedTillId = till._id;
      if (isOnline && String(till._id).startsWith('offline-till-')) {
        const mapped = await resolveTillId(till._id, till);
        if (mapped) {
          resolvedTillId = mapped;
        }
      }

      const payload = {
        tillId: String(resolvedTillId),
        tenderCounts: tenderCountsForAPI,
        closingNotes: closingNotes.trim(),
        summary: summary,
      };

      if (isOnline) {
        // Ensure all local transactions are synced before closing till
        try {
          const { syncPendingTransactions } = await import('../../lib/offlineSync');
          await syncPendingTransactions();
        } catch (err) {
          console.warn('⚠️ Could not sync pending transactions before closing till:', err?.message || err);
        }

        const pendingAfterSync = await getPendingTransactionsForTill(till._id);
        if (pendingAfterSync > 0) {
          setError("Pending transactions are still unsynced. Please sync and try again.");
          setLoading(false);
          return;
        }

        const response = await fetch("/api/till/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Failed to close till");
        }

        const data = await response.json();
        onTillClosed(data.till);
      } else {
        const tillCloseData = {
          _id: till._id,
          staffId: contextTill?.staffId || till.staffId,
          staffName: contextTill?.staffName || till.staffName,
          storeId: till.storeId || contextTill?.storeId,
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
        onTillClosed({ ...payload, offline: true });
      }

      setCurrentTill(null);
      setTenderCounts({});
      setClosingNotes("");
      logout();
      onClose();
      router.push("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    if (!isOnline || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const { syncPendingTillOpens, syncPendingTransactions } = await import('../../lib/offlineSync');
      await syncPendingTillOpens();
      await syncPendingTransactions();
      const pendingAfterSync = await getPendingTransactionsForTill(till?._id);
      setPendingLocalTransactions(pendingAfterSync || 0);
      if (pendingAfterSync > 0) {
        setError("Some transactions are still pending. Please try again.");
      }
    } catch (err) {
      console.warn('⚠️ Sync failed:', err?.message || err);
      setError("Sync failed. Please check connection and try again.");
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  if (fetchingTill) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-300 border-t-cyan-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading till data...</p>
        </div>
      </div>
    );
  }

  if (!till || !summary) return null;

  const isButtonDisabled = loading || syncing || !tenders?.length || 
    tenders?.some(t => tenderCounts[t.id] === undefined || tenderCounts[t.id] === "");

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[calc(100vh-1rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white px-3 py-2 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold">Close Till & Reconciliation</h2>
            <p className="text-cyan-100 text-xs">
              Session: {till?.openedAt ? new Date(till.openedAt).toLocaleTimeString() : 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isOnline && (
              <div className="bg-yellow-500 text-yellow-900 px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-900 rounded-full animate-pulse"></span>
                OFFLINE
              </div>
            )}
            <button
              onClick={onClose}
              disabled={loading}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors active:scale-95"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Content - Grid Layout */}
        <div className="flex-1 p-2 grid grid-cols-3 gap-2 overflow-hidden">
          {/* Left Column - Summary Cards */}
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-300 rounded p-2">
              <p className="text-xs text-cyan-700 font-semibold uppercase">Opening Balance</p>
              <p className="text-base font-bold text-cyan-800">₦{Number(summary.openingBalance).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            
            <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-300 rounded p-2">
              <p className="text-xs text-green-700 font-semibold uppercase">Total Sales</p>
              <p className="text-base font-bold text-green-800">₦{Number(summary.totalSales).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-300 rounded p-2">
              <p className="text-xs text-purple-700 font-semibold uppercase">Expected Closing</p>
              <p className="text-base font-bold text-purple-800">₦{Number(summary.expectedClosingBalance).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-300 rounded p-2">
              <p className="text-xs text-orange-700 font-semibold uppercase">Transactions</p>
              <p className="text-base font-bold text-orange-800">{till?.transactionCount || 0}</p>
            </div>

            {pendingLocalTransactions > 0 && (
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded p-2">
                <p className="text-xs text-yellow-800 font-semibold uppercase">Pending Sync</p>
                <p className="text-base font-bold text-yellow-900">{pendingLocalTransactions}</p>
                <p className="text-xs text-yellow-800 mt-1">Sync before closing till.</p>
                {isOnline && (
                  <button
                    onClick={handleSyncNow}
                    disabled={syncing}
                    className="mt-2 w-full px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-bold transition disabled:opacity-60"
                  >
                    {syncing ? "Syncing..." : "Sync Now"}
                  </button>
                )}
              </div>
            )}

            {/* Offline Notice */}
            {!isOnline && (
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-3">
                <p className="text-xs text-yellow-800 font-semibold">
                  ⚠️ Data from local storage. Will sync when online.
                </p>
              </div>
            )}
          </div>

          {/* Middle Column - Tender Reconciliation */}
          <div className="flex flex-col overflow-hidden">
            <h3 className="text-sm font-bold text-gray-700 uppercase mb-2">Reconcile Payment Methods</h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {tenders && tenders.map((tender) => {
                const processedAmount = summary?.tenderBreakdown?.[tender.name] || 0;
                const physicalCount = parseFloat(tenderCounts[tender.id]) || 0;
                const variance = physicalCount - processedAmount;
                const hasValue = tenderCounts[tender.id] !== undefined && tenderCounts[tender.id] !== "";
                const isActive = activeTenderKeypad === tender.id;
                
                return (
                  <div key={tender.id}>
                    <div
                      className="bg-white rounded-lg border-2 border-gray-200 p-3 cursor-pointer hover:border-cyan-400 transition-all"
                      style={{ borderLeftColor: tender.buttonColor || "#06b6d4", borderLeftWidth: "4px" }}
                      onClick={() => setActiveTenderKeypad(tender.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-gray-800">{tender.name}</span>
                        <span className="text-sm text-gray-500">Expected: ₦{Number(processedAmount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <input
                            type={isMobile ? "number" : "text"}
                            inputMode={isMobile ? "decimal" : undefined}
                            value={tenderCounts[tender.id] !== undefined ? tenderCounts[tender.id] : ""}
                            readOnly={!isMobile}
                            onChange={(e) => {
                              if (!isMobile) return;
                              setTenderCounts(prev => ({ ...prev, [tender.id]: e.target.value }));
                            }}
                            placeholder="Tap to enter"
                            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-lg font-bold focus:outline-none text-gray-700 bg-gray-50"
                          />
                        </div>
                        <div className={`w-24 flex flex-col items-center justify-center rounded-lg text-sm font-bold ${
                          !hasValue ? "bg-gray-100 text-gray-400" :
                          variance === 0 ? "bg-green-100 text-green-700" :
                          variance > 0 ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {!hasValue ? "—" : (
                            <>
                              <span>₦{Number(variance).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-xs">{variance === 0 ? "✓ OK" : variance > 0 ? "Over" : "Short"}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Keypad appears below active tender */}
                    {isActive && !isMobile && (
                      <div className="mt-1 p-2 bg-gray-50 rounded border border-cyan-400">
                        <NumKeypad
                          value={tenderCounts[tender.id] || ""}
                          onChange={(newValue) => {
                            setTenderCounts(prev => ({ ...prev, [tender.id]: newValue }));
                          }}
                          placeholder={`Enter ${tender.name} amount`}
                          disabled={loading}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column - Notes & Actions */}
          <div className="flex flex-col">
            <h3 className="text-sm font-bold text-gray-700 uppercase mb-2">Closing Notes</h3>
            <textarea
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Note any discrepancies or issues..."
              className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 resize-none"
              disabled={loading}
            />
            
            {/* Error Message */}
            {error && (
              <div className="mt-3 bg-red-50 border-2 border-red-300 rounded-xl p-3">
                <p className="text-sm font-semibold text-red-700">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Buttons */}
        <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={loading || showConfirmation}
            className="flex-1 px-4 py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg text-base transition-all active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCloseTill}
            disabled={isButtonDisabled || showConfirmation}
            className="flex-1 px-4 py-3.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg text-base transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Closing Till..." : "Close Till & Logout"}
          </button>
        </div>
      </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            {/* Warning Icon & Title */}
            <div className="flex items-start gap-3">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Confirm Till Closure</h3>
                <p className="text-sm text-gray-600 mt-1">Are you sure you want to close this till? This action cannot be undone.</p>
              </div>
            </div>

            {/* Summary Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Total Sales:</span>
                <span className="font-bold text-gray-800">₦{Number(summary?.totalSales || 0).toLocaleString('en-NG')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Expected Closing:</span>
                <span className="font-bold text-gray-800">₦{Number(summary?.expectedClosingBalance || 0).toLocaleString('en-NG')}</span>
              </div>
              {closingNotes && (
                <div className="pt-2 border-t border-blue-200 mt-2">
                  <p className="text-xs text-gray-600 font-semibold">Notes:</p>
                  <p className="text-sm text-gray-700 mt-0.5">{closingNotes}</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCloseTill}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Yes, Close Till"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
