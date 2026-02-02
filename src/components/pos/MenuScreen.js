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

// Default categories to show if API fails and no cache exists
const DEFAULT_CATEGORIES = [
  { _id: '1', name: 'Bakery' },
  { _id: '2', name: 'Drinks' },
  { _id: '3', name: 'Food' },
  { _id: '4', name: 'Hotel' },
  { _id: '5', name: 'Wine' },
];

export default function MenuScreen() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]); // All products for global search
  const [searchTerm, setSearchTerm] = useState(''); // Current input value
  const [appliedSearch, setAppliedSearch] = useState(''); // Search only applied on button click
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
  const { addItem, activeCart } = useCart();
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

    // Listen for transaction completion to refresh products
    const handleTransactionCompleted = async () => {
      console.log('📲 Transaction completed event received, refreshing products...');
      // Trigger sync to get updated quantities from server
      await syncProducts([]);
      // Reload current category products
      if (selectedCategory) {
        const categoryId = selectedCategory._id || selectedCategory.id;
        const localProducts = await getLocalProductsByCategory(categoryId);
        if (localProducts && localProducts.length > 0) {
          setProducts(localProducts);
        }
      }
    };

    window.addEventListener('transactions:completed', handleTransactionCompleted);
    
    setIsOnline(getOnlineStatus());
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('transactions:completed', handleTransactionCompleted);
    };
  }, [selectedCategory]);;

  // Log when categories change
  useEffect(() => {
    console.log("📦 Categories state updated:", categories.length, "categories");
  }, [categories]);

  // Log when products change
  useEffect(() => {
    console.log("🛍️ Products state updated:", products.length, "products");
  }, [products]);

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
  }, [location]); // Re-fetch when location changes

  // Load ALL products from local DB on mount for global search
  useEffect(() => {
    const loadAllLocalProducts = async () => {
      try {
        console.log("📦 Loading all local products for search...");
        const localProducts = await getAllLocalProducts();
        if (localProducts && localProducts.length > 0) {
          console.log(`✅ Loaded ${localProducts.length} products from local storage`);
          setAllProducts(localProducts);
        } else {
          console.log("📦 No local products found, will fetch on sync");
        }
      } catch (err) {
        console.error("❌ Error loading local products:", err);
      }
    };
    
    loadAllLocalProducts();
  }, []);

  // Fetch products when category changes (from IndexedDB ONLY - API sync is manual)
  useEffect(() => {
    if (!selectedCategory) {
      setProducts([]);
      return;
    }

    const fetchProducts = async () => {
      setLoadingProducts(true);
      setError(null);
      
      try {
        const categoryId = selectedCategory._id || selectedCategory.id;
        console.log("🛍️ Loading products from IndexedDB for category ID:", categoryId);
        
        // ALWAYS try local storage first
        const localProducts = await getLocalProductsByCategory(categoryId);
        
        if (localProducts && localProducts.length > 0) {
          console.log("✅ Found", localProducts.length, "products in local storage");
          setProducts(localProducts);
          setLoadingProducts(false);
          return; // Use local products - no API call
        }
        
        // If no local products for this category, try all local products filtered
        console.log("📦 No products for this category locally, checking all products...");
        const allLocal = await getAllLocalProducts();
        
        if (allLocal && allLocal.length > 0) {
          // Filter by category
          const categoryName = selectedCategory.name;
          const categoryFiltered = allLocal.filter(p => 
            p.category === categoryId || 
            p.category === categoryName ||
            p.categoryId === categoryId
          );
          
          if (categoryFiltered.length > 0) {
            console.log("✅ Filtered", categoryFiltered.length, "products from all local products");
            setProducts(categoryFiltered);
            setLoadingProducts(false);
            return;
          }
        }
        
        // No local data at all - only fetch from API if online AND user hasn't synced before
        if (isOnline && allProducts.length === 0) {
          console.log("📥 No local products found, fetching from API (first load)...");
          const url = `/api/products?category=${encodeURIComponent(categoryId)}`;
          
          try {
            const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
            
            if (response.ok) {
              const data = await response.json();
              console.log("🛍️ Products from API:", data.data?.length || 0);
              setProducts(data.data || []);
              // Save to IndexedDB for offline support
              if (data.data && data.data.length > 0) {
                await syncProducts(data.data);
                // Also update allProducts for search
                setAllProducts(prev => {
                  const merged = [...prev];
                  data.data.forEach(product => {
                    if (!merged.find(p => p._id === product._id)) {
                      merged.push(product);
                    }
                  });
                  return merged;
                });
              }
              setLastSyncTime(new Date());
            } else {
              console.warn("API returned", response.status);
              setProducts([]);
            }
          } catch (fetchErr) {
            console.error("❌ API fetch failed:", fetchErr.message);
            setProducts([]);
          }
        } else {
          // Offline or user has synced before - show empty with message
          console.log("📦 No products for this category - use Sync Products to load");
          setProducts([]);
        }
        
        setLoadingProducts(false);
      } catch (err) {
        console.error('❌ Unexpected error in fetchProducts:', err);
        setProducts([]);
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [selectedCategory, isOnline, allProducts.length]);

  // Manual sync button handler - syncs ALL products and categories
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      console.log("🔄 Manual sync initiated - syncing ALL products...");
      setError(null);
      
      // Fetch and sync categories - use location filter if available
      const catUrl = location?._id 
        ? `/api/categories?location=${location._id}` 
        : '/api/categories';
      console.log("🔗 Categories API URL:", catUrl);
      
      const catResponse = await fetch(catUrl);
      if (catResponse.ok) {
        const catData = await catResponse.json();
        const fetchedCategories = catData.data || [];
        await syncCategories(fetchedCategories);
        setCategories(fetchedCategories);
        console.log(`✅ Categories synced: ${fetchedCategories.length} categories`);
        
        // Now fetch products for ALL categories
        let allFetchedProducts = [];
        
        for (const category of fetchedCategories) {
          const categoryId = category._id || category.id;
          console.log(`📦 Fetching products for category: ${category.name}...`);
          
          try {
            const prodUrl = `/api/products?category=${encodeURIComponent(categoryId)}`;
            const prodResponse = await fetch(prodUrl, { signal: AbortSignal.timeout(15000) });
            
            if (prodResponse.ok) {
              const prodData = await prodResponse.json();
              const categoryProducts = prodData.data || [];
              allFetchedProducts = [...allFetchedProducts, ...categoryProducts];
              console.log(`   ✅ ${categoryProducts.length} products for ${category.name}`);
            }
          } catch (prodErr) {
            console.warn(`   ⚠️ Failed to fetch products for ${category.name}:`, prodErr.message);
          }
        }
        
        // Save all products to IndexedDB
        if (allFetchedProducts.length > 0) {
          await syncProducts(allFetchedProducts);
          setAllProducts(allFetchedProducts);
          console.log(`✅ Total products synced: ${allFetchedProducts.length}`);
          
          // Reload current category products
          if (selectedCategory) {
            const categoryId = selectedCategory._id || selectedCategory.id;
            const categoryProducts = allFetchedProducts.filter(p => 
              p.category === categoryId || 
              p.categoryId === categoryId
            );
            setProducts(categoryProducts);
          }
        }
        
      } else {
        const errorData = await catResponse.text();
        console.error("❌ Categories API Error:", catResponse.status);
        throw new Error(`Failed to sync categories: ${catResponse.status}`);
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

  // Handle search button click - apply search filter
  const handleSearchClick = () => {
    setAppliedSearch(searchTerm);
  };

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
      
      {/* Customer/Promotion Indicator Banner */}
      {activeCart.customer && (
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-3 py-2 flex items-center justify-between flex-shrink-0 shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <div>
              <div className="font-bold text-base">
                {activeCart.customer.name}
                <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                  {activeCart.customer.type || 'Customer'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Sync Button + Status Bar */}
      <div className="bg-white border-b border-neutral-200 px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Online Status */}
          <div className={`flex items-center gap-1 px-2 py-1.5 rounded ${isOnline ? 'bg-green-50' : 'bg-neutral-100'}`}>
            <FontAwesomeIcon 
              icon={isOnline ? faWifi : faX} 
              className={`w-4 h-4 ${isOnline ? 'text-green-600' : 'text-neutral-400'}`} 
            />
            <span className={`text-xs font-semibold ${isOnline ? 'text-green-700' : 'text-neutral-600'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Last Sync Time */}
          {lastSyncTime && (
            <span className="text-xs text-neutral-500">
              Last sync: {lastSyncTime.toLocaleTimeString()}
            </span>
          )}
        </div>
        
        {/* Sync Button */}
        <button
          onClick={handleManualSync}
          disabled={isSyncing || !isOnline}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white text-xs font-semibold rounded hover:bg-primary-700 disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors duration-base min-h-10"
        >
          <FontAwesomeIcon icon={faSyncAlt} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing...' : 'Sync Products'}
        </button>
      </div>

      {/* Search Bar - Redesigned */}
      <div className="bg-white border-b-2 border-primary-200 px-3 py-2 flex-shrink-0 shadow-sm">
        <div className="relative flex gap-1.5">
          <div className="relative flex-1">
            <FontAwesomeIcon 
              icon={faSearch} 
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500"
            />
            <input
              type="text"
              placeholder="Search products or categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-200 transition-all font-medium"
            />
          </div>
          <button
            onClick={handleSearchClick}
            className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-lg text-sm transition-colors duration-base flex items-center gap-1.5"
          >
            <FontAwesomeIcon icon={faSearch} className="w-4 h-4" />
            <span className="hidden md:inline">Search</span>
          </button>
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
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 auto-rows-max">
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
        {appliedSearch ? (
          // Search Results View - Search across all products
          <div className="bg-white rounded-lg border-2 border-green-200 p-3 mt-3">
            <div className="text-base font-bold text-neutral-900 mb-3">
              🔍 Search Results
            </div>
            {(() => {
              const searchResults = allProducts.filter(product =>
                product.name.toLowerCase().includes(appliedSearch.toLowerCase()) ||
                (product.description && product.description.toLowerCase().includes(appliedSearch.toLowerCase()))
              );
              
              return searchResults.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 auto-rows-max">
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
                      className="relative bg-white rounded-lg border-2 border-green-200 hover:border-green-400 hover:shadow-lg transition-all shadow-sm touch-manipulation overflow-hidden active:scale-[0.98]"
                    >
                      {/* Top Row: Image + Details Side by Side */}
                      <div className="flex h-16">
                        {/* Product Image */}
                        <div className="w-16 h-16 bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                          {!isOnline && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
                              <div className="text-xl">📦</div>
                            </div>
                          )}
                          
                          {isOnline && loadingImages[product._id || product.id] && !failedImages.has(product._id || product.id) && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                              <div className="animate-pulse text-lg">⏳</div>
                            </div>
                          )}
                          
                          {isOnline && !failedImages.has(product._id || product.id) && product.images && product.images.length > 0 && product.images[0].full ? (
                            <img
                              src={product.images[0].full}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onLoadStart={() => setLoadingImages(prev => ({ ...prev, [product._id || product.id]: true }))}
                              onLoad={() => setLoadingImages(prev => ({ ...prev, [product._id || product.id]: false }))}
                              onError={() => handleImageError(product._id || product.id)}
                            />
                          ) : (
                            <div className="text-xl">📦</div>
                          )}
                          
                          {/* Search Badge */}
                          <div className="absolute top-1 left-1 px-1 py-0.5 rounded text-xs font-bold bg-green-600 text-white">
                            🔍
                          </div>
                        </div>

                        {/* Product Details */}
                        <div className="flex-1 p-2 flex flex-col justify-between min-w-0">
                          <div className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">
                            {product.name}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            {/* Stock Badge */}
                            {product.quantity !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                product.quantity <= 0 ? 'bg-red-100 text-red-700' :
                                product.quantity <= 5 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {product.quantity <= 0 ? 'Out' : `${product.quantity} left`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: Price Full Width */}
                      <div className="bg-gradient-to-r from-green-500 to-green-600 px-2 py-1.5">
                        <div className="text-base font-black text-white text-center">
                          ₦{product.salePriceIncTax?.toLocaleString() || '0'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-neutral-400 py-2 text-center">
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
              // Filter products based on applied search term
              const filteredProducts = appliedSearch ? products.filter(product =>
                product.name.toLowerCase().includes(appliedSearch.toLowerCase()) ||
                (product.description && product.description.toLowerCase().includes(appliedSearch.toLowerCase()))
              ) : products;
              
              return filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 auto-rows-max">
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
                    className="relative bg-white rounded border border-gray-200 hover:border-cyan-400 hover:shadow-md transition-all shadow-sm touch-manipulation overflow-hidden active:scale-[0.98] max-w-[180px]"
                  >
                    {/* Top Row: Image + Details Side by Side */}
                    <div className="flex h-16">
                      {/* Product Image */}
                      <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                        {!isOnline && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
                            <div className="text-xl">📦</div>
                          </div>
                        )}
                        
                        {isOnline && loadingImages[product._id || product.id] && !failedImages.has(product._id || product.id) && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                            <div className="animate-pulse text-lg">⏳</div>
                          </div>
                        )}
                        
                        {isOnline && !failedImages.has(product._id || product.id) && product.images && product.images.length > 0 && product.images[0].full ? (
                          <img
                            src={product.images[0].full}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onLoadStart={() => setLoadingImages(prev => ({ ...prev, [product._id || product.id]: true }))}
                            onLoad={() => setLoadingImages(prev => ({ ...prev, [product._id || product.id]: false }))}
                            onError={() => handleImageError(product._id || product.id)}
                          />
                        ) : (
                          <div className="text-xl">📦</div>
                        )}
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 p-1.5 flex flex-col justify-between min-w-0">
                        <div className="text-xs font-bold text-gray-800 leading-tight line-clamp-2">
                          {product.name}
                        </div>
                        <div className="flex items-center justify-end mt-0.5">
                          {/* Stock Badge - Right Aligned */}
                          {product.quantity !== undefined && (
                            <span className={`px-1 py-0.5 rounded text-xs font-bold ${
                              product.quantity <= 0 ? 'bg-red-100 text-red-700' :
                              product.quantity <= 5 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {product.quantity <= 0 ? 'Out' : `${product.quantity}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Price Full Width */}
                    <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 px-2 py-1.5">
                      <div className="text-base font-black text-white text-center">
                        ₦{product.salePriceIncTax?.toLocaleString() || '0'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 py-2 text-center">
                {searchTerm ? 'No products match your search' : 'No products in this category'}
              </div>
            );
            })()}
          </div>
        )}

        {/* Empty State */}
        {!selectedCategory && (
          <div className="flex items-center justify-center text-gray-400 text-center py-6">
            <div>
              <div className="text-2xl mb-1">📦</div>
              <div className="text-xs">Select a category above</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
