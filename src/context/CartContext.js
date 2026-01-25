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

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { addLocalTransaction, getUnsyncedTransactions } from '../lib/indexedDB';
import { autoSyncTransactions } from '../services/syncService';

// ============================================================================
// CONTEXT DEFINITION
// ============================================================================

const CartContext = createContext();

// ============================================================================
// CART STATE STRUCTURE
// ============================================================================

const INITIAL_CART = {
  id: null, // null for new, UUID for existing
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

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function CartProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

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
      }));
      
      // Load pending sync count from IndexedDB
      getUnsyncedTransactions().then(unsyncedTx => {
        setPendingSyncCount(unsyncedTx.length);
      });
    } catch (err) {
      console.error('Failed to load persisted cart state:', err);
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('pos_orders', JSON.stringify(state.orders));
    localStorage.setItem('pos_activeCart', JSON.stringify(state.activeCart));
  }, [state.orders, state.activeCart]);

  // Detect online/offline
  useEffect(() => {
    const handleOnline = () => setState(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setState(prev => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // =========================================================================
  // CART OPERATIONS
  // =========================================================================

  const addItem = useCallback((product) => {
    setState(prev => {
      const existing = prev.activeCart.items.find(item => item.id === product.id);
      let newItems;

      if (existing) {
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
            notes: '',
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

  const setItemDiscount = useCallback((itemId, discountAmount) => {
    setState(prev => ({
      ...prev,
      activeCart: {
        ...prev.activeCart,
        items: prev.activeCart.items.map(item =>
          item.id === itemId ? { ...item, discount: discountAmount } : item
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
          item.id === itemId ? { ...item, notes } : item
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
        appliedPromotion: promotion,
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

    // Calculate total for the held order
    const items = state.activeCart.items;
    const appliedPromotion = state.activeCart.appliedPromotion;
    let subtotal = 0;
    
    items.forEach(item => {
      let itemTotal = item.price * item.quantity - (item.discount || 0);
      
      // Apply promotion if active
      if (appliedPromotion && appliedPromotion.active) {
        if (appliedPromotion.discountType === 'PERCENTAGE') {
          const percentChange = appliedPromotion.discountValue / 100;
          if (appliedPromotion.valueType === 'MARKUP') {
            itemTotal = itemTotal * (1 + percentChange);
          } else if (appliedPromotion.valueType === 'DISCOUNT') {
            itemTotal = itemTotal * (1 - percentChange);
          }
        }
      }
      subtotal += itemTotal;
    });

    const newOrder = {
      ...state.activeCart,
      id: `order_${Date.now()}`,
      status: 'HELD',
      createdAt: new Date().toISOString(),
      // Store staff and location info when holding
      staffMember: staffInfo || state.activeCart.staffMember,
      location: locationInfo || state.activeCart.location,
      // Store calculated total
      total: subtotal,
      subtotal: subtotal,
    };

    console.log('📋 Holding order with total:', subtotal);

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
      activeCart: order,
      orders: prev.orders.filter(o => o.id !== orderId),
    }));
  }, [state.orders]);

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
      syncStatus: 'synced',
      lastSyncTime: new Date().toISOString(),
    }));

    console.log('✅ Cart cleared after payment');
  }, [state.activeCart]);

  // =========================================================================
  // CART CALCULATIONS
  // =========================================================================

  const calculateTotals = useCallback(() => {
    const { items, discountPercent, fixedDiscount, appliedPromotion } = state.activeCart;
    
    // Debug: Log promotion details
    if (appliedPromotion) {
      console.log('🎁 PROMOTION DEBUG:', {
        promotionName: appliedPromotion.name,
        discountType: appliedPromotion.discountType,
        discountValue: appliedPromotion.discountValue,
        valueType: appliedPromotion.valueType,
        active: appliedPromotion.active,
        fullPromotion: appliedPromotion
      });
    }
    
    // Calculate subtotal with promotion applied to each item
    let subtotal = 0;
    
    items.forEach(item => {
      let itemTotal = item.price * item.quantity - (item.discount || 0);
      const originalItemTotal = itemTotal;
      
      // Apply promotion MARKUP/discount to item if customer selected
      if (appliedPromotion && appliedPromotion.active) {
        if (appliedPromotion.discountType === 'PERCENTAGE') {
          const percentChange = appliedPromotion.discountValue / 100;
          if (appliedPromotion.valueType === 'MARKUP') {
            // MARKUP increases the item price
            itemTotal = itemTotal * (1 + percentChange);
          } else if (appliedPromotion.valueType === 'DISCOUNT') {
            // DISCOUNT decreases the item price
            itemTotal = itemTotal * (1 - percentChange);
          }
          console.log(`📦 Item "${item.name}": Original: ₦${originalItemTotal}, After ${appliedPromotion.valueType} (${appliedPromotion.discountValue}%): ₦${itemTotal}`);
        } else if (appliedPromotion.discountType === 'FIXED') {
          // Fixed amount discount/MARKUP
          if (appliedPromotion.valueType === 'MARKUP') {
            itemTotal = itemTotal + appliedPromotion.discountValue;
          } else if (appliedPromotion.valueType === 'DISCOUNT') {
            itemTotal = Math.max(0, itemTotal - appliedPromotion.discountValue);
          }
          console.log(`📦 Item "${item.name}": Original: ₦${originalItemTotal}, After ${appliedPromotion.valueType} (₦${appliedPromotion.discountValue}): ₦${itemTotal}`);
        }
      }
      
      subtotal += itemTotal;
    });

    // Apply fixed discount if any
    const fixedDiscountAmount = fixedDiscount || 0;
    const discountedSubtotal = Math.max(0, subtotal - fixedDiscountAmount);
    
    const tax = 0; // No tax for now
    const total = discountedSubtotal + tax;

    // Calculate the discount amount for display
    const rawSubtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity - (item.discount || 0),
      0
    );
    const discountAmount = rawSubtotal - subtotal + fixedDiscountAmount;

    // Debug: Log final totals
    if (appliedPromotion) {
      console.log('💰 TOTALS DEBUG:', {
        rawSubtotal,
        subtotalAfterPromotion: subtotal,
        discountAmount: Math.abs(discountAmount),
        fixedDiscountAmount,
        discountedSubtotal,
        total
      });
    }

    return {
      subtotal: rawSubtotal,
      discountAmount: Math.abs(discountAmount),
      discountedSubtotal,
      tax,
      total,
      itemCount: state.activeCart.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [state.activeCart.items, state.activeCart.discountPercent, state.activeCart.appliedPromotion, state.activeCart.fixedDiscount]);

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
    deleteOrder,
    completeOrder,

    // Calculations
    calculateTotals,

    // Helpers
    getOrdersByStatus: (status) => state.orders.filter(o => o.status === status),
    clearCart: () => setState(prev => ({ ...prev, activeCart: { ...INITIAL_CART } })),
    getPendingSyncCount: () => pendingSyncCount,
    manualSync: autoSyncTransactions,
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
