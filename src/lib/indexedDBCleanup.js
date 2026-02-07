/**
 * IndexedDB Cleanup Utility
 * 
 * Removes old invalid transactions with status 'COMPLETE'
 * This is needed for migration from old cart format to new transaction format
 */

export async function cleanupOldTransactions() {
  try {
    const request = indexedDB.open('SalesPOS', 2);

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const txStore = db.transaction(['transactions'], 'readwrite')
          .objectStore('transactions');

        const getAllRequest = txStore.getAll();

        getAllRequest.onsuccess = () => {
          const transactions = getAllRequest.result;
          let deleted = 0;

          transactions.forEach(tx => {
            // Delete if status is invalid (old cart objects)
            // Check if tx.id is a string before calling startsWith
            const isOldCartObject = tx.status === 'COMPLETE' || 
                                    (typeof tx.id === 'string' && tx.id.startsWith('order_'));
            
            if (isOldCartObject) {
              txStore.delete(tx.id || tx); // Delete by key (id)
              deleted++;
              console.log(`🗑️ Deleted old transaction: ${tx.id}`);
            }
          });

          if (deleted > 0) {
            console.log(`✅ Cleaned up ${deleted} old transactions`);
          } else {
            console.log('✅ No old transactions to clean up');
          }

          resolve(deleted);
        };

        getAllRequest.onerror = () => reject(getAllRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('❌ Error cleaning up transactions:', err);
    throw err;
  }
}
