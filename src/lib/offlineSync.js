/**
 * Offline Sync Service
 * 
 * Handles:
 * - Offline data persistence (transactions, cart)
 * - Auto-sync of transactions to cloud
 * - Manual sync of products
 * - Image placeholder when offline
 */

const SYNC_INTERVAL = 30000; // Auto-sync every 30 seconds
let syncInterval = null;
let isOnline = typeof window !== 'undefined' ? navigator.onLine : true;

/**
 * Initialize offline sync system
 */
export function initOfflineSync() {
  if (typeof window === 'undefined') return; // SSR check

  // Listen for online/offline events
  window.addEventListener('online', () => {
    console.log('🟢 Online - Syncing queued transactions and till closes');
    isOnline = true;
    // Sync immediately when coming back online
    syncPendingTransactions().catch(err => 
      console.error('Sync transactions after coming online failed:', err)
    );
    syncPendingTillCloses().catch(err => 
      console.error('Sync till closes after coming online failed:', err)
    );
  });

  window.addEventListener('offline', () => {
    console.log('🔴 Offline - Transactions will queue');
    isOnline = false;
    stopAutoSync();
  });

  // Don't start auto-sync - only sync when coming back online
}

/**
 * Sync pending transactions (called manually or on "coming online" event)
 */
export function startAutoSync() {
  // Deprecated - no longer used
  // Transactions now sync only on "coming back online" event + manual button
  console.log('ℹ️ Auto-sync deprecated - syncing only on demand and when coming online');
}

/**
 * Stop automatic sync
 */
export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Check if online
 */
export function getOnlineStatus() {
  return isOnline;
}

/**
 * Save transaction to IndexedDB (offline-first)
 */
export async function saveTransactionOffline(transaction) {
  try {
    const request = indexedDB.open('SalesPOS', 1);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const txStore = db.transaction(['transactions'], 'readwrite')
          .objectStore('transactions');
        
        const txData = {
          ...transaction,
          synced: false,
          syncedAt: null,
          attempts: 0,
        };

        // Use put instead of add to allow auto-increment
        const addRequest = txStore.put(txData);

        addRequest.onsuccess = () => {
          console.log('💾 Transaction saved offline with ID:', addRequest.result);
          resolve(addRequest.result);
        };

        addRequest.onerror = () => {
          console.error('❌ Failed to save transaction offline:', addRequest.error);
          reject(addRequest.error);
        };
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('❌ Error saving transaction offline:', err);
    throw err;
  }
}

/**
 * Sync pending transactions to cloud
 */
export async function syncPendingTransactions() {
  if (!isOnline) {
    console.log('⚠️ Offline - Skipping cloud sync');
    return;
  }

  try {
    const request = indexedDB.open('SalesPOS', 1);

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const txStore = db.transaction(['transactions'], 'readonly')
          .objectStore('transactions');
        
        const getAllRequest = txStore.getAll();

        getAllRequest.onsuccess = async () => {
          const allTransactions = getAllRequest.result;
          
          // Filter out old invalid transactions and only get unsync'd ones
          const transactions = allTransactions.filter(tx => {
            // Skip if already synced
            if (tx.synced) return false;
            
            // Skip if invalid status (old cart objects with 'COMPLETE' instead of 'completed')
            const validStatuses = ['completed', 'held', 'refunded'];
            if (tx.status && !validStatuses.includes(tx.status)) {
              console.warn(`⚠️ Skipping transaction with invalid status: ${tx.status}`);
              return false;
            }
            
            return true;
          });

          if (transactions.length === 0) {
            console.log('✅ All transactions synced');
            resolve();
            return;
          }

          console.log(`🔄 Syncing ${transactions.length} transactions to cloud...`);

          // Sync each transaction
          let synced = 0;
          let failed = 0;

          for (const tx of transactions) {
            try {
              console.log(`📊 Syncing transaction:`, tx);
              const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tx),
              });

              if (response.ok) {
                // Mark as synced
                await markTransactionSynced(tx.id);
                synced++;
                console.log(`✅ Transaction ${tx.id} synced`);
              } else {
                failed++;
                const errorData = await response.json();
                console.warn(`⚠️ Failed to sync transaction ${tx.id}: ${response.status}`, errorData);
              }
            } catch (err) {
              failed++;
              console.error(`❌ Error syncing transaction ${tx.id}:`, err);
            }
          }

          console.log(`📊 Sync complete: ${synced} synced, ${failed} failed`);
          resolve();
        };

        getAllRequest.onerror = () => reject(getAllRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('❌ Error syncing transactions:', err);
    throw err;
  }
}

/**
 * Mark transaction as synced in IndexedDB
 */
export async function markTransactionSynced(transactionId) {
  try {
    const request = indexedDB.open('SalesPOS', 1);

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const txStore = db.transaction(['transactions'], 'readwrite')
          .objectStore('transactions');

        const getRequest = txStore.get(transactionId);

        getRequest.onsuccess = () => {
          const tx = getRequest.result;
          if (tx) {
            tx.synced = true;
            tx.syncedAt = new Date().toISOString();
            txStore.put(tx);
          }
        };

        getRequest.onerror = () => reject(getRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('❌ Error marking transaction as synced:', err);
    throw err;
  }
}

/**
 * Get pending transactions count
 */
export async function getPendingTransactionsCount() {
  try {
    const request = indexedDB.open('SalesPOS', 1);

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const txStore = db.transaction(['transactions'], 'readonly')
          .objectStore('transactions');

        const index = txStore.index('synced');
        const countRequest = index.count(false);

        countRequest.onsuccess = () => {
          resolve(countRequest.result);
        };

        countRequest.onerror = () => reject(countRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('❌ Error getting pending transactions count:', err);
    return 0;
  }
}

/**
 * Sync pending till closes to cloud
 */
export async function syncPendingTillCloses() {
  if (!isOnline) {
    console.log('⚠️ Offline - Skipping till close sync');
    return;
  }

  try {
    const request = indexedDB.open('SalesPOS', 1);

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const closeStore = db.transaction(['till_closes'], 'readonly')
          .objectStore('till_closes');
        
        const getAllRequest = closeStore.getAll();

        getAllRequest.onsuccess = async () => {
          const allCloses = getAllRequest.result;
          
          // Filter out synced till closes
          const unsyncedCloses = allCloses.filter(close => !close.synced);
          
          if (unsyncedCloses.length === 0) {
            console.log('ℹ️ No pending till closes to sync');
            resolve([]);
            return;
          }

          console.log(`🔄 Syncing ${unsyncedCloses.length} pending till closes...`);

          const syncedIds = [];

          // Sync each till close
          for (const tillClose of unsyncedCloses) {
            try {
              console.log(`🔄 Syncing till close: ${tillClose._id}`);
              
              const response = await fetch('/api/till/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tillId: String(tillClose._id),
                  tenderCounts: tillClose.tenderCounts,
                  closingNotes: tillClose.closingNotes,
                  summary: tillClose.summary,
                }),
              });

              if (!response.ok) {
                console.error(`❌ Failed to sync till close: ${response.status}`);
                continue;
              }

              console.log(`✅ Till close synced: ${tillClose._id}`);
              syncedIds.push(tillClose._id);
              
              // Mark as synced in IndexedDB
              await markTillCloseSynced(tillClose._id);
            } catch (err) {
              console.error(`❌ Error syncing till close: ${err.message}`);
            }
          }

          console.log(`✅ Till closes sync complete: ${syncedIds.length} synced`);
          resolve(syncedIds);
        };

        getAllRequest.onerror = () => reject(getAllRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('❌ Error syncing till closes:', err);
    throw err;
  }
}

/**
 * Mark till close as synced in IndexedDB
 */
export async function markTillCloseSynced(tillId) {
  try {
    const request = indexedDB.open('SalesPOS', 1);

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const closeStore = db.transaction(['till_closes'], 'readwrite')
          .objectStore('till_closes');
        
        // Get the record
        const getRequest = closeStore.get(tillId);

        getRequest.onsuccess = () => {
          const close = getRequest.result;
          if (close) {
            close.synced = true;
            close.syncedAt = new Date();
            
            const updateRequest = closeStore.put(close);
            updateRequest.onsuccess = () => {
              console.log(`✅ Marked till close as synced: ${tillId}`);
              resolve();
            };
            updateRequest.onerror = () => reject(updateRequest.error);
          } else {
            resolve();
          }
        };

        getRequest.onerror = () => reject(getRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('❌ Error marking till close as synced:', err);
    throw err;
  }
}

/**
 * Get image URL with fallback
 * Returns placeholder when offline, real URL when online
 */
export function getImageUrl(product) {
  if (!isOnline) {
    return null; // Return null to trigger placeholder
  }

  if (product.images && product.images.length > 0 && product.images[0].full) {
    return product.images[0].full;
  }

  return null;
}
/**
 * Check if should show placeholder
 */
export function shouldShowPlaceholder(product) {
  return !isOnline || !getImageUrl(product);
}
