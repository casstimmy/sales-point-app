/**
 * MenuScreen Component
 * 
 * MENU tab - displays product categories from database.
 * - Fetches categories and products from API
 * - Color-coded category buttons
 * - Touch-optimized spacing and sizing
 * - Category click loads products from database
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBaby,
  faCookie,
  faBreadSlice,
  faUtensils,
  faSpray,
  faLipstick,
  faSnowflake,
  faBook,
  faShirt,
  faWineGlass,
  faLeaf,
  faSyncAlt,
  faWifi,
  faX,
  faSearch,
} from '@fortawesome/free-solid-svg-icons';
import { useCart } from '../../context/CartContext';
import { useStaff } from '../../context/StaffContext';
import { getLocalCategories, getLocalProductsByCategory, syncCategories, syncProducts, getAllLocalProducts } from '../../lib/indexedDB';
import { initOfflineSync, getOnlineStatus, getImageUrl, shouldShowPlaceholder, syncPendingTransactions, syncPendingTillCloses } from '../../lib/offlineSync';
import { cleanupOldTransactions } from '../../lib/indexedDBCleanup';
import { clearCategoriesCache } from '../../lib/categoryCacheCleanup';

// Color mapping for categories
const CATEGORY_COLORS = {
  'Bakery': 'from-amber-500 to-amber-600',
  'Drinks': 'from-blue-500 to-blue-600',
  'Food': 'from-orange-500 to-orange-600',
  'Hotel': 'from-purple-500 to-purple-600',
  'Wine': 'from-red-500 to-red-600',
};

const CATEGORY_ICONS = {
  'Bakery': faBreadSlice,
  'Drinks': faWineGlass,
  'Food': faUtensils,
  'Hotel': faBook,
  'Wine': faWineGlass,
};

export default function MenuScreen() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]); // All products for global search
  const [searchTerm, setSearchTerm] = useState(''); // Search state
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadingImages, setLoadingImages] = useState({}); // Track loading state for each product image
  const [failedImages, setFailedImages] = useState(new Set()); // Track failed images
  const [error, setError] = useState(null); // Track errors for data fetching
  const [isOnline, setIsOnline] = useState(true); // Track online status
  const [pendingTransactions, setPendingTransactions] = useState(0); // Track unsync'd transactions
  const imageObserver = useRef(null);
  const { addItem } = useCart();
  const { location } = useStaff(); // Get store location

  // Initialize offline sync on mount
  useEffect(() => {
    initOfflineSync();
    
    // Clean up old invalid transactions from previous schema
    cleanupOldTransactions().catch(err => {
      console.error('Cleanup failed:', err);
    });
    
    // Clear categories cache to force fresh fetch with location filtering
    clearCategoriesCache().catch(err => {
      console.error('Category cache clear failed:', err);
    });
    
    // Listen for online/offline changes
    const handleOnline = () => {
      console.log('🟢 Online');
      setIsOnline(true);
    };
    
    const handleOffline = () => {
      console.log('🔴 Offline');
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    setIsOnline(getOnlineStatus());
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Log when categories change
  useEffect(() => {
    console.log("📦 Categories state updated:", categories.length, "categories");
  }, [categories]);

  // Log when products change
  useEffect(() => {
    console.log("🛍️ Products state updated:", products.length, "products");
  }, [products]);

  // Default categories to show if API fails and no cache exists
  const DEFAULT_CATEGORIES = [
    { _id: '1', name: 'Bakery' },
    { _id: '2', name: 'Drinks' },
    { _id: '3', name: 'Food' },
    { _id: '4', name: 'Hotel' },
    { _id: '5', name: 'Wine' },
  ];

  // Fetch categories on mount and when location changes
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        console.log("📦 Loading categories...");
        console.log("📍 Current location:", location);
        setError(null); // Clear previous errors
        
        // If location is available, always fetch from API (skip IndexedDB)
        // This ensures we get only categories for this location
        if (location?._id) {
          console.log("📥 Location found, fetching from API with location filter...");
          const url = `/api/categories?location=${location._id}`;
          console.log("🔗 API URL:", url);
          
          try {
            const response = await fetch(url);
            if (response.ok) {
              const data = await response.json();
              console.log("📦 Categories from API:", data.data);
              const categories = data.data || [];
              
              if (categories.length > 0) {
                setCategories(categories);
                // Save to IndexedDB for offline support
                await syncCategories(categories);
                setLastSyncTime(new Date());
                // Auto-select first category
                setSelectedCategory(categories[0]);
              } else {
                console.warn("⚠️ No categories found for this location, using defaults");
                setCategories(DEFAULT_CATEGORIES);
                setSelectedCategory(DEFAULT_CATEGORIES[0]);
              }
            } else {
              console.warn(`⚠️ API returned ${response.status}, trying local cache...`);
              // Try local cache on API failure
              const localCategories = await getLocalCategories();
              if (localCategories && localCategories.length > 0) {
                console.log("✅ Using cached categories");
                setCategories(localCategories);
                setSelectedCategory(localCategories[0]);
              } else {
                console.log("📦 Using default categories as fallback");
                setCategories(DEFAULT_CATEGORIES);
                setSelectedCategory(DEFAULT_CATEGORIES[0]);
              }
            }
          } catch (fetchErr) {
            console.warn("⚠️ Fetch error, trying local cache...", fetchErr);
            // Try local cache on fetch error
            const localCategories = await getLocalCategories();
            if (localCategories && localCategories.length > 0) {
              console.log("✅ Using cached categories");
              setCategories(localCategories);
              setSelectedCategory(localCategories[0]);
            } else {
              console.log("📦 Using default categories as fallback");
              setCategories(DEFAULT_CATEGORIES);
              setSelectedCategory(DEFAULT_CATEGORIES[0]);
            }
          }
        } else {
          console.log("📦 No location yet, trying local cache...");
          // No location provided, try local cache
          const localCategories = await getLocalCategories();
          
          if (localCategories && localCategories.length > 0) {
            console.log("✅ Found", localCategories.length, "categories in local storage");
            setCategories(localCategories);
            // Auto-select first category
            setSelectedCategory(localCategories[0]);
          } else {
            console.log("📥 No local categories found, fetching all from API...");
            try {
              const response = await fetch('/api/categories');
              if (response.ok) {
                const data = await response.json();
                console.log("📦 Categories from API:", data.data);
                const categories = data.data || [];
                setCategories(categories);
                // Save to IndexedDB for offline support
                if (categories.length > 0) {
                  await syncCategories(categories);
                  setLastSyncTime(new Date());
                }
                // Auto-select first category
                if (categories.length > 0) {
                  setSelectedCategory(categories[0]);
                }
              } else {
                console.log("📦 Using default categories as fallback");
                setCategories(DEFAULT_CATEGORIES);
                setSelectedCategory(DEFAULT_CATEGORIES[0]);
              }
            } catch (fetchErr) {
              console.warn("⚠️ Fetch error, using default categories");
              setCategories(DEFAULT_CATEGORIES);
              setSelectedCategory(DEFAULT_CATEGORIES[0]);
            }
          }
        }
        setLoadingCategories(false);
      } catch (err) {
        console.error('❌ Failed to fetch categories:', err);
        // Fallback to default categories
        console.log("📦 Using default categories as fallback");
        setCategories(DEFAULT_CATEGORIES);
        setSelectedCategory(DEFAULT_CATEGORIES[0]);
        setError(null); // Clear error - we have a fallback
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, [location?._id]); // Re-fetch when location changes

  // Fetch products when category changes (from IndexedDB first, fallback to API)
  useEffect(() => {
    if (!selectedCategory) {
      setProducts([]);
      return;
    }

    const fetchProducts = async () => {
      setLoadingProducts(true);
      setError(null); // Clear previous errors immediately
      
      try {
        const categoryId = selectedCategory._id || selectedCategory.id;
        console.log("🛍️ Loading products from IndexedDB for category ID:", categoryId);
        
        // Try to get from local storage first - filter by category ID (ObjectId)
        const localProducts = await getLocalProductsByCategory(categoryId);
        
        if (localProducts && localProducts.length > 0) {
          console.log("✅ Found", localProducts.length, "products in local storage");
          setProducts(localProducts);
          setLoadingProducts(false);
          return; // Early return - found local products
        }
        
        console.log("📥 No local products found, fetching from API...");
        // If no local data, fetch from API using category ID
        const url = `/api/products?category=${encodeURIComponent(categoryId)}`;
        
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
          
          if (response.ok) {
            const data = await response.json();
            console.log("🛍️ Products from API:", data.data);
            setProducts(data.data || []);
            // Add to global search products
            setAllProducts(prev => {
              const merged = [...prev];
              (data.data || []).forEach(product => {
                if (!merged.find(p => p._id === product._id)) {
                  merged.push(product);
                }
              });
              return merged;
            });
            // Save to IndexedDB for offline support
            await syncProducts(data.data || []);
            setLastSyncTime(new Date());
            setLoadingProducts(false);
            return;
          }
        } catch (fetchErr) {
          console.error(`❌ API fetch failed:`, fetchErr.message);
        }
        
        // API failed - try fallback
        console.log("📥 API unavailable, trying cache fallback...");
        let fallbackProducts = await getLocalProductsByCategory(categoryId);
        
        if (fallbackProducts && fallbackProducts.length > 0) {
          console.log("✅ Using cached products for category:", fallbackProducts.length);
          setProducts(fallbackProducts);
          setLoadingProducts(false);
          return;
        }
        
        // Try all products if category-specific cache is empty
        console.log("📦 No category cache, trying all products...");
        fallbackProducts = await getAllLocalProducts();
        
        if (fallbackProducts && fallbackProducts.length > 0) {
          console.log("✅ Using all cached products:", fallbackProducts.length);
          setProducts(fallbackProducts);
          setLoadingProducts(false);
          return;
        }
        
        // No data available anywhere
        console.log("❌ No products available - offline and no cache");
        setProducts([]);
        setLoadingProducts(false);
        
      } catch (err) {
        console.error('❌ Unexpected error in fetchProducts:', err);
        // Final fallback attempt
        try {
          const fallbackProducts = await getAllLocalProducts();
          if (fallbackProducts && fallbackProducts.length > 0) {
            console.log("✅ Emergency fallback: using all cached products");
            setProducts(fallbackProducts);
          } else {
            setProducts([]);
          }
        } catch (fallbackErr) {
          console.error('❌ Emergency fallback failed:', fallbackErr);
          setProducts([]);
        }
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [selectedCategory]);

  // Manual sync button handler
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      console.log("🔄 Manual sync initiated...");
      setError(null); // Clear previous errors
      
      // Fetch and sync categories - use location filter if available
      const catUrl = location?._id 
        ? `/api/categories?location=${location._id}` 
        : '/api/categories';
      console.log("🔗 Categories API URL:", catUrl);
      
      const catResponse = await fetch(catUrl);
      if (catResponse.ok) {
        const catData = await catResponse.json();
        await syncCategories(catData.data || []);
        setCategories(catData.data || []);
        console.log(`✅ Categories synced${location ? ` for location: ${location.name}` : ''}`);
      } else {
        const errorData = await catResponse.text();
        console.error("❌ Categories API Error:", {
          status: catResponse.status,
          statusText: catResponse.statusText,
          response: errorData
        });
        // Try local cache as fallback
        const localCategories = await getLocalCategories();
        if (localCategories && localCategories.length > 0) {
          console.log("📦 Using cached categories as fallback");
          setCategories(localCategories);
        } else {
          throw new Error(`Failed to sync categories: ${catResponse.status}`);
        }
      }
      
      // Fetch and sync products
      if (selectedCategory) {
        const categoryId = selectedCategory._id || selectedCategory.id;
        const prodUrl = `/api/products?category=${encodeURIComponent(categoryId)}`;
        console.log("🔗 Products API URL:", prodUrl);
        
        const prodResponse = await fetch(prodUrl);
        if (prodResponse.ok) {
          const prodData = await prodResponse.json();
          await syncProducts(prodData.data || []);
          setProducts(prodData.data || []);
          console.log("✅ Products synced");
        } else {
          const errorData = await prodResponse.text();
          console.error("❌ Products API Error:", {
            status: prodResponse.status,
            statusText: prodResponse.statusText,
            response: errorData
          });
          // Try local cache as fallback
          const localProducts = await getLocalProductsByCategory(categoryId);
          if (localProducts && localProducts.length > 0) {
            console.log("📦 Using cached products as fallback");
            setProducts(localProducts);
          } else {
            throw new Error(`Failed to sync products: ${prodResponse.status}`);
          }
        }
      }
      
      setLastSyncTime(new Date());
      
      // Also sync pending transactions and till closes if online
      if (getOnlineStatus()) {
        console.log("🔄 Syncing pending transactions and till closes...");
        try {
          await syncPendingTransactions();
          await syncPendingTillCloses();
          console.log("✅ Pending data synced");
        } catch (err) {
          console.error('⚠️ Error syncing pending data:', err);
        }
      }
      
      console.log("✅ Manual sync complete");
    } catch (err) {
      console.error('❌ Manual sync failed:', err);
      setError(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Callback for image error handling
  const handleImageError = useCallback((productId) => {
    setFailedImages(prev => new Set([...prev, productId]));
    setLoadingImages(prev => ({ ...prev, [productId]: false }));
  }, []);

  return (
    <div className="flex flex-col h-full bg-neutral-50 overflow-hidden">
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold"
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Sync Button + Status Bar */}
      <div className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Online Status */}
          <div className={`flex items-center gap-1 px-3 py-2 rounded-lg ${isOnline ? 'bg-green-50' : 'bg-neutral-100'}`}>
            <FontAwesomeIcon 
              icon={isOnline ? faWifi : faX} 
              className={`w-5 h-5 ${isOnline ? 'text-green-600' : 'text-neutral-400'}`} 
            />
            <span className={`text-sm font-semibold ${isOnline ? 'text-green-700' : 'text-neutral-600'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Last Sync Time */}
          {lastSyncTime && (
            <span className="text-sm text-neutral-500">
              Last sync: {lastSyncTime.toLocaleTimeString()}
            </span>
          )}
        </div>
        
        {/* Sync Button */}
        <button
          onClick={handleManualSync}
          disabled={isSyncing || !isOnline}
          className="flex items-center gap-2 px-4 py-3 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors duration-base min-h-12"
        >
          <FontAwesomeIcon icon={faSyncAlt} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing...' : 'Sync Products'}
        </button>
      </div>

      {/* Search Bar - Redesigned */}
      <div className="bg-white border-b-2 border-primary-200 px-4 py-4 flex-shrink-0 shadow-sm">
        <div className="relative">
          <FontAwesomeIcon 
            icon={faSearch} 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500"
          />
          <input
            type="text"
            placeholder="Search products or categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 text-base border-2 border-neutral-200 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all font-medium"
          />
        </div>
      </div>

      {/* Categories + Products - SCROLLABLE SECTION */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Category Grid */}
        <div className="mb-3">
          <div className="text-base font-bold text-neutral-800 mb-2 px-1">CATEGORIES</div>
          {loadingCategories ? (
            <div className="text-sm text-neutral-400 text-center py-4">Loading categories...</div>
          ) : (
            <div className="grid grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-1.5 auto-rows-max">
              {categories.map(category => {
                const color = CATEGORY_COLORS[category.name] || 'from-neutral-500 to-neutral-600';
                const icon = CATEGORY_ICONS[category.name] || faBook;
                
                return (
                  <button
                    key={category._id || category.id}
                    onClick={() => setSelectedCategory(category)}
                    className={`relative h-28 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-all duration-base transform hover:scale-105 touch-manipulation ${
                      selectedCategory?._id === category._id || selectedCategory?.id === category.id ? 'ring-4 ring-primary-500' : ''
                    }`}
                  >
                    {/* Background Gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-90`} />

                    {/* Content */}
                    <div className="relative h-full flex flex-col items-center justify-center text-white text-center p-3">
                      <FontAwesomeIcon icon={icon} className="w-8 h-8 mb-2" />
                      <div className="text-base font-bold leading-tight line-clamp-2">{category.name}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Product List - Category view or Search Results */}
        {searchTerm ? (
          // Search Results View - Search across all products
          <div className="bg-white rounded-lg border-2 border-green-200 p-3 mt-3">
            <div className="text-base font-bold text-neutral-900 mb-3">
              🔍 Search Results
            </div>
            {(() => {
              const searchResults = allProducts.filter(product =>
                product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()))
              );
              
              return searchResults.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-max">
                  {searchResults.map(product => (
                    <button
                      key={product._id || product.id}
                      onClick={() => addItem({
                        id: product._id || product.id,
                        name: product.name,
                        price: product.salePriceIncTax,
                        category: product.category,
                        quantity: 1,
                      })}
                      className="relative h-48 p-3 bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 rounded-lg border-2 border-green-300 transition-all duration-base transform hover:scale-105 shadow-md hover:shadow-lg touch-manipulation flex flex-col items-center justify-center text-center overflow-hidden"
                    >
                      {/* Product Image */}
                      <div className="w-24 h-24 bg-white rounded border border-green-200 flex items-center justify-center overflow-hidden flex-shrink-0 relative mb-2">
                        {!isOnline && (
                          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 z-20">
                            <div className="text-center">
                              <div className="text-2xl mb-1">📦</div>
                              <div className="text-xs text-neutral-600">Offline</div>
                            </div>
                          </div>
                        )}
                        
                        {isOnline && loadingImages[product._id || product.id] && !failedImages.has(product._id || product.id) && (
                          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 z-10">
                            <div className="animate-pulse text-3xl">⏳</div>
                          </div>
                        )}
                        
                        {isOnline && !failedImages.has(product._id || product.id) && product.images && product.images.length > 0 && product.images[0].full ? (
                          <img
                            src={product.images[0].full}
                            alt={product.name}
                            className="w-full h-full object-cover lazy-load"
                            loading="lazy"
                            onLoadStart={() => setLoadingImages(prev => ({ ...prev, [product._id || product.id]: true }))}
                            onLoad={() => setLoadingImages(prev => ({ ...prev, [product._id || product.id]: false }))}
                            onError={() => handleImageError(product._id || product.id)}
                          />
                        ) : (
                          <div className="text-2xl">📦</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-neutral-400 py-3 text-center">
                  No products match &quot;{searchTerm}&quot;
                </div>
              );
            })()}
          </div>
        ) : selectedCategory && (
          // Category View
          <div className="bg-white rounded-lg border-2 border-primary-200 p-3 mt-3">
            <div className="text-base font-bold text-neutral-900 mb-3">
              {selectedCategory.name}
            </div>
            {loadingProducts ? (
              <div className="text-sm text-neutral-400 text-center py-4">Loading products...</div>
            ) : (() => {
              // Filter products based on search term
              const filteredProducts = products.filter(product =>
                product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()))
              );
              
              return filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-max">
                {filteredProducts.map(product => (
                  <button
                    key={product._id || product.id}
                    onClick={() => addItem({
                      id: product._id || product.id,
                      name: product.name,
                      price: product.salePriceIncTax,
                      category: product.category,
                      quantity: 1,
                    })}
                    className="relative h-48 p-3 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 rounded-lg border-2 border-blue-300 transition-all transform hover:scale-105 shadow-md hover:shadow-lg touch-manipulation flex flex-col items-center justify-center text-center overflow-hidden"
                  >
                    {/* Product Image */}
                    <div className="w-24 h-24 bg-white rounded border border-blue-200 flex items-center justify-center overflow-hidden flex-shrink-0 relative mb-2">
                      {/* Offline Placeholder */}
                      {!isOnline && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
                          <div className="text-center">
                            <div className="text-2xl mb-1">📦</div>
                            <div className="text-xs text-gray-600">Offline</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Loading Placeholder */}
                      {isOnline && loadingImages[product._id || product.id] && !failedImages.has(product._id || product.id) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                          <div className="animate-pulse text-3xl">⏳</div>
                        </div>
                      )}
                      
                      {/* Image Display */}
                      {isOnline && !failedImages.has(product._id || product.id) && product.images && product.images.length > 0 && product.images[0].full ? (
                        <img
                          src={product.images[0].full}
                          alt={product.name}
                          className="w-full h-full object-cover lazy-load"
                          loading="lazy"
                          onLoadStart={() => setLoadingImages(prev => ({ ...prev, [product._id || product.id]: true }))}
                          onLoad={() => setLoadingImages(prev => ({ ...prev, [product._id || product.id]: false }))}
                          onError={() => handleImageError(product._id || product.id)}
                        />
                      ) : (
                        <div className="text-3xl">📦</div>
                      )}
                    </div>

                    {/* Product Info - Below Image */}
                    <div className="flex flex-col items-center justify-center flex-1">
                      <div className="text-base font-bold text-gray-900 leading-tight line-clamp-2 mb-1">
                        {product.name}
                      </div>
                      <div className="text-xl font-bold text-blue-700 mb-1">
                        ₦{product.salePriceIncTax?.toLocaleString() || '0'}
                      </div>
                      {product.quantity > 0 && (
                        <div className="text-sm text-gray-700 font-semibold">
                          Stock: {product.quantity}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-3 text-center">
                {searchTerm ? 'No products match your search' : 'No products in this category'}
              </div>
            );
            })()}
          </div>
        )}

        {/* Empty State */}
        {!selectedCategory && (
          <div className="flex items-center justify-center text-gray-400 text-center py-8">
            <div>
              <div className="text-3xl mb-1">📦</div>
              <div className="text-sm">Select a category above</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
