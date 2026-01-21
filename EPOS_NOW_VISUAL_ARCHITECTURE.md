# EPOS Now System - Visual Architecture Guide

## System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER / NEXT.JS APP                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      TOP BAR (TopBar.js)                   │ │
│  │  [Store Info] [Date/Time] [Offline Banner] [Tabs] [Icons] │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────┐  ┌─────────────────────────────┐  ┌────────────┐   │
│  │SIDEBAR │  │     CONTENT (Router)        │  │   CART     │   │
│  │        │  │                             │  │   PANEL    │   │
│  │ Admin  │  │  ┌─ MENU Screen             │  │            │   │
│  │ Print  │  │  │  (MenuScreen.js)         │  │ Line Items │   │
│  │ Stock  │  │  │  - Categories Grid       │  │ - Qty +/−  │   │
│  │ Apps   │  │  │  - Product List          │  │ - Discount │   │
│  │        │  │  │                          │  │ - Notes    │   │
│  │ Sync   │  │  ├─ CUSTOMERS Screen       │  │ - Delete   │   │
│  │Status  │  │  │  (Placeholder)           │  │            │   │
│  │        │  │  │                          │  │ Totals:    │   │
│  │        │  │  └─ ORDERS Screen          │  │ - Subtotal │   │
│  │        │  │     (OrdersScreen.js)      │  │ - Discount │   │
│  │        │  │     - Status Tabs          │  │ - Tax      │   │
│  │        │  │     - Order Table          │  │ - TOTAL    │   │
│  │        │  │     - Filters (Date/Time)  │  │            │   │
│  │        │  │                            │  │ Actions:   │   │
│  │        │  │                            │  │ [PRINT]    │   │
│  │        │  │                            │  │ [DELETE]   │   │
│  │        │  │                            │  │ [HOLD]     │   │
│  │        │  │                            │  │ [PAY]      │   │
│  └────────┘  └─────────────────────────────┘  └────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ BOTTOM SHEET (Mobile Only)                                │  │
│  │ [Cart Panel on small screens]                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

                              ↓ (State Management)

┌─────────────────────────────────────────────────────────────────┐
│              CARTCONTEXT (Unified State Engine)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  State:                          Actions:                        │
│  ├─ activeCart                   ├─ addItem()                    │
│  │  ├─ items[]                   ├─ updateQuantity()             │
│  │  ├─ discounts                 ├─ removeItem()                 │
│  │  ├─ status                    ├─ holdOrder()                  │
│  │  └─ totals                    ├─ resumeOrder()                │
│  │                               ├─ completeOrder()              │
│  ├─ orders[]                     ├─ setItemDiscount()            │
│  │  ├─ HELD orders               ├─ setCartDiscount()            │
│  │  ├─ COMPLETE orders           └─ calculateTotals()            │
│  │  └─ PENDING orders                                            │
│  │                                                               │
│  ├─ isOnline (boolean)                                          │
│  ├─ syncStatus                                                   │
│  └─ lastSyncTime                                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

                          ↓ (Persistence)

┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE/SYNC SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐                                            │
│  │  LocalStorage    │  ┌──────────────────────────────┐         │
│  │  - activeCart    │  │     IndexedDB (if available) │         │
│  │  - orders[]      │  │     - orders[]               │         │
│  │  - lastSyncTime  │  │     - sync_log[]             │         │
│  │  - syncLog[]     │  │                              │         │
│  └──────────────────┘  └──────────────────────────────┘         │
│          ↓ (when offline or online)           ↓                 │
│     auto-persist                         auto-persist            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────┐       │
│  │           Sync Manager (sync.js)                     │       │
│  │  - Detects connection status                         │       │
│  │  - Queues orders for sync                            │       │
│  │  - Auto-syncs when online                            │       │
│  │  - Handles conflicts (server wins)                   │       │
│  │  - Records sync events                               │       │
│  └──────────────────────────────────────────────────────┘       │
│                          ↓                                       │
│  ┌──────────────────────────────────────────────────────┐       │
│  │        Backend API (Backend Implementation)          │       │
│  │  POST /api/orders/sync                               │       │
│  │  - Receives queued orders                            │       │
│  │  - Validates & stores                                │       │
│  │  - Returns success/failure                           │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Adding Item to Cart

```
User clicks "Product" in MenuScreen
           ↓
MenuScreen.addItem(product) called
           ↓
CartContext.addItem(product) via useCart()
           ↓
State Update:
  1. Check if product exists in items[]
  2. If exists: increment quantity
  3. If new: add item with quantity=1
           ↓
localStorage updated automatically (useEffect)
           ↓
All components using useCart() re-render
           ↓
CartPanel displays:
  - New item in list
  - Updated totals (with tax)
  - Updated item count
           ↓
User sees cart updated immediately
```

---

## Data Flow: Order Hold & Resume

```
HOLDING AN ORDER:
─────────────────

User clicks "HOLD" button in CartPanel
           ↓
CartPanel.holdOrder() → CartContext.holdOrder()
           ↓
State Changes:
  1. activeCart → orders[] with status='HELD'
  2. activeCart reset to empty
  3. Both persisted to localStorage/IndexedDB
           ↓
CartPanel re-renders (shows empty state)
           ↓
Order appears in ORDERS tab → HELD tab
           ↓


RESUMING AN ORDER:
──────────────────

User clicks order row in ORDERS screen (HELD tab)
           ↓
OrdersScreen.handleOrderSelect(order)
           ↓
CartContext.resumeOrder(orderId)
           ↓
State Changes:
  1. order → activeCart
  2. order removed from orders[]
  3. localStorage updated
           ↓
All screens re-render
           ↓
CartPanel shows resumed order items
User can modify and pay
```

---

## Data Flow: Offline to Online Sync

```
WHILE OFFLINE:
──────────────

User clicks "PAY"
           ↓
CartContext.completeOrder() called
           ↓
Order created with status='COMPLETE'
           ↓
isOnline check:
  ├─ IF ONLINE: syncedAt = now
  └─ IF OFFLINE: needsSync = true
           ↓
Order saved to localStorage
           ↓
lastSyncTime NOT updated (still offline)
           ↓
Offline banner visible in TopBar


WHEN CONNECTION RESTORED:
─────────────────────────

Browser detects connection
           ↓
window 'online' event fires
           ↓
syncManager.setupAutoSync() listener triggered
           ↓
syncManager.syncOrders() called
           ↓
Gets all orders with needsSync=true
           ↓
Sends to /api/orders/sync endpoint
           ↓
Backend Response:
  ├─ SUCCESS:
  │   ├─ Mark order syncedAt = now
  │   ├─ Set needsSync = false
  │   ├─ Update lastSyncTime
  │   └─ Record sync success
  │
  └─ FAILURE:
      ├─ Keep needsSync = true
      ├─ Record error in sync_log
      └─ Retry on next connection
           ↓
Sidebar shows:
  ├─ "Online" indicator (green)
  └─ "Last sync: Just now"
           ↓
Offline banner disappears
```

---

## Component Hierarchy (Technical)

```
<POSPage>
  (CartProvider wrapper - provides context)
  
  └─ <POSContent>
     (Reads CartContext, manages tab state)
     
     ├─ <Sidebar>
     │  └─ Reads: lastSyncTime, isOnline
     │  └─ Actions: expandable menus
     │
     ├─ <TopBar>
     │  └─ Reads: isOnline, tab state
     │  └─ Props: activeTab, onTabChange, onLogout
     │  └─ Updates: currentTime (every 1s)
     │
     ├─ Screen Router
     │  ├─ IF activeTab === 'MENU':
     │  │  └─ <MenuScreen>
     │  │     └─ Reads: useCart() for addItem
     │  │     └─ Displays: Categories, Products
     │  │
     │  ├─ IF activeTab === 'CUSTOMERS':
     │  │  └─ Placeholder (future feature)
     │  │
     │  └─ IF activeTab === 'ORDERS':
     │     └─ <OrdersScreen>
     │        └─ Reads: useCart() for resumeOrder
     │        └─ Displays: Orders table with filters
     │
     └─ <CartPanel>
        └─ Reads: useCart() for all operations
        └─ Displays: Items, totals, actions
        └─ Actions: +/−, discount, hold, pay, delete
```

---

## State Update Flow Diagram

```
Component Event (e.g., user clicks button)
           ↓
Call CartContext function (e.g., addItem)
           ↓
setState() called in CartContext
           ↓
React re-renders:
  ├─ CartContext provider re-renders
  ├─ All child components using useCart() re-render
  │  ├─ CartPanel (updates display)
  │  ├─ MenuScreen (if props change)
  │  ├─ OrdersScreen (if props change)
  │  └─ Sidebar (if sync status changed)
  │
  └─ useEffect hook in CartProvider triggers:
     └─ localStorage.setItem() called
     └─ Data persisted
           ↓
Next render cycle complete, UI shows updated state
```

---

## Mobile vs Desktop Layout

### DESKTOP (>1024px)
```
┌──────────────────────────────────────────────────┐
│            TOP BAR (Full Width)                  │
├─────────────┬───────────────────────┬────────────┤
│             │                       │            │
│   SIDEBAR   │      CONTENT          │   CART     │
│   (240px)   │     (Flexible)        │  (320px)   │
│             │                       │            │
│  Visible    │  MENU, CUSTOMERS,     │  Visible   │
│  by         │  or ORDERS screen     │  by        │
│  default    │                       │  default   │
│             │                       │            │
│             │                       │            │
│             │                       │            │
│             │                       │            │
│             │                       │            │
└─────────────┴───────────────────────┴────────────┘
```

### TABLET (768px - 1024px)
```
┌────────────────────────────────────────┐
│         TOP BAR (Full Width)           │
├──────────┬────────────────────┬────────┤
│ SIDEBAR  │      CONTENT       │ CART   │
│ (200px)  │    (Flexible)      │(250px) │
│          │                    │        │
│ Visible  │ Full screen or     │Partial │
│          │ split view         │        │
│          │                    │        │
└──────────┴────────────────────┴────────┘
```

### MOBILE (<768px)
```
┌────────────────────────┐
│   TOP BAR (Full Width) │
├────────────────────────┤
│   [≡]  CONTENT         │
│        (Full Width)    │
│                        │
│   MENU, CUSTOMERS,     │
│   or ORDERS screen     │
│                        │
├────────────────────────┤
│   CART PANEL           │
│   (Bottom Sheet)       │
│   (300px max height)   │
│                        │
└────────────────────────┘

[≡] = Hamburger menu (toggles sidebar)
```

---

## Order Lifecycle State Machine

```
                    ┌─────────────┐
                    │   DRAFT     │
                    │ (New Items) │
                    └──────┬──────┘
                           │
                      User clicks HOLD
                           │
                    ┌──────▼──────┐
                    │    HELD     │◄──────┐
                    │  (Saved)    │       │ Resume order
                    └──────┬──────┘       │ (reload into cart)
                           │             │
                      User clicks PAY   └─────────────┐
                           │                         │
                    ┌──────▼──────┐        ┌─────────┴──────┐
                    │  COMPLETE   │        │      DRAFT     │
                    │ (Paid/Done) │        │ (Modified held)│
                    └──────┬──────┘        └────────┬───────┘
                           │                       │
                      If offline:              User clicks HOLD
                    needsSync = true                │
                           │              ┌────────▼────────┐
                           │              │     HELD        │
                      Sync when online     │  (Updated)      │
                           │              └────────┬────────┘
                    ┌──────▼──────┐               │
                    │   COMPLETE  │               │ Resume again
                    │  (Synced)   │◄──────────────┘
                    │ syncedAt set│
                    └─────────────┘


Future States (Placeholder):
ORDERED - Sent to kitchen
PENDING - Being prepared
(Currently default to COMPLETE)
```

---

## Component Props & Dependencies

### Sidebar
```javascript
Props:
  (none - reads from context)

Dependencies:
  useCart() → {
    lastSyncTime,
    isOnline
  }

External Deps:
  FontAwesomeIcon
```

### TopBar
```javascript
Props:
  activeTab: string ('MENU' | 'CUSTOMERS' | 'ORDERS')
  onTabChange: function(tab: string)
  onLogout: function()

Dependencies:
  useCart() → { isOnline }

External Deps:
  FontAwesomeIcon
```

### MenuScreen
```javascript
Props:
  (none)

Dependencies:
  useCart() → { addItem }

State:
  selectedCategory
  products (filtered)

External Deps:
  FontAwesomeIcon
```

### OrdersScreen
```javascript
Props:
  (none)

Dependencies:
  useCart() → {
    isOnline,
    lastSyncTime,
    resumeOrder
  }

State:
  activeStatus
  selectedDate
  selectedTime
  filteredOrders

External Deps:
  FontAwesomeIcon
```

### CartPanel
```javascript
Props:
  (none)

Dependencies:
  useCart() → {
    activeCart,
    addItem,
    updateQuantity,
    removeItem,
    setItemDiscount,
    setItemNotes,
    setCartDiscount,
    calculateTotals,
    holdOrder,
    completeOrder,
    deleteCart
  }

State:
  expandedItemId
  discountInput

External Deps:
  FontAwesomeIcon
```

---

## localStorage Schema

```javascript
{
  // Active transaction being built
  "pos_activeCart": {
    id: null,
    items: [
      {
        id: "product_123",
        name: "Bread",
        category: "Bakery",
        price: 800,
        quantity: 2,
        discount: 0,
        notes: ""
      }
    ],
    discountPercent: 0,
    discountAmount: 0,
    subtotal: 1600,
    tax: 160,
    total: 1760,
    status: "DRAFT",
    customer: null,
    staffMember: null,
    tenderType: null,
    notes: "",
    createdAt: null,
    completedAt: null,
    syncedAt: null
  },

  // All saved orders
  "pos_orders": [
    {
      id: "order_1704873600000",
      items: [...],
      status: "HELD", // or ORDERED, PENDING, COMPLETE
      createdAt: "2026-01-10T12:00:00Z",
      completedAt: "2026-01-10T12:05:00Z",
      syncedAt: "2026-01-10T12:05:30Z", // null if offline
      needsSync: false // true if completed offline
    }
  ],

  // Sync metadata
  "pos_lastSyncTime": "2026-01-10T12:05:30Z",
  
  // Sync history (audit log)
  "pos_syncLog": [
    {
      id: "sync_1704873600000",
      timestamp: "2026-01-10T12:05:30Z",
      status: "success",
      ordersCount: 5,
      errorMessage: null
    }
  ]
}
```

---

## API Endpoint References (To Implement)

```javascript
// Get products
GET /api/products
Response: {
  categories: [
    { id, name, color, icon }
  ],
  products: [
    { id, name, category, price, quantity }
  ]
}

// Sync completed orders
POST /api/orders/sync
Body: {
  orders: [
    { id, items[], status, totals, createdAt, completedAt }
  ],
  deviceId: "string",
  timestamp: "ISO string"
}
Response: {
  success: boolean,
  synced: number,
  conflicts: [],
  errors: []
}

// Process payment
POST /api/payments/process
Body: {
  orderId: "string",
  amount: number,
  method: "CASH" | "CARD" | "POS",
  metadata: {}
}
Response: {
  success: boolean,
  transactionId: "string",
  receipt: "string" (HTML)
}

// Staff authentication
POST /api/staff/login
Body: {
  staffId: "string",
  pin: "string"
}
Response: {
  staffMember: { id, name, role },
  token: "JWT",
  permissions: [...]
}

// Get order history
GET /api/orders?status=COMPLETE&dateFrom=...&dateTo=...
Response: {
  orders: [...],
  total: number
}
```

---

## Error Handling Strategy

```
Try Operation
    ↓
Catch Error
    ↓
├─ Network Error (offline)
│  └─ Queue for sync, show offline banner
│
├─ Validation Error (invalid data)
│  └─ Show user message: "Please enter valid amount"
│
├─ Storage Error (quota exceeded)
│  └─ Fallback to localStorage
│  └─ Log to console
│
├─ Sync Error (server unreachable)
│  └─ Keep needsSync flag
│  └─ Retry on next online
│  └─ Show warning badge
│
└─ Unexpected Error
   └─ Log to error tracking (Sentry, etc.)
   └─ Show generic error message
   └─ Recovery: Clear problematic data
```

---

**This visual guide provides architecture at a glance. See documentation files for detailed implementation details.**
