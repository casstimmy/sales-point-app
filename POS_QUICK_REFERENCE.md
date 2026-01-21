# 🚀 POS System Quick Reference

## Current Structure

```
📁 src/
├── 📁 pages/
│   ├── index.js              ← Main POS page (SimplePOS)
│   ├── _app.js              ← Root wrapper with StaffProvider
│   ├── _document.js         ← HTML document setup
│   └── 📁 api/              ← Backend endpoints
│
├── 📁 components/
│   ├── 📁 pos/
│   │   └── SimplePOS.js     ← Main POS component ⭐
│   │
│   ├── 📁 layout/
│   │   ├── Layout.js        ← Main layout wrapper
│   │   ├── Header.js        ← Store header
│   │   └── StaffLogin.js    ← Login screen
│   │
│   ├── 📁 payment/
│   │   ├── PaymentModal.js  ← Payment interface
│   │   └── Receipt.js       ← Receipt display
│   │
│   └── [other folders]      ← EpoNow stuff (not used)
│
├── 📁 context/
│   └── StaffContext.js      ← Global staff state
│
└── 📁 styles/
    └── globals.css          ← Tailwind CSS
```

## Key Components

### SimplePOS.js (Main Component)
**Location**: `src/components/pos/SimplePOS.js`

**What it does:**
- Displays product grid with categories
- Manages shopping cart
- Calculates totals with tax and discount
- Integrates payment modal
- Records transactions

**Props**: None (uses useStaff hook)

**Returns**: Full POS interface with 2 sections
- Left: Product grid + categories
- Right: Cart + checkout

---

## Component Flow

```
HomePage (index.js)
  ↓
SimplePOS
  ├─ Fetch products from /api/products
  ├─ Display product grid
  ├─ Manage cart state
  ├─ Calculate totals
  └─ Show PaymentModal on "PAY" click
```

---

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/products` | GET | Fetch all products with categories |
| `/api/transactions` | POST | Save transaction/payment record |

---

## Key Features & How to Use

### Add Product to Cart
Click any product card → quantity increases or item is added

### Manage Cart
- **+/- Buttons**: Adjust quantity
- **Trash Icon**: Remove item from cart
- **Discount %**: Enter discount percentage

### Checkout
1. Click **PAY** button
2. Select payment method
3. Enter amount (handles change calculation)
4. Confirm payment
5. Receipt displays automatically

### Special Actions
- **HOLD**: Saves order for later (requires backend implementation)
- **CLEAR**: Empties cart with confirmation

---

## State Management

### SimplePOS Component State
```javascript
const [categories, setCategories] = useState([]);      // Product categories
const [products, setProducts] = useState([]);          // All products
const [filteredProducts, setFilteredProducts] = useState([]); // Filtered view
const [selectedCategory, setSelectedCategory] = useState(null); // Current filter
const [cart, setCart] = useState([]);                  // Shopping cart items
const [discountPercent, setDiscountPercent] = useState(0); // Discount %
const [showPaymentModal, setShowPaymentModal] = useState(false); // Modal state
const [showReceipt, setShowReceipt] = useState(false); // Receipt display
const [receiptData, setReceiptData] = useState(null);  // Receipt details
const [searchQuery, setSearchQuery] = useState("");    // Search text
const [loading, setLoading] = useState(true);          // Loading state
```

### Global State (StaffContext)
```javascript
const { staff, incrementSales, recordTransaction } = useStaff();
```

---

## Styling Reference

### Color Scheme
- **Primary**: Blue (600 = `#2563eb`, 50 = `#eff6ff`)
- **Success**: Green (600 = `#16a34a`)
- **Warning**: Orange (500 = `#f97316`)
- **Danger**: Red (500 = `#ef4444`)
- **Background**: White (#ffffff) / Gray (50 = `#f9fafb`)

### Layout Dimensions
- **Cart Panel Width**: 320px (`w-80`)
- **Product Grid Columns**: 3 columns (on desktop)
- **Search Bar Width**: Full width

---

## Common Customizations

### Change Grid Columns
In SimplePOS.js, find the product grid:
```javascript
<div className="grid grid-cols-3 gap-3">
```
Change `grid-cols-3` to:
- `grid-cols-4` for 4 columns
- `grid-cols-2` for 2 columns
- etc.

### Change Tax Rate
Find the tax calculation:
```javascript
const tax = (subtotal - discountAmount) * 0.1; // 10% tax
```
Change `0.1` to desired rate (e.g., `0.15` for 15%)

### Change Product Image Height
Find the product image:
```javascript
className="w-full h-24 object-cover rounded mb-2"
```
Change `h-24` (96px) to desired height:
- `h-32` = 128px
- `h-40` = 160px
- `h-48` = 192px
- etc.

### Disable Discount Field
In the Discount section, change:
```javascript
<input ... disabled={false} />
```
to:
```javascript
<input ... disabled={true} />
```

---

## Troubleshooting

### Products Not Showing
- **Check**: Is `/api/products` endpoint working?
- **Check**: Are products in database?
- **Solution**: Verify API returns array of products with `_id`, `name`, `price`, `category`

### Cart Not Updating
- **Check**: Product clicking is working?
- **Solution**: Verify `addToCart` function is called

### Payment Modal Not Opening
- **Check**: Is PaymentModal component imported?
- **Solution**: Verify `showPaymentModal` state is true

### Styles Not Applied
- **Check**: Is Tailwind CSS loaded?
- **Solution**: Ensure `next.config.mjs` includes Tailwind configuration

---

## Performance Tips

1. **Product Caching**: Products are fetched once on mount
2. **Local State**: Cart is stored in component state (fast)
3. **Lazy Loading**: Consider loading products lazily for 1000+ items
4. **Image Optimization**: Use Next.js Image component for better performance

---

## Security Notes

1. **Payment Validation**: Server should validate payment amounts
2. **Staff Authentication**: Already handled by StaffContext
3. **Transaction Recording**: Happens on backend after validation
4. **Input Sanitization**: Discount and search inputs should be sanitized

---

## Future Enhancements

- [ ] Order history view (recall pending orders)
- [ ] Barcode scanning for quick add
- [ ] Customer information collection
- [ ] Email receipt sending
- [ ] Inventory management integration
- [ ] Analytics dashboard
- [ ] Multi-location support
- [ ] Payment method restrictions by staff role

---

## File Size
- **SimplePOS.js**: ~409 lines (complete POS logic)
- **index.js**: ~45 lines (minimal wrapper)
- **Total Component Code**: ~454 lines

---

## Dependencies
- `@fortawesome/react-fontawesome` - Icons
- `next/router` - Routing
- Tailwind CSS - Styling
- React hooks - State management

All dependencies are already in package.json
