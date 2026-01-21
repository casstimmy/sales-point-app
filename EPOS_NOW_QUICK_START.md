# EPOS Now POS System - Quick Start Guide

## Setup & Running

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation
```bash
npm install
# or
yarn install
```

### Development Server
```bash
npm run dev
```

Navigate to `http://localhost:3000`

---

## Quick Test Workflow

### 1. Start the App
- You'll see the staff login screen
- For testing, you can modify [StaffLogin.js](src/components/layout/StaffLogin.js) to skip login

### 2. Test MENU Tab (Sales)
- Click a category tile (e.g., "BAKERY")
- Products appear below
- Click a product → added to cart
- Adjust quantity in cart panel (right side)

### 3. Test Cart Operations
- **+/− buttons**: Change quantity
- **DISCOUNT button**: Add per-item discount (adds ₦100)
- **NOTE button**: Add special instructions
- **Discount % input**: Apply cart-wide discount
- **DELETE**: Remove item from cart
- **HOLD**: Save order to HELD tab, clear cart
- **PAY**: Complete transaction (marks as COMPLETE)

### 4. Test ORDERS Tab
- Shows all completed orders
- Click **HELD** tab → see held orders
- Click an order → loads it back into cart
- Use **date/time filters** to search orders

### 5. Test Offline Mode
- **Disable internet** (DevTools or actual network down)
- Red "OFFLINE" banner appears in top bar
- Add items and click PAY
- Order is saved locally
- **Reconnect**: Auto-sync happens, order syncs to backend

### 6. Test Sidebar
- **Admin** section: Click to expand/collapse
- Sections show accordion behavior
- **Cloud Sync** shows status (Online/Offline)
- Last sync time updates automatically

---

## File Structure

```
src/
├── components/pos/
│   ├── Sidebar.js          # Left navigation (accordion menus)
│   ├── TopBar.js           # Store info, tabs, offline banner
│   ├── MenuScreen.js       # Category grid + product list
│   ├── OrdersScreen.js     # Orders table with filters
│   └── CartPanel.js        # Right checkout panel (shared)
│
├── context/
│   └── CartContext.js      # Unified cart & order engine
│
├── lib/offline/
│   ├── storage.js          # IndexedDB/localStorage wrapper
│   ├── sync.js             # Auto-sync manager
│   └── hooks.js            # useOnlineStatus, useSyncState
│
└── pages/
    └── index.js            # Main POS page (layout coordinator)
```

---

## Key Components Explained

### CartContext (`useCart` hook)

Used everywhere to manage cart state:

```javascript
const { 
  activeCart,        // Current transaction
  orders,            // Saved orders
  isOnline,          // Connection status
  addItem,           // Add product to cart
  updateQuantity,    // Change qty
  holdOrder,         // Save as HELD
  completeOrder,     // Finalize & sync
  calculateTotals,   // Get subtotal, tax, total
} = useCart();
```

### MenuScreen
- Displays 12 product categories in color-coded grid
- Click category → products appear below
- Click product → `addItem()` to cart
- Touch-optimized (large buttons, no hover)

### CartPanel
- Shows all items in activeCart
- Qty controls, discounts, notes
- Running totals with 10% tax
- Action buttons: PRINT, NO SALE, DELETE, HOLD, PAY

### OrdersScreen
- Table of all completed transactions
- Status tabs: HELD, ORDERED, PENDING, COMPLETE
- Date/time filter controls
- Click row → loads order back into cart for modification

### Sidebar
- Accordion menus: Admin, Print, Stock, Apps
- Cloud sync status with last sync time
- Shows Online/Offline indicator

---

## Common Tasks

### Adding a New Category

Edit `src/components/pos/MenuScreen.js`:

```javascript
const CATEGORIES = [
  // ... existing categories
  {
    id: 13,
    name: 'NEW CATEGORY',
    color: 'from-green-500 to-green-600',
    icon: faLeaf,
  },
];
```

### Adding Products

Update `MOCK_PRODUCTS` in MenuScreen:

```javascript
const MOCK_PRODUCTS = {
  13: [
    { id: 1301, name: 'New Product', category: 'NEW CATEGORY', price: 5000 },
  ],
};
```

### Changing Colors

Use Tailwind gradient classes in component color props:
```javascript
color: 'from-purple-500 to-purple-600'
```

Available: blue, red, green, yellow, purple, pink, orange, cyan, teal, etc.

### Adjusting Tax Rate

In `CartContext.js`, find `calculateTotals()`:

```javascript
const tax = discountedSubtotal * 0.1; // Change 0.1 to desired rate
```

---

## Offline Behavior

### What Works Offline
✅ Add/remove items from cart  
✅ Hold/resume orders  
✅ Complete orders (saved locally)  
✅ View HELD orders  

### What Doesn't Work Offline
❌ Sync (happens automatically when online)  
❌ Fetch product updates from server  
❌ Advanced filtering (uses mock data)  

### Sync Metadata
- Orders marked with `needsSync: true` when completed offline
- Auto-syncs when connection restored
- `lastSyncTime` updates on successful sync
- Sync log recorded for audit trail

---

## Debugging

### Check Console for Errors
```bash
# In browser DevTools
console.log(localStorage.getItem('pos_orders')) // View saved orders
console.log(localStorage.getItem('pos_activeCart')) // View current cart
```

### View All Redux State
```javascript
// Add to any component
const cart = useCart();
console.log('Full cart state:', cart);
```

### Test Offline Mode
In DevTools Network tab:
- Set throttling to "Offline"
- Complete order
- Set back to online
- Watch sync happen

### Reset All Data
```javascript
// In browser console
localStorage.clear();
location.reload();
```

---

## Production Checklist

- [ ] Connect to real backend API (`src/lib/offline/sync.js` line 90)
- [ ] Implement payment gateway (CartPanel.js `handlePayment`)
- [ ] Add staff authentication (currently bypassed for testing)
- [ ] Set up receipt printing (Thermal printer or HTML print)
- [ ] Configure proper Tailwind build (currently using CDN)
- [ ] Add error tracking (Sentry or similar)
- [ ] Set up analytics
- [ ] Configure HTTPS
- [ ] Test on actual POS terminals (test responsiveness)
- [ ] Performance testing (Lighthouse audit)
- [ ] Security audit (XSS, CSRF, auth tokens)

---

## Troubleshooting

### Cart not updating?
- Check if `CartProvider` wraps the page (in `pages/index.js`)
- Verify component uses `useCart()` hook
- Check browser console for errors

### Offline mode not working?
- Ensure you're using Chrome/Firefox (Safari has limited IndexedDB)
- Check `Application` tab → Storage → IndexedDB
- Verify localStorage is enabled

### Products not showing?
- Check if MOCK_PRODUCTS has data for selected category
- Add category ID to MOCK_PRODUCTS object

### Sync not triggering?
- Manually call in browser console: `syncManager.syncOrders()`
- Check if orders have `needsSync: true` flag
- Verify backend API is configured

---

## Next Steps

1. **Backend Integration**
   - Update `_syncWithBackend()` in `src/lib/offline/sync.js`
   - Connect to `/api/orders/sync` endpoint

2. **Payment Processing**
   - Integrate payment gateway (Stripe, Paystack, etc.)
   - Update `handlePayment()` in CartPanel

3. **Inventory Sync**
   - Fetch products from DB instead of mock data
   - Add real-time stock checking

4. **Customer Management**
   - Implement CUSTOMERS tab
   - Add loyalty program integration

5. **Reporting**
   - Add analytics dashboard
   - Export daily sales reports

---

**Questions?** See [EPOS_NOW_SYSTEM_ARCHITECTURE.md](EPOS_NOW_SYSTEM_ARCHITECTURE.md) for detailed component APIs and system design.
