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
let _syncStartedAt = null;
const SYNC_LOCK_TIMEOUT = 60000; // Auto-release lock after 60s to prevent deadlock
// Guard to prevent duplicate event listener registration
let _offlineSyncInitialized = false;
// Retry state lives on each IndexedDB record (syncAttempts, nextRetryAt, lastSyncError,
// needsAttention) so it survives a page reload and can be shown to staff.
const ATTENTION_AFTER_ATTEMPTS = 3; // flag a sale for staff after this many failed tries
const BASE_RETRY_DELAY = 5000; // 5s base, exponential backoff
const MAX_RETRY_DELAY = 5 * 60 * 1000; // keep retrying at most every 5 minutes
const AUTO_SYNC_INTERVAL = 60 * 1000; // background retry while anything is pending

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

const normalizeTransactionStatus = (status) => {
  const raw = String(status || 'completed').toLowerCase();
  if (raw === 'complete') return 'completed';
  if (['completed', 'held', 'refunded', 'credit'].includes(raw)) return raw;
  return 'completed';
};

const normalizeLocationName = (location) => {
  if (typeof location === 'string' && location.trim()) {
    return location.trim();
  }
  if (location && typeof location === 'object') {
    if (typeof location.name === 'string' && location.name.trim()) {
      return location.name.trim();
    }
    if (typeof location.code === 'string' && location.code.trim()) {
      return location.code.trim();
    }
  }
  return 'Main Store';
};

const normalizeStaffName = (transaction = {}) => {
  const directStaff = transaction.staffName;
  if (typeof directStaff === 'string' && directStaff.trim() && directStaff !== 'Unknown') {
    return directStaff.trim();
  }

  if (transaction.staffMember && typeof transaction.staffMember === 'object') {
    if (typeof transaction.staffMember.name === 'string' && transaction.staffMember.name.trim()) {
      return transaction.staffMember.name.trim();
    }
  }

  if (typeof transaction.staffMember === 'string' && transaction.staffMember.trim()) {
    return transaction.staffMember.trim();
  }

  return 'POS Staff';
};

const isOfflineTillId = (value) => String(value || '').startsWith('offline-till-');

const canSyncWithoutTill = (transaction = {}) => {
  const items = Array.isArray(transaction.items) ? transaction.items : [];
  const total = Number(transaction.total || 0);
  const status = normalizeTransactionStatus(transaction.status);
  return items.length > 0 && total >= 0 && ['completed', 'held', 'refunded', 'credit'].includes(status);
};

const emitSyncStateChange = (detail = {}) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('pos:sync-state-changed', {
      detail,
    })
  );
};

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
  });

  // Retry in the background while anything is waiting, and when the till screen
  // comes back into view, so a failed sync is never left sitting silently.
  startAutoSync();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      runBackgroundSync();
    }
  });
}

async function runBackgroundSync() {
  if (!isOnline || _isSyncing) return;
  try {
    const pending = await getPendingTransactionsCount();
    if (pending > 0) {
      await syncPendingTillOpens();
      await syncPendingTransactions();
      await syncPendingTillCloses();
    }
  } catch (err) {
    console.warn('Background sync failed:', err?.message || err);
  }
}

/**
 * Sync pending transactions (called manually or on "coming online" event)
 */
export function startAutoSync() {
  if (typeof window === 'undefined' || syncInterval) return;
  syncInterval = setInterval(runBackgroundSync, AUTO_SYNC_INTERVAL);
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
    const baseId = transaction.externalId || transaction.clientId || transaction.id;
    const generatedId = baseId
      ? String(baseId)
      : `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const db = await openSalesPosDb();
    
    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readwrite')
        .objectStore('transactions');
        
      const txData = {
        id: transaction.id || generatedId,
        ...transaction,
        externalId: transaction.externalId || generatedId,
        clientId: transaction.clientId || generatedId,
        staffName: normalizeStaffName(transaction),
        location: normalizeLocationName(transaction?.location),
        status: normalizeTransactionStatus(transaction?.status),
        synced: false,
        syncedAt: null,
        attempts: 0,
        syncAttempts: 0,
        nextRetryAt: null,
        lastSyncError: null,
        needsAttention: false,
      };

      // Use put instead of add to allow auto-increment
      const addRequest = txStore.put(txData);

      addRequest.onsuccess = () => {
        console.log('💾 Transaction saved offline with ID:', addRequest.result);
        // Update till in localStorage with new sales totals
        updateTillInLocalStorage(transaction.tillId, transaction.total || 0, txData.status);
        emitSyncStateChange({ reason: 'transaction-queued' });
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
function updateTillInLocalStorage(tillId, transactionTotal, status = 'completed') {
  try {
    if (status !== 'completed') return;
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
        tillTx.forEach(tx => {
          if (tx.status === 'completed') totalSales += (tx.total || 0);
        });
        resolve({ totalSales, transactionCount: tillTx.length });
      };
      getAllReq.onerror = () => reject(getAllReq.error);
    });
  } catch (err) {
    console.warn('⚠️ Could not get offline till sales:', err);
    return { totalSales: 0, transactionCount: 0 };
  }
}

const describeSyncFailure = (status, body = {}) => {
  const serverMessage = body?.message || body?.error || '';
  if (status === 401) {
    return { kind: 'auth', message: 'Your session expired. Sign in again so this sale can sync.' };
  }
  if (status === 409 && body?.code === 'HELD_ALREADY_COMPLETED') {
    return {
      kind: 'permanent',
      message: 'This held order was already paid on another till. Check before charging the customer again.',
    };
  }
  if (status === 404 && body?.code === 'EDIT_TARGET_NOT_FOUND') {
    return {
      kind: 'permanent',
      code: 'EDIT_TARGET_NOT_FOUND',
      message: 'The original sale was not found on the server. Save it as a new sale to record it.',
    };
  }
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { kind: 'permanent', message: serverMessage || `The server rejected this sale (${status}).` };
  }
  return {
    kind: 'transient',
    message: serverMessage || (status ? `Server error (${status}). Will retry automatically.` : 'Network error. Will retry automatically.'),
  };
};

async function updateTransactionRecord(transactionId, patch) {
  try {
    const db = await openSalesPosDb();
    return await new Promise((resolve, reject) => {
      const store = db.transaction(['transactions'], 'readwrite').objectStore('transactions');
      const getReq = store.get(transactionId);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) {
          resolve(null);
          return;
        }
        const next = { ...record, ...(typeof patch === 'function' ? patch(record) : patch) };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve(next);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('Could not update local transaction record:', err?.message || err);
    return null;
  }
}

async function recordSyncFailure(tx, failure) {
  const attempts = Number(tx.syncAttempts || 0) + 1;
  const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, Math.min(attempts - 1, 8)), MAX_RETRY_DELAY);
  const needsAttention = failure.kind !== 'transient' || attempts >= ATTENTION_AFTER_ATTEMPTS;
  const wasFlagged = Boolean(tx.needsAttention);

  await updateTransactionRecord(tx.id, {
    syncAttempts: attempts,
    lastSyncAttemptAt: new Date().toISOString(),
    // Permanent problems are not retried automatically; staff decide what to do.
    nextRetryAt: failure.kind === 'permanent' ? null : new Date(Date.now() + delay).toISOString(),
    lastSyncError: failure.message,
    lastSyncErrorCode: failure.code || null,
    failureKind: failure.kind,
    needsAttention,
  });

  if (needsAttention && !wasFlagged && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pos:sync-alert', {
      detail: {
        transactionId: tx.id,
        total: Number(tx.total || 0),
        message: failure.message,
      },
    }));
  }

  return { attempts, needsAttention };
}

async function syncTransactionRecord(transaction, { forceRetry = false } = {}) {
  const tx = {
    ...transaction,
    staffName: normalizeStaffName(transaction),
    location: normalizeLocationName(transaction?.location),
    status: normalizeTransactionStatus(transaction?.status),
  };

  if (!forceRetry) {
    if (tx.failureKind === 'permanent' && tx.needsAttention) {
      return { synced: false, failed: true, skipped: true, reason: 'needs-attention' };
    }
    if (tx.nextRetryAt && Date.now() < new Date(tx.nextRetryAt).getTime()) {
      return { synced: false, failed: false, skipped: true, reason: 'retry-backoff' };
    }
  }

  try {
    let payloadTillId = tx.tillId || null;
    let originalOfflineTillId = tx.originalOfflineTillId || null;

    if (tx.tillId && isOfflineTillId(tx.tillId)) {
      const resolved = await resolveTillId(tx.tillId, tx);
      if (!resolved) {
        if (!canSyncWithoutTill(tx)) {
          const failure = { kind: 'transient', message: 'Waiting for the offline till to be created on the server.' };
          const { attempts } = await recordSyncFailure(tx, failure);
          return { synced: false, failed: true, attempts, reason: 'till-not-mapped' };
        }

        originalOfflineTillId = tx.tillId;
        payloadTillId = null;
        console.warn(`⚠️ Transaction ${tx.id} has an unmapped offline till. Syncing sale without till link so it is still recorded.`);
      } else {
        const origOfflineTillId = tx.tillId;
        tx.tillId = resolved;
        payloadTillId = resolved;
        originalOfflineTillId = origOfflineTillId;
        await updateTransactionRecord(tx.id, { tillId: resolved, originalOfflineTillId: origOfflineTillId });
      }
    }

    const payload = {
      ...tx,
      tillId: payloadTillId,
      originalOfflineTillId,
      externalId: tx.externalId || tx.clientId || String(tx.id),
      staffName: normalizeStaffName(tx),
      location: normalizeLocationName(tx?.location),
      status: normalizeTransactionStatus(tx?.status),
    };
    delete payload.synced;
    delete payload.needsAttention;
    delete payload.lastSyncError;
    delete payload.nextRetryAt;

    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await markTransactionSynced(tx.id);
      return {
        synced: true,
        failed: false,
        reason: payloadTillId ? 'synced' : originalOfflineTillId ? 'synced-without-till' : 'synced',
        originalOfflineTillId,
      };
    }

    const errorData = await response.json().catch(() => ({}));
    const failure = describeSyncFailure(response.status, errorData);
    const { attempts, needsAttention } = await recordSyncFailure(tx, failure);
    console.warn(`⚠️ Failed to sync transaction ${tx.id} (attempt ${attempts}):`, failure.message);
    return {
      synced: false,
      failed: true,
      attempts,
      needsAttention,
      error: errorData,
      message: failure.message,
      reason: 'request-failed',
    };
  } catch (err) {
    const failure = describeSyncFailure(0, { message: '' });
    const { attempts, needsAttention } = await recordSyncFailure(tx, failure);
    console.error(`❌ Error syncing transaction ${tx.id} (attempt ${attempts}):`, err);
    return {
      synced: false,
      failed: true,
      attempts,
      needsAttention,
      error: err,
      message: failure.message,
      reason: 'request-error',
    };
  }
}

/**
 * Sync pending transactions to cloud
 */
export async function syncPendingTransactions({ forceRetry = false } = {}) {
  if (!isOnline) {
    console.log('⚠️ Offline - Skipping cloud sync');
    return;
  }

  // Concurrency lock — only one sync at a time (with safety timeout)
  if (_isSyncing) {
    // Safety: auto-release if lock held too long (e.g. Promise never settled)
    if (_syncStartedAt && (Date.now() - _syncStartedAt > SYNC_LOCK_TIMEOUT)) {
      console.warn('⚠️ Sync lock held longer than 60s — force releasing');
      _isSyncing = false;
      _syncStartedAt = null;
    } else {
      console.log('ℹ️ Sync already in progress, skipping duplicate call');
      return;
    }
  }
  _isSyncing = true;
  _syncStartedAt = Date.now();

  try {
    await ensureExternalIdsInTransactions();
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readonly')
        .objectStore('transactions');
        
      const getAllRequest = txStore.getAll();

      getAllRequest.onsuccess = async () => {
        const allTransactions = getAllRequest.result || [];
          
          // Unsynced records, oldest first, so a hold always reaches the server
          // before the payment that completes it.
          const transactions = allTransactions
            .filter((tx) => !tx.synced)
            .map((tx) => ({
              ...tx,
              staffName: normalizeStaffName(tx),
              location: normalizeLocationName(tx?.location),
              status: normalizeTransactionStatus(tx?.status),
            }))
            .sort((left, right) => {
              const byTime = new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
              if (byTime !== 0) return byTime;
              return (left.status === 'held' ? 0 : 1) - (right.status === 'held' ? 0 : 1);
            });

          if (transactions.length === 0) {
            console.log('✅ All transactions synced');
            const syncedAt = new Date().toISOString();
            emitSyncStateChange({
              reason: 'transactions-synced',
              pendingCount: 0,
              syncedAt,
              synced: 0,
              failed: 0,
              total: 0,
            });
            resolve({ synced: 0, failed: 0, remaining: 0, total: 0 });
            return;
          }

          console.log(`🔄 Syncing ${transactions.length} transactions to cloud...`);

          // Sync each transaction
          let synced = 0;
          let failed = 0;

          for (const tx of transactions) {
            const result = await syncTransactionRecord(tx, { forceRetry });
            if (result?.synced) {
              synced++;
            } else if (result?.failed) {
              failed++;
            }
          }

          const pendingAfter = await getPendingTransactionsCount();
          const attentionCount = await getSyncIssueCount();
          const syncedAt = synced > 0 || pendingAfter === 0 ? new Date().toISOString() : null;

          emitSyncStateChange({
            reason: 'transactions-synced',
            pendingCount: pendingAfter,
            attentionCount,
            syncedAt,
            synced,
            failed,
            total: transactions.length,
          });

          console.log(`📊 Sync complete: ${synced} synced, ${failed} failed`);
        resolve({ synced, failed, remaining: pendingAfter, total: transactions.length });
      };

      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  } catch (err) {
    console.error('❌ Error syncing transactions:', err);
    throw err;
  } finally {
    _isSyncing = false;
    _syncStartedAt = null;
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
            tx.needsAttention = false;
            tx.lastSyncError = null;
            tx.lastSyncErrorCode = null;
            tx.nextRetryAt = null;
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

async function readAllLocalTransactions() {
  const db = await openSalesPosDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(['transactions'], 'readonly').objectStore('transactions').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Number of sales on this device that have not reached the server.
 * (Booleans are not valid IndexedDB keys, so the old `index('synced').count(false)`
 * always failed and reported 0 - which hid every stuck sale.)
 */
export async function getPendingTransactionsCount() {
  try {
    const all = await readAllLocalTransactions();
    return all.filter((tx) => tx && tx.synced !== true).length;
  } catch (err) {
    console.error('❌ Error getting pending transactions count:', err);
    return 0;
  }
}

/** Number of unsynced sales that need a person to look at them. */
export async function getSyncIssueCount() {
  try {
    const all = await readAllLocalTransactions();
    return all.filter((tx) => tx && tx.synced !== true && tx.needsAttention === true).length;
  } catch (err) {
    console.error('❌ Error getting sync issue count:', err);
    return 0;
  }
}

/**
 * The original sale for an edit no longer exists on the server. Record the
 * payment as a new sale instead so the money is not lost from the books.
 */
export async function saveFailedEditAsNewSale(transactionId) {
  const updated = await updateTransactionRecord(transactionId, (record) => {
    const next = {
      ...record,
      editTransactionId: undefined,
      recallSourceStatus: undefined,
      subStatus: null,
      syncAttempts: 0,
      nextRetryAt: null,
      lastSyncError: null,
      lastSyncErrorCode: null,
      failureKind: null,
      needsAttention: false,
      savedAsNewSaleAt: new Date().toISOString(),
    };
    delete next.editTransactionId;
    delete next.recallSourceStatus;
    return next;
  });

  if (!updated) return { success: false, reason: 'not-found' };
  return syncPendingTransactionById(transactionId);
}

/**
 * Removes a sale from the sync queue without sending it. Only for records that
 * were never real sales (test entries, duplicates already on the server). The
 * record is kept in the device history with who discarded it and why.
 */
export async function discardPendingTransaction(transactionId, { reason = '', staffId = null, staffName = null, staffRole = null } = {}) {
  return resolvePendingTransaction(transactionId, {
    type: 'discarded',
    note: reason,
    staffId,
    staffName,
    staffRole,
  });
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
          tx.status === 'completed' || tx.status === 'COMPLETE' || tx.status === 'complete'
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

export async function getPendingTransactions() {
  try {
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readonly')
        .objectStore('transactions');
      const getAllRequest = txStore.getAll();

      getAllRequest.onsuccess = () => {
        const pending = (getAllRequest.result || [])
          .filter((tx) => tx && tx.synced !== true)
          .sort((a, b) => {
            const left = new Date(b?.createdAt || b?.timestamp || 0).getTime();
            const right = new Date(a?.createdAt || a?.timestamp || 0).getTime();
            return left - right;
          });

        resolve(pending);
      };

      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  } catch (err) {
    console.error('❌ Error getting pending transactions:', err);
    return [];
  }
}

export async function getResolvedPendingTransactionsHistory() {
  try {
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readonly')
        .objectStore('transactions');
      const getAllRequest = txStore.getAll();

      getAllRequest.onsuccess = () => {
        const resolvedTransactions = (getAllRequest.result || [])
          .filter(
            (tx) =>
              tx &&
              tx.resolved === true &&
              ['previous-till', 'discarded'].includes(tx.resolutionType)
          )
          .sort((a, b) => {
            const left = new Date(b?.resolvedAt || b?.syncedAt || 0).getTime();
            const right = new Date(a?.resolvedAt || a?.syncedAt || 0).getTime();
            return left - right;
          });

        resolve(resolvedTransactions);
      };

      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  } catch (err) {
    console.error('❌ Error getting resolved pending transaction history:', err);
    return [];
  }
}

export async function syncPendingTransactionById(transactionId) {
  if (!isOnline) {
    return { success: false, reason: 'offline' };
  }

  try {
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readonly')
        .objectStore('transactions');
      const getRequest = txStore.get(transactionId);

      getRequest.onsuccess = async () => {
        try {
          const transaction = getRequest.result;
          if (!transaction) {
            resolve({ success: false, reason: 'not-found' });
            return;
          }

          if (transaction.synced === true) {
            const pendingCount = await getPendingTransactionsCount();
            emitSyncStateChange({ reason: 'transaction-already-synced', pendingCount });
            resolve({ success: true, synced: false, pendingCount, reason: 'already-synced' });
            return;
          }

          const result = await syncTransactionRecord(transaction, { forceRetry: true });
          const pendingCount = await getPendingTransactionsCount();
          const attentionCount = await getSyncIssueCount();
          const syncedAt = result?.synced ? new Date().toISOString() : null;

          emitSyncStateChange({
            reason: 'transaction-synced',
            transactionId,
            pendingCount,
            attentionCount,
            syncedAt,
          });

          resolve({
            success: Boolean(result?.synced),
            pendingCount,
            syncedAt,
            ...result,
          });
        } catch (err) {
          reject(err);
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (err) {
    console.error(`❌ Error syncing pending transaction ${transactionId}:`, err);
    return { success: false, reason: 'request-error', error: err };
  }
}

export async function resolvePendingTransaction(transactionId, resolution = {}) {
  try {
    const db = await openSalesPosDb();

    return new Promise((resolve, reject) => {
      const txStore = db.transaction(['transactions'], 'readwrite')
        .objectStore('transactions');
      const getRequest = txStore.get(transactionId);

      getRequest.onsuccess = () => {
        const transaction = getRequest.result;
        if (!transaction) {
          resolve({ success: false, reason: 'not-found' });
          return;
        }

        const resolvedAt = new Date().toISOString();
        const nextTransaction = {
          ...transaction,
          synced: true,
          syncedAt: resolvedAt,
          resolved: true,
          resolvedAt,
          resolutionType: resolution.type || 'manual',
          resolutionNote: resolution.note || '',
          resolvedByTillId: resolution.tillId || null,
          resolvedByStaffId: resolution.staffId || null,
          resolvedByStaffName: resolution.staffName || null,
          resolvedByStaffRole: resolution.staffRole || null,
        };

        const putRequest = txStore.put(nextTransaction);
        putRequest.onsuccess = async () => {
          const pendingCount = await getPendingTransactionsCount();

          emitSyncStateChange({
            reason: 'transaction-resolved',
            transactionId,
            pendingCount,
          });

          resolve({
            success: true,
            pendingCount,
            transaction: nextTransaction,
          });
        };
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (err) {
    console.error(`❌ Error resolving pending transaction ${transactionId}:`, err);
    return { success: false, reason: 'request-error', error: err };
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

/**
 * Get ALL pending/unsynced data from all stores
 * Works fully offline — reads from IndexedDB only
 * @returns {Promise<{transactions: Array, tillOpens: Array, tillCloses: Array}>}
 */
export async function getAllPendingData() {
  try {
    const db = await openSalesPosDb();

    const readAll = (storeName) => new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });

    const [allTxns, allOpens, allCloses] = await Promise.all([
      readAll('transactions'),
      readAll('till_opens'),
      readAll('till_closes'),
    ]);

    return {
      transactions: allTxns.filter(t => t && t.synced !== true),
      tillOpens: allOpens.filter(t => t && t.synced !== true),
      tillCloses: allCloses.filter(t => t && t.synced !== true),
    };
  } catch (err) {
    console.error('❌ Error getting all pending data:', err);
    return { transactions: [], tillOpens: [], tillCloses: [] };
  }
}
