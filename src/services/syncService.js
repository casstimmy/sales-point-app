/**
 * Sync Service
 * Handles auto-syncing transactions when network is available
 */

import { getUnsyncedTransactions, markTransactionSynced } from "../lib/indexedDB";

let syncInProgress = false;
let lastSyncAttempt = null;

/**
 * Auto-sync unsynced transactions to cloud
 */
export async function autoSyncTransactions() {
  // Don't sync if already syncing or no network
  if (syncInProgress || !navigator.onLine) {
    return { success: false, reason: "Already syncing or offline" };
  }

  syncInProgress = true;
  lastSyncAttempt = new Date();

  try {
    console.log("🔄 Starting auto-sync of transactions...");
    
    // Get all unsynced transactions
    const unsyncedTx = await getUnsyncedTransactions();
    console.log(`📤 Found ${unsyncedTx.length} unsynced transactions`);

    if (unsyncedTx.length === 0) {
      syncInProgress = false;
      return { success: true, synced: 0 };
    }

    // Send to cloud API
    let successCount = 0;
    let failureCount = 0;

    for (const tx of unsyncedTx) {
      try {
        const response = await fetch("/api/transactions/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tx),
        });

        if (response.ok) {
          await markTransactionSynced(tx.id);
          successCount++;
          console.log(`✅ Transaction ${tx.id} synced`);
        } else {
          failureCount++;
          console.error(`❌ Failed to sync transaction ${tx.id}: ${response.status}`);
        }
      } catch (err) {
        failureCount++;
        console.error(`❌ Error syncing transaction ${tx.id}:`, err.message);
      }
    }

    syncInProgress = false;
    console.log(`✅ Sync complete: ${successCount} synced, ${failureCount} failed`);
    
    return {
      success: failureCount === 0,
      synced: successCount,
      failed: failureCount,
      total: unsyncedTx.length,
    };
  } catch (err) {
    syncInProgress = false;
    console.error("❌ Auto-sync error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Setup online/offline listeners for auto-sync
 */
export function setupAutoSync() {
  // When going online, trigger sync
  window.addEventListener("online", () => {
    console.log("🌐 Back online! Starting auto-sync...");
    setTimeout(() => autoSyncTransactions(), 1000); // Wait 1s for connection stability
  });

  window.addEventListener("offline", () => {
    console.log("📵 Going offline - transactions will sync later");
  });

  console.log("✅ Auto-sync listeners setup");
}

/**
 * Get sync status
 */
export function getSyncStatus() {
  return {
    syncing: syncInProgress,
    lastAttempt: lastSyncAttempt,
    online: navigator.onLine,
  };
}
