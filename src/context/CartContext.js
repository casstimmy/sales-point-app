/**
 * CartContext - Unified cart & order engine for the POS system
 * 
 * Responsibilities:
 * - Manage active cart (items, quantities, discounts, notes)
 * - Manage order lifecycle (HELD, ORDERED, PENDING, COMPLETE)
 * - Provide shared cart operations across MENU, CUSTOMERS, ORDERS screens
 * - Handle local order persistence via localStorage/IndexedDB
 * - Track offline sync status
 * 
 * State Structure:
 * - activeCart: Current transaction being built
 * - orders: All saved orders (HELD, ORDERED, etc.)
 * - syncStatus: 'synced' | 'syncing' | 'error'
 * - lastSyncTime: ISO timestamp
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { autoSyncTransactions } from '../services/syncService';
import {
  getOnlineStatus,
  getPendingTransactionsCount,
  getSyncIssueCount,
  saveTransactionOffline,
} from '../lib/offlineSync';
import { getSyncMeta } from '../lib/indexedDB';
import { showToast } from '../components/common/Toast';
import { doesPromotionApplyToItem, getMaxLineDiscount, priceCart, toSaleItems } from '../lib/cartPricing';
import { toPromotionSnapshot } from '../lib/promotionRules';
import { getRoomReservationDetails, isRoomProduct } from '../lib/roomReservations';

// ============================================================================
// CONTEXT DEFINITION
// ============================================================================

const CartContext = createContext();

// ============================================================================
// CART STATE STRUCTURE
// ============================================================================

const INITIAL_CART = {
  id: null, // null for new, UUID for existing
  recallSourceTransactionId: null, // server/hold id of the sale this cart was recalled from
  recallSourceStatus: null, // 'held' when this cart is a held order being resumed, else the recalled sale's status
  onlineOrder: null, // online order metadata when processing web orders in POS
  items: [], // [{ id, name, category, price, quantity, discount, notes }, ...]
  discountPercent: 0,
  discountAmount: 0,
  subtotal: 0,
  tax: 0,
  total: 0,
  status: 'DRAFT', // DRAFT, HELD, ORDERED, PENDING, COMPLETE
  customer: null,
  staffMember: null,
  tenderType: null, // CASH, POS, etc.
  notes: '',
  createdAt: null,
  completedAt: null,
  syncedAt: null,
};

const INITIAL_STATE = {
  activeCart: { ...INITIAL_CART },
  orders: [],
  syncStatus: 'synced', // synced | syncing | error
  lastSyncTime: null,
  isOnline: true,
  error: null,
};

// Kept for existing imports; pricing rules live in lib/cartPricing.
export { doesPromotionApplyToItem };

const getOrderContactDetails = (order = {}) => {
  const shippingDetails = order?.shippingDetails || {};
  const customerSnapshot = order?.customerSnapshot || {};
  const customer = order?.customer || {};

  return {
    name: shippingDetails.name || customerSnapshot.name || customer.name || '',
    email: shippingDetails.email || customerSnapshot.email || customer.email || '',
    phone: shippingDetails.phone || customerSnapshot.phone || customer.phone || '',
    address: shippingDetails.address || customerSnapshot.address || customer.address || '',
    city: shippingDetails.city || customerSnapshot.city || customer.city || '',
  };
};

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function CartProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncIssueCount, setSyncIssueCount] = useState(0);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const lastAddRef = useRef({});

  const resolvePersistedSyncTime = useCallback(async (explicitSyncTime = null) => {
    const candidates = [];

    if (explicitSyncTime) {
      candidates.push(explicitSyncTime);
    }

    if (typeof window !== 'undefined') {
      candidates.push(localStorage.getItem('pos_lastSyncTime'));
    }

    try {
      const [productMeta, categoryMeta] = await Promise.all([
        getSyncMeta('lastProductSync'),
        getSyncMeta('lastCategorySync'),
      ]);

      candidates.push(productMeta?.timestamp, categoryMeta?.timestamp);
    } catch (error) {
      console.warn('Failed to resolve IndexedDB sync metadata:', error);
    }

    return candidates.reduce((latest, candidate) => {
      if (!candidate) return latest;

      const candidateDate = new Date(candidate);
      if (Number.isNaN(candidateDate.getTime())) {
        return latest;
      }

      if (!latest) {
        return candidateDate.toISOString();
      }

      return candidateDate > new Date(latest) ? candidateDate.toISOString() : latest;
    }, null);
  }, []);

  const refreshSyncState = useCallback(async ({ syncedAt = null } = {}) => {
    try {
      const pendingCount = await getPendingTransactionsCount();
      setSyncIssueCount(await getSyncIssueCount());
      let persistedSyncTime = await resolvePersistedSyncTime(syncedAt);

      if (!persistedSyncTime && pendingCount === 0 && getOnlineStatus()) {
        persistedSyncTime = new Date().toISOString();
      }

      if (persistedSyncTime && typeof window !== 'undefined') {
        localStorage.setItem('pos_lastSyncTime', persistedSyncTime);
      }

      setPendingSyncCount(pendingCount);
      setState(prev => ({
        ...prev,
        isOnline: getOnlineStatus(),
        lastSyncTime: persistedSyncTime || prev.lastSyncTime || null,
      }));
    } catch (err) {
      console.error('Failed to refresh sync state:', err);
    }
  }, [resolvePersistedSyncTime]);

  // Load persisted orders from localStorage on mount
  useEffect(() => {
    try {
      const savedOrders = localStorage.getItem('pos_orders');
      const savedCart = localStorage.getItem('pos_activeCart');
      const savedSyncTime = localStorage.getItem('pos_lastSyncTime');

      setState(prev => ({
        ...prev,
        orders: savedOrders ? JSON.parse(savedOrders) : [],
        activeCart: savedCart ? JSON.parse(savedCart) : { ...INITIAL_CART },
        lastSyncTime: savedSyncTime,
        isOnline: getOnlineStatus(),
      }));

      refreshSyncState({ syncedAt: savedSyncTime });
    } catch (err) {
      console.error('Failed to load persisted cart state:', err);
    }
  }, [refreshSyncState]);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('pos_orders', JSON.stringify(state.orders));
    localStorage.setItem('pos_activeCart', JSON.stringify(state.activeCart));
  }, [state.orders, state.activeCart]);

  // Detect online/offline
  useEffect(() => {
    const handleConnectivityChange = () => {
      setState(prev => ({ ...prev, isOnline: getOnlineStatus() }));
      refreshSyncState();
    };

    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);

    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [refreshSyncState]);

  useEffect(() => {
    const handleSyncStateChange = (event) => {
      const syncedAt = event?.detail?.syncedAt || event?.detail?.lastSyncTime || null;

      if (syncedAt && typeof window !== 'undefined') {
        localStorage.setItem('pos_lastSyncTime', syncedAt);
      }

      refreshSyncState({ syncedAt });
    };

    // A sale that cannot sync is announced straight away instead of failing quietly.
    const handleSyncAlert = (event) => {
      const amount = Number(event?.detail?.total || 0);
      const message = event?.detail?.message || 'A sale could not be sent to the server.';
      showToast(
        `Sale of ₦${amount.toLocaleString('en-NG')} did not sync: ${message} Open "Unsynced" to fix it.`,
        'error',
        8000
      );
      refreshSyncState();
    };

    window.addEventListener('pos:sync-state-changed', handleSyncStateChange);
    window.addEventListener('transactions:completed', handleSyncStateChange);
    window.addEventListener('pos:sync-alert', handleSyncAlert);

    return () => {
      window.removeEventListener('pos:sync-state-changed', handleSyncStateChange);
      window.removeEventListener('transactions:completed', handleSyncStateChange);
      window.removeEventListener('pos:sync-alert', handleSyncAlert);
    };
  }, [refreshSyncState]);

  const manualSync = useCallback(async () => {
    setState(prev => ({
      ...prev,
      syncStatus: 'syncing',
      error: null,
      isOnline: getOnlineStatus(),
    }));

    try {
      const result = await autoSyncTransactions();
      const hasSuccessfulSync = Boolean(result?.success || Number(result?.synced || 0) > 0);
      const syncedAt = hasSuccessfulSync ? new Date().toISOString() : null;

      if (syncedAt && typeof window !== 'undefined') {
        localStorage.setItem('pos_lastSyncTime', syncedAt);
      }

      await refreshSyncState({ syncedAt });

      setState(prev => ({
        ...prev,
        syncStatus: result?.error ? 'error' : 'synced',
        lastSyncTime: syncedAt || prev.lastSyncTime,
        error: result?.error || null,
        isOnline: getOnlineStatus(),
      }));

      return result;
    } catch (err) {
      await refreshSyncState();
      setState(prev => ({
        ...prev,
        syncStatus: 'error',
        error: err?.message || 'Sync failed',
        isOnline: getOnlineStatus(),
      }));
      throw err;
    }
  }, [refreshSyncState]);

  // =========================================================================
  // CART OPERATIONS
  // =========================================================================

  const addItem = useCallback((product) => {
    setState(prev => {
      const productId = product?.id;
      if (productId) {
        const lastAt = lastAddRef.current[productId] || 0;
        const now = Date.now();
        if (now - lastAt < 250) {
          return prev;
        }
        lastAddRef.current[productId] = now;
      }

      const existing = prev.activeCart.items.find(item => item.id === product.id);
      const isRoom = isRoomProduct(product);
      const roomReservationDetails = isRoom ? getRoomReservationDetails(product) : null;
      let newItems;

      if (existing && isRoom) {
        newItems = prev.activeCart.items.map(item =>
          item.id === product.id
            ? {
                ...item,
                name: product.name,
                category: product.category,
                price: product.price,
                quantity: 1,
                notes: roomReservationDetails?.notes || item.notes || '',
                productType: product.productType,
                roomStatus: product.roomStatus || item.roomStatus || 'available',
                reservationDetails: roomReservationDetails,
              }
            : item
        );
      } else if (existing) {
        newItems = prev.activeCart.items.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        newItems = [
          ...prev.activeCart.items,
          {
            id: product.id,
            name: product.name,
            category: product.category,
            price: product.price,
            quantity: 1,
            discount: 0,
            notes: roomReservationDetails?.notes || '',
            productType: product.productType || 'standard',
            roomStatus: product.roomStatus || 'available',
            reservationDetails: roomReservationDetails,
          },
        ];
      }

      return {
        ...prev,
        activeCart: {
          ...prev.activeCart,
          items: newItems,
        },
      };
    });
  }, []);

  const updateQuantity = useCallback((itemId, quantity) => {
    setState(prev => {
      const targetItem = prev.activeCart.items.find(item => item.id === itemId);
      if (isRoomProduct(targetItem)) {
        return {
          ...prev,
          activeCart: {
            ...prev.activeCart,
            items: prev.activeCart.items.map(item =>
              item.id === itemId ? { ...item, quantity: 1 } : item
            ),
          },
        };
      }

      if (quantity <= 0) {
        return {
          ...prev,
          activeCart: {
            ...prev.activeCart,
            items: prev.activeCart.items.filter(item => item.id !== itemId),
          },
        };
      }

      return {
        ...prev,
        activeCart: {
          ...prev.activeCart,
          items: prev.activeCart.items.map(item =>
            item.id === itemId ? { ...item, quantity } : item
          ),
        },
      };
    });
  }, []);

  const removeItem = useCallback((itemId) => {
    setState(prev => ({
      ...prev,
      activeCart: {
        ...prev.activeCart,
        items: prev.activeCart.items.filter(item => item.id !== itemId),
      },
    }));
  }, []);

  // Line discount in naira, never below zero or above the line's value.
  const setItemDiscount = useCallback((itemId, discountAmount) => {
    setState(prev => ({
      ...prev,
      activeCart: {
        ...prev.activeCart,
        items: prev.activeCart.items.map(item =>
          item.id === itemId
            ? {
                ...item,
                discount: Math.min(
                  Math.max(0, Math.round(Number(discountAmount) || 0)),
                  getMaxLineDiscount(item)
                ),
              }
            : item
        ),
      },
    }));
  }, []);

  const setItemNotes = useCallback((itemId, notes) => {
    setState(prev => ({
      ...prev,
      activeCart: {
        ...prev.activeCart,
        items: prev.activeCart.items.map(item =>
          item.id === itemId
            ? {
                ...item,
                notes,
                reservationDetails: isRoomProduct(item)
                  ? { ...getRoomReservationDetails(item), notes }
                  : item.reservationDetails,
              }
            : item
        ),
      },
    }));
  }, []);

  const setCartDiscount = useCallback((discountPercent) => {
    setState(prev => ({
      ...prev,
      activeCart: {
        ...prev.activeCart,
        discountPercent: Math.max(0, Math.min(100, discountPercent)),
      },
    }));
  }, []);

  // Set customer with optional promotion - applies discount to all items
  const setCustomer = useCallback((customer, promotion = null) => {
    setState(prev => {
      const newCart = {
        ...prev.activeCart,
        customer: customer,
        // A compact copy, so held and recalled sales keep exactly the same pricing.
        appliedPromotion: toPromotionSnapshot(promotion),
      };

      // The promotion will be applied in calculateTotals
      // Just store the promotion object as-is
      if (promotion && promotion.active) {
        console.log('✅ Promotion applied:', {
          name: promotion.name,
          discountType: promotion.discountType,
          discountValue: promotion.discountValue,
          valueType: promotion.valueType
        });
      }

      return {
        ...prev,
        activeCart: newCart,
      };
    });
  }, []);

  // Clear customer from cart
  const clearCustomer = useCallback(() => {
    setState(prev => ({
      ...prev,
      activeCart: {
        ...prev.activeCart,
        customer: null,
        discountPercent: 0,
        discountAmount: 0,
        appliedPromotion: null,
      },
    }));
  }, []);

  // =========================================================================
  // ORDER OPERATIONS
  // =========================================================================

  const holdOrder = useCallback((staffInfo = null, locationInfo = null) => {
    if (state.activeCart.items.length === 0) {
      console.warn('Cannot hold empty cart');
      return;
    }

    const holdReferenceId = state.activeCart.id || `order_${Date.now()}`;

    // Price the held order with the same rules as the till, so the held total is what the customer will pay.
    const items = state.activeCart.items;
    const pricing = priceCart(state.activeCart);
    const saleItemsById = Object.fromEntries(
      toSaleItems(state.activeCart, pricing).map((line) => [String(line.productId), line])
    );

    const newOrder = {
      ...state.activeCart,
      id: holdReferenceId,
      recallSourceTransactionId:
        state.activeCart.recallSourceTransactionId || holdReferenceId,
      recallSourceStatus: 'held',
      status: 'HELD',
      createdAt: state.activeCart.createdAt || new Date().toISOString(),
      // Store staff and location info when holding
      staffMember: staffInfo || state.activeCart.staffMember,
      location: locationInfo || state.activeCart.location,
      // Store calculated total
      total: pricing.total,
      subtotal: pricing.subtotal,
    };

    console.log('📋 Holding order with total:', pricing.total);

    // =====================================================================
    // SAVE HELD ORDER AS TRANSACTION FOR INVENTORY REVIEW
    // =====================================================================
    // Convert cart items to transaction format
    const transactionItems = items.map(item => ({
      ...item,
      ...saleItemsById[String(item.id)],
      productId: item.id,
      name: item.name,
      price: item.price,
      quantity: isRoomProduct(item) ? 1 : item.quantity,
      salePriceIncTax: item.price,
      qty: isRoomProduct(item) ? 1 : item.quantity,
      reservationDetails: isRoomProduct(item) ? getRoomReservationDetails(item) : undefined,
    }));

    // Create transaction object with "held" status
    // Handle location - it might be a string or an object with a name property
    const locationString = typeof locationInfo === 'string' 
      ? locationInfo 
      : (locationInfo?.name || locationInfo?.code || 'Default Location');
    
    // If this cart was recalled from an existing held transaction, update it instead of creating a new one
    const existingHeldId = state.activeCart.recallSourceTransactionId || null;

    const heldTransaction = {
      id: holdReferenceId,
      externalId: holdReferenceId,
      clientId: holdReferenceId,
      ...(existingHeldId ? { editTransactionId: existingHeldId } : {}),
      items: transactionItems,
      total: pricing.total,
      subtotal: pricing.subtotal,
      tax: 0,
      discount: pricing.discountAmount,
      discountName: pricing.discountName,
      incrementAmount: pricing.incrementAmount,
      incrementName: pricing.incrementName,
      promotionValueType: pricing.promotionValueType,
      appliedPromotion: state.activeCart.appliedPromotion || null,
      customerId: state.activeCart.customer?._id || null,
      customerType: state.activeCart.customer?.type || null,
      staffName: staffInfo?.name || staffInfo || 'POS Staff',
      staffId: staffInfo?._id || staffInfo?.id || null,
      location: locationString,
      locationId: (typeof locationInfo === 'object' && locationInfo?._id) || null,
      device: state.activeCart.device || 'POS',
      tableName: state.activeCart.tableName || null,
      customerName: state.activeCart.customer?.name || null,
      status: 'held', // This marks it as a held transaction for inventory review
      tenderType: null, // No payment tender for held orders
      amountPaid: 0,
      change: 0,
      createdAt: existingHeldId ? (state.activeCart.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tillId: state.activeCart.tillId || null,
      heldByStaffName: staffInfo?.name || staffInfo || 'POS Staff',
      heldByStaffId: staffInfo?._id || staffInfo?.id || null,
    };

    // Save held transaction to database (online) or queue offline
    if (getOnlineStatus()) {
      // Online: Send directly to server
      try {
        fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(heldTransaction),
        })
          .then(response => {
            if (response.ok) {
              console.log('✅ Held order saved to database for inventory review');
              window.dispatchEvent(new CustomEvent('pos:held-updated'));
            } else {
              console.warn('⚠️ Failed to save held order to database, queuing offline');
              saveTransactionOffline(heldTransaction);
            }
          })
          .catch(err => {
            console.warn('⚠️ Error saving held order online, queuing offline:', err);
            saveTransactionOffline(heldTransaction);
          });
      } catch (err) {
        console.error('⚠️ Failed to save held order:', err);
        saveTransactionOffline(heldTransaction);
      }
    } else {
      // Offline: Queue to IndexedDB
      console.log('🔴 Offline - Queuing held order for sync');
      saveTransactionOffline(heldTransaction)
        .then(() => {
          console.log('✅ Held order queued for database sync');
        })
        .catch(err => {
          console.error('⚠️ Failed to queue held order:', err);
        });
    }

    setState(prev => ({
      ...prev,
      orders: [...prev.orders, newOrder],
      activeCart: { ...INITIAL_CART },
    }));
  }, [state.activeCart]);

  const resumeOrder = useCallback((orderId) => {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
      console.error('Order not found:', orderId);
      return;
    }

    setState(prev => ({
      ...prev,
      // Resuming keeps the hold's id so paying for it completes the same record on the server.
      activeCart: {
        ...order,
        status: 'DRAFT',
        recallSourceTransactionId: order.recallSourceTransactionId || order.id,
        recallSourceStatus: 'held',
      },
      orders: prev.orders.filter(o => o.id !== orderId),
    }));
  }, [state.orders]);

  const recallTransactionToCart = useCallback((transaction) => {
    if (!transaction || !Array.isArray(transaction.items)) {
      console.error('Invalid transaction for recall:', transaction);
      return;
    }

    const mappedItems = transaction.items.map((item) => ({
      id: item.productId || item.id,
      name: item.name,
      category: item.category,
      price: item.salePriceIncTax || item.price || 0,
      quantity: item.qty || item.quantity || 1,
      discount: item.discount || 0,
      notes: item.note || item.notes || '',
      productType: item.productType || 'standard',
      roomStatus: item.roomStatus || 'available',
      reservationDetails: isRoomProduct(item) ? getRoomReservationDetails(item) : null,
    }));

    const recalledId = transaction.id || transaction._id || null;
    const recallSourceStatus = String(transaction.status || 'completed').toLowerCase();

    setState(prev => ({
      ...prev,
      // A held order picked up from the server is no longer "on this device only".
      orders: recallSourceStatus === 'held'
        ? prev.orders.filter(o => o.id !== transaction.externalId && o.id !== recalledId)
        : prev.orders,
      activeCart: {
        ...INITIAL_CART,
        id: recalledId,
        recallSourceTransactionId: recalledId,
        recallSourceStatus,
        tableName: transaction.tableName || null,
        items: mappedItems,
        // Restore the customer's promotion so the recalled sale prices the same as before.
        appliedPromotion: transaction.appliedPromotion || null,
        subtotal: transaction.subtotal || 0,
        tax: transaction.tax || 0,
        total: transaction.total || 0,
        status: 'DRAFT',
        customer: transaction.customerName
          ? {
              ...(transaction.customerId ? { _id: String(transaction.customerId) } : {}),
              name: transaction.customerName,
              ...(transaction.customerType ? { type: transaction.customerType } : {}),
            }
          : null,
        createdAt: transaction.createdAt || new Date().toISOString(),
      },
    }));
  }, []);

  const loadOnlineOrderToCart = useCallback((order) => {
    if (!order) {
      console.error('Invalid online order for POS processing:', order);
      return;
    }

    const orderItems = Array.isArray(order.cartProducts) && order.cartProducts.length > 0
      ? order.cartProducts
      : (order.items || []);
    const contactDetails = getOrderContactDetails(order);

    const mappedItems = orderItems.map((item) => ({
      id: item.productId || item.id,
      name: item.name,
      category: item.category,
      price: item.salePriceIncTax || item.price || 0,
      quantity: item.qty || item.quantity || 1,
      discount: item.discount || 0,
      notes: item.note || item.notes || '',
      productType: item.productType || 'standard',
      roomStatus: item.roomStatus || 'available',
      reservationDetails: isRoomProduct(item) ? getRoomReservationDetails(item) : null,
    }));

    setState(prev => ({
      ...prev,
      activeCart: {
        ...INITIAL_CART,
        id: order.id || order._id || null,
        items: mappedItems,
        subtotal: Number(order.subtotal || order.total || 0),
        tax: Number(order.tax || 0),
        total: Number(order.total || 0),
        status: 'DRAFT',
        customer: {
          name: contactDetails.name || order.customerName || 'Online Customer',
          email: contactDetails.email || '',
          phone: contactDetails.phone || '',
          address: contactDetails.address || '',
          city: contactDetails.city || '',
          type: 'ONLINE',
        },
        createdAt: order.createdAt || new Date().toISOString(),
        onlineOrder: {
          id: order.id || order._id || null,
          status: order.status || 'Pending',
          paymentStatus: order.paymentStatus || 'Pending',
          requestedFinalStatus: order.requestedFinalStatus || 'Processing',
          siteKey: order.siteKey || 'store',
          sourceLabel: order.sourceLabel || 'Store Website',
          shippingDetails: contactDetails,
          shippingCost: Number(order.shippingCost || order.deliveryFee || 0),
          deliveryFeeName: order.deliveryFeeName || order.shippingName || 'Delivery Fee',
          discount: Number(order.discount || order.discountAmount || 0),
          discountName: order.discountName || order.discountReason || 'Discount',
          locationName: order.locationName || order.location || '',
          locationId: order.locationId || null,
        },
      },
    }));
  }, []);

  const deleteOrder = useCallback((orderId) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.filter(o => o.id !== orderId),
    }));
  }, []);

  const deleteCart = useCallback(() => {
    setState(prev => ({
      ...prev,
      activeCart: { ...INITIAL_CART },
    }));
  }, []);

  const completeOrder = useCallback((paymentMethod = 'CASH') => {
    if (state.activeCart.items.length === 0) {
      console.warn('Cannot complete empty cart');
      return;
    }

    // NOTE: Transaction saving is now handled by the Payment Modal
    // This function only clears the cart. No transaction object is created here.
    
    setState(prev => ({
      ...prev,
      activeCart: { ...INITIAL_CART }, // Clear the active cart
    }));

    console.log('✅ Cart cleared after payment');
  }, [state.activeCart]);

  // =========================================================================
  // CART CALCULATIONS
  // =========================================================================

  // One pricing function for the cart lines, totals, held orders, payment and receipts.
  const calculateTotals = useCallback(() => priceCart(state.activeCart), [state.activeCart]);

  // =========================================================================
  // CONTEXT VALUE
  // =========================================================================

  const value = {
    // State
    activeCart: state.activeCart,
    orders: state.orders,
    syncStatus: state.syncStatus,
    lastSyncTime: state.lastSyncTime,
    isOnline: state.isOnline,
    error: state.error,
    pendingSyncCount,
    syncIssueCount,

    // Cart operations
    addItem,
    updateQuantity,
    removeItem,
    setItemDiscount,
    setItemNotes,
    setCartDiscount,
    setCustomer,
    clearCustomer,
    deleteCart,

    // Order operations
    holdOrder,
    resumeOrder,
    recallTransactionToCart,
    loadOnlineOrderToCart,
    deleteOrder,
    completeOrder,

    // Calculations
    calculateTotals,

    // Helpers
    getOrdersByStatus: (status) => state.orders.filter(o => o.status === status),
    clearCart: () => setState(prev => ({ ...prev, activeCart: { ...INITIAL_CART } })),
    getPendingSyncCount: () => pendingSyncCount,
    manualSync,

    // Payment UI
    showPaymentPanel,
    setShowPaymentPanel,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
