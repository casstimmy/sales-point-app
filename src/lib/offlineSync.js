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
const DB_VERSION = 3;
const DB_NAME = 'SalesPOS';

// Concurrency lock for syncPendingTransactions to prevent parallel runs
let _isSyncing = false;
// Guard to prevent duplicate event listener registration
let _offlineSyncInitialized = false;

const ensureStores = (db) => {
  // Products store (used by indexedDB.js)
  if (!db.objectStoreNames.contains('products')) {
    const productStore = db.createObjectStore('products', { keyPath: '_id' });
    productStore.createIndex('category', 'category', { unique: false });
  }
  // Categories store (used by indexedDB.js)
  if (!db.objectStoreNames.contains('categories')) {
    db.createObjectStore('categories', { keyPath: '_id' });
  }
  // Transactions store
  if (!db.objectStoreNames.contains('transactions')) {
    const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
    txStore.createIndex('synced', 'synced', { unique: false });
    txStore.createIndex('createdAt', 'createdAt', { unique: false });
  }
  // Sync metadata store (used by indexedDB.js)
  if (!db.objectStoreNames.contains('sync_meta')) {
    db.createObjectStore('sync_meta', { keyPath: 'key' });
  }
  // Till closes store
  if (!db.objectStoreNames.contains('till_closes')) {
    const tillCloseStore = db.createObjectStore('till_closes', { keyPath: '_id' });
    tillCloseStore.createIndex('synced', 'synced', { unique: false });
    tillCloseStore.createIndex('closedAt', 'closedAt', { unique: false });
  }
  // Till opens store
  if (!db.objectStoreNames.contains('till_opens')) {
    const tillOpenStore = db.createObjectStore('till_opens', { keyPath: '_id' });
    tillOpenStore.createIndex('synced', 'synced', { unique: false });
    tillOpenStore.createIndex('openedAt', 'openedAt', { unique: false });
  }
};

const openSalesPosDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      ensureStores(db);
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = () => reject(request.error);
  });
let syncInterval = null;
let isOnline = typeof window !== 'undefined' ? navigator.onLine : true;

async function ensureExternalIdsInTransactions() {
  try {
    const db = await openSalesPosDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['transactions'], 'readwrite').objectStore('transactions');
      const req = tx.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        all.forEach((item) => {
          if (!item) return;
          if (item.externalId || item.clientId) return;
          const legacyId = item.id ? `legacy-${item.id}` : `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          item.externalId = legacyId;
          item.clientId = legacyId;
          tx.put(item);
        });
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('⚠️ Could not backfill transaction externalIds:', err?.message || err);
  }
}

/**
 * Initialize offline sync system
 */
export function initOfflineSync() {
  if (typeof window === 'undefined') return; // SSR check

  // Prevent duplicate initialization — listeners must only be registered once
  if (_offlineSyncInitialized) {
    console.log('ℹ️ Offline sync already initialized, skipping');
    return;
  }
  _offlineSyncInitialized = true;

  // Ensure legacy transactions have stable externalIds for de-duplication
  ensureExternalIdsInTransactions();

  // Listen for online/offline events (registered ONCE)
  window.addEventListener('online', () => {
    console.log('🟢 Online - Syncing queued transactions and till closes');
    isOnline = true;
    // Sync immediately when coming back online
    (async () => {
      try {
        await syncPendingTillOpens();
        await syncPendingTransactions();
        await syncPendingTillCloses();
      } catch (err) {
        console.error('Sync after coming online failed:', err);
      }
    })();
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
    if (!transaction?.staffName || !transaction?.location) {
      throw new Error('Cannot save transaction without staff name and location');
    }

    const baseId = transaction.externalId || transaction.clientId || transaction.id;
    const generatedId = baseId
      ? String(baseId)
      : `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const db = await openSalesPosDb();
    
    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readwrite')
        .objectStore('transactions');
        
      const txData = {
        ...transaction,
        externalId: transaction.externalId || generatedId,
        clientId: transaction.clientId || generatedId,
        synced: false,
        syncedAt: null,
        attempts: 0,
      };

      // Use put instead of add to allow auto-increment
      const addRequest = txStore.put(txData);

      addRequest.onsuccess = () => {
        console.log('💾 Transaction saved offline with ID:', addRequest.result);
        // Update till in localStorage with new sales totals
        updateTillInLocalStorage(transaction.tillId, transaction.total || 0);
        resolve(addRequest.result);
      };

      addRequest.onerror = () => {
        console.error('❌ Failed to save transaction offline:', addRequest.error);
        reject(addRequest.error);
      };
    });
  } catch (err) {
    console.error('❌ Error saving transaction offline:', err);
    throw err;
  }
}

/**
 * Update the till stored in localStorage with new transaction totals
 * Called after each offline transaction is saved
 */
function updateTillInLocalStorage(tillId, transactionTotal) {
  try {
    if (typeof window === 'undefined') return;
    const savedTill = localStorage.getItem('till');
    if (!savedTill) return;

    const till = JSON.parse(savedTill);
    if (!till || !till._id) return;

    // Only update if the transaction belongs to this till
    if (String(till._id) !== String(tillId)) return;

    till.totalSales = (till.totalSales || 0) + (transactionTotal || 0);
    till.transactionCount = (till.transactionCount || 0) + 1;

    localStorage.setItem('till', JSON.stringify(till));
    console.log(`📊 Till localStorage updated - Sales: ₦${till.totalSales}, Transactions: ${till.transactionCount}`);
  } catch (err) {
    console.warn('⚠️ Could not update till in localStorage:', err);
  }
}

/**
 * Get offline transaction totals for a specific till from IndexedDB
 * Used by login page to show accurate sales figures when offline
 */
export async function getOfflineTillSales(tillId) {
  try {
    const db = await openSalesPosDb();
    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readonly').objectStore('transactions');
      const getAllReq = txStore.getAll();
      getAllReq.onsuccess = () => {
        const all = getAllReq.result || [];
        const tillTx = all.filter(tx => String(tx.tillId) === String(tillId));
        let totalSales = 0;
        tillTx.forEach(tx => { totalSales += (tx.total || 0); });
        resolve({ totalSales, transactionCount: tillTx.length });
      };
      getAllReq.onerror = () => reject(getAllReq.error);
    });
  } catch (err) {
    console.warn('⚠️ Could not get offline till sales:', err);
    return { totalSales: 0, transactionCount: 0 };
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

  // Concurrency lock — only one sync at a time
  if (_isSyncing) {
    console.log('ℹ️ Sync already in progress, skipping duplicate call');
    return;
  }
  _isSyncing = true;

  try {
    await ensureExternalIdsInTransactions();
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
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
              if (!tx.staffName || !tx.location) {
                failed++;
                console.warn(`⚠️ Skipping transaction ${tx.id} - missing staffName or location`);
                continue;
              }

              if (tx.tillId && String(tx.tillId).startsWith('offline-till-')) {
                const resolved = await resolveTillId(tx.tillId, tx);
                if (!resolved) {
                  failed++;
                  console.warn(`⚠️ Skipping transaction ${tx.id} - till not mapped yet`);
                  continue;
                }
                // Persist resolved tillId back to IndexedDB so retries don't need to re-resolve
                const origOfflineTillId = tx.tillId;
                tx.tillId = resolved;
                try {
                  const updateDb = await openSalesPosDb();
                  await new Promise((res, rej) => {
                    const updateStore = updateDb.transaction(['transactions'], 'readwrite')
                      .objectStore('transactions');
                    const getReq = updateStore.get(tx.id);
                    getReq.onsuccess = () => {
                      const record = getReq.result;
                      if (record) {
                        record.tillId = resolved;
                        record.originalOfflineTillId = origOfflineTillId;
                        const putReq = updateStore.put(record);
                        putReq.onsuccess = () => res();
                        putReq.onerror = () => rej(putReq.error);
                      } else { res(); }
                    };
                    getReq.onerror = () => rej(getReq.error);
                  });
                } catch (e) {
                  console.warn('⚠️ Could not persist resolved tillId:', e);
                }
              }

              const payload = {
                ...tx,
                externalId: tx.externalId || tx.clientId || String(tx.id),
              };
              console.log(`📊 Syncing transaction:`, payload);
              const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
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
    });
  } catch (err) {
    console.error('❌ Error syncing transactions:', err);
    throw err;
  } finally {
    _isSyncing = false;
  }
}

/**
 * Mark transaction as synced in IndexedDB
 */
export async function markTransactionSynced(transactionId) {
  try {
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readwrite')
        .objectStore('transactions');

        const getRequest = txStore.get(transactionId);

        getRequest.onsuccess = () => {
          const tx = getRequest.result;
          if (tx) {
            tx.synced = true;
            tx.syncedAt = new Date().toISOString();
            const putRequest = txStore.put(tx);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
          } else {
            resolve(); // Nothing to update
          }
        };

      getRequest.onerror = () => reject(getRequest.error);
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
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readonly')
        .objectStore('transactions');

      const index = txStore.index('synced');
      const countRequest = index.count(false);

      countRequest.onsuccess = () => {
        resolve(countRequest.result);
      };

      countRequest.onerror = () => reject(countRequest.error);
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
    // Ensure till opens + transactions are synced before closing tills
    await syncPendingTillOpens();
    await syncPendingTransactions();

    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
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
              
              let resolvedTillId = tillClose._id;
              if (String(tillClose._id).startsWith('offline-till-')) {
                const mapped = await resolveTillId(tillClose._id, tillClose);
                if (!mapped) {
                  // Check how old this record is — if > 24 hours, mark as synced to unblock
                  const savedAt = tillClose.savedAt ? new Date(tillClose.savedAt).getTime() : 0;
                  const ageMs = Date.now() - savedAt;
                  if (ageMs > 24 * 60 * 60 * 1000) {
                    console.warn(`⚠️ Stale offline till close (${Math.round(ageMs / 3600000)}h old) — marking as synced: ${tillClose._id}`);
                    await markTillCloseSynced(tillClose._id);
                    syncedIds.push(tillClose._id);
                  } else {
                    console.warn(`⚠️ Till close skipped - till not mapped yet: ${tillClose._id}`);
                  }
                  continue;
                }
                resolvedTillId = mapped;
              }
              
              const response = await fetch('/api/till/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tillId: String(resolvedTillId),
                  tenderCounts: tillClose.tenderCounts,
                  closingNotes: tillClose.closingNotes,
                  summary: tillClose.summary,
                }),
              });

              const responseData = await response.json().catch(() => ({}));

              if (!response.ok && response.status !== 404) {
                // Real error (not 404) — skip and retry later
                console.error(`❌ Failed to sync till close: ${response.status}`, responseData.message);
                continue;
              }

              // Mark as synced for:
              // - 200 OK (success or "already closed")
              // - 404 (till not found on server — stale record, clear it)
              if (response.status === 404) {
                console.warn(`⚠️ Till ${resolvedTillId} not found on server — marking close as synced to clear stale record`);
              } else {
                console.log(`✅ Till close synced: ${tillClose._id}`);
              }
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
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
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
    });
  } catch (err) {
    console.error('❌ Error marking till close as synced:', err);
    throw err;
  }
}

/**
 * Save offline till open (for later sync)
 */
export async function saveTillOpenOffline(openData) {
  try {
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const store = db.transaction(['till_opens'], 'readwrite')
        .objectStore('till_opens');

        const record = {
          ...openData,
          synced: false,
          savedAt: new Date().toISOString(),
        };

        const addRequest = store.put(record);
        addRequest.onsuccess = () => resolve(addRequest.result);
      addRequest.onerror = () => reject(addRequest.error);
    });
  } catch (err) {
    console.error('❌ Error saving till open offline:', err);
    throw err;
  }
}

/**
 * Sync pending till opens to cloud
 */
export async function syncPendingTillOpens() {
  if (!isOnline) return;

  try {
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const store = db.transaction(['till_opens'], 'readonly')
        .objectStore('till_opens');

        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = async () => {
          const allOpens = getAllRequest.result || [];
          const pending = allOpens.filter(open => !open.synced);

          for (const open of pending) {
            await syncSingleTillOpen(open);
          }
          resolve();
        };
      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  } catch (err) {
    console.error('❌ Error syncing till opens:', err);
  }
}

async function syncSingleTillOpen(openRecord) {
  try {
    const response = await fetch('/api/till/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: openRecord.staffId,
        staffName: openRecord.staffName,
        storeId: openRecord.storeId,
        locationId: openRecord.locationId,
        openingBalance: openRecord.openingBalance,
      }),
    });

    let serverTillId = null;
    if (response.ok) {
      const data = await response.json();
      serverTillId = data?.till?._id;
    } else {
      const data = await response.json();
      if (data?.existingTill?._id) {
        serverTillId = data.existingTill._id;
      } else {
        console.warn('⚠️ Till open sync failed:', data?.message || response.status);
        return;
      }
    }

    await markTillOpenSynced(openRecord._id, serverTillId);

    // Update local stored till if it matches offline id
    try {
      const savedTill = localStorage.getItem('till');
      if (savedTill) {
        const till = JSON.parse(savedTill);
        if (till && till._id === openRecord._id) {
          till._id = serverTillId;
          localStorage.setItem('till', JSON.stringify(till));
        }
      }
    } catch (err) {
      // ignore
    }
  } catch (err) {
    console.error('❌ Error syncing till open:', err);
  }
}

async function markTillOpenSynced(offlineId, serverTillId) {
  const db = await openSalesPosDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(['till_opens'], 'readwrite')
      .objectStore('till_opens');

    const getRequest = store.get(offlineId);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.synced = true;
        record.serverTillId = serverTillId;
        record.syncedAt = new Date().toISOString();
        store.put(record);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function getTillOpenRecord(offlineId) {
  const db = await openSalesPosDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(['till_opens'], 'readonly')
      .objectStore('till_opens');
    const getRequest = store.get(offlineId);
    getRequest.onsuccess = () => resolve(getRequest.result || null);
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Resolve offline till id to server till id
 */
export async function resolveTillId(offlineId, fallbackData) {
  if (!String(offlineId).startsWith('offline-till-')) return offlineId;

  const record = await getTillOpenRecord(offlineId);
  if (record?.serverTillId) return record.serverTillId;

  if (record && !record.synced) {
    await syncSingleTillOpen(record);
    const refreshed = await getTillOpenRecord(offlineId);
    return refreshed?.serverTillId || null;
  }

  if (!record && fallbackData) {
    const openRecord = {
      _id: offlineId,
      staffId: fallbackData.staffId,
      staffName: fallbackData.staffName,
      storeId: fallbackData.storeId || 'default-store',
      locationId: fallbackData.locationId,
      openingBalance: fallbackData.openingBalance || 0,
    };
    await saveTillOpenOffline(openRecord);
    await syncSingleTillOpen(openRecord);
    const refreshed = await getTillOpenRecord(offlineId);
    return refreshed?.serverTillId || null;
  }

  return null;
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

/**
 * Get completed transactions from IndexedDB
 * @returns {Promise<Array>} Array of completed transactions
 */
export async function getCompletedTransactions() {
  try {
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readonly')
        .objectStore('transactions');
        
      const getAllRequest = txStore.getAll();

      getAllRequest.onsuccess = () => {
        const allTransactions = getAllRequest.result || [];
        
        // Filter for completed transactions
        const completed = allTransactions.filter(tx => 
          tx.status === 'completed' || tx.status === 'COMPLETE'
        );
        
        console.log(`📋 Found ${completed.length} completed transactions in IndexedDB`);
        resolve(completed);
      };

      getAllRequest.onerror = () => {
        console.error('❌ Failed to get transactions:', getAllRequest.error);
        reject(getAllRequest.error);
      };
    });
  } catch (err) {
    console.error('❌ Error getting completed transactions:', err);
    return [];
  }
}

/**
 * Cache completed transactions to localStorage for fast loading
 * @param {Array} transactions - Array of transactions to cache
 */
export async function cacheCompletedTransactions(transactions) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `completed_transactions_${today}`;
    
    // Only cache today's transactions
    localStorage.setItem(cacheKey, JSON.stringify(transactions));
    localStorage.setItem('completed_transactions_cache_time', new Date().getTime().toString());
    
    console.log(`✅ Cached ${transactions.length} completed transactions for ${today}`);
  } catch (err) {
    console.warn('⚠️ Failed to cache completed transactions:', err);
  }
}

/**
 * Get cached completed transactions
 * @returns {Array} Cached transactions if available and fresh, empty array otherwise
 */
export function getCachedCompletedTransactions() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `completed_transactions_${today}`;
    const cacheTime = parseInt(localStorage.getItem('completed_transactions_cache_time') || '0');
    const now = new Date().getTime();
    
    // Cache is valid if less than 5 minutes old
    if (now - cacheTime < 5 * 60 * 1000) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const transactions = JSON.parse(cached);
        console.log(`✅ Using cached ${transactions.length} completed transactions`);
        return transactions;
      }
    }
  } catch (err) {
    console.warn('⚠️ Failed to retrieve cached transactions:', err);
  }
  return [];
}


