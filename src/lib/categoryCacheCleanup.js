/**
 * Category Cache Cleanup Utility
 * 
 * Clears cached categories from IndexedDB to force fresh fetch
 * Useful when categories structure changes or location-based filtering is needed
 */

export async function clearCategoriesCache() {
  try {
    const request = indexedDB.open('SalesPOS', 1);

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const catStore = db.transaction(['categories'], 'readwrite')
          .objectStore('categories');

        const clearRequest = catStore.clear();

        clearRequest.onsuccess = () => {
          console.log('✅ Categories cache cleared');
          resolve(true);
        };

        clearRequest.onerror = () => {
          console.error('❌ Error clearing categories cache:', clearRequest.error);
          reject(clearRequest.error);
        };
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('❌ Error clearing categories cache:', err);
    throw err;
  }
}
