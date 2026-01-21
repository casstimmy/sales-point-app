# Using Real Inventory Data (Not Seed Data)

## Overview

Your POS system should use **real product and category data** from your actual inventory, not hardcoded seed/test data.

---

## How the System Works Now

### ✅ Live Data Flow
```
Database (MongoDB)
    ↓
/api/categories endpoint (GET)
    ↓
/api/products endpoint (GET)
    ↓
IndexedDB cache (local)
    ↓
MenuScreen displays live products
```

The system **automatically** fetches from your actual MongoDB database when you:
1. Start the app
2. Click "Sync Products"
3. Select a category

### ❌ Don't Use Seed Data Directly
```
❌ DON'T use /api/seed/test-data (this is development-only)
✅ DO use /api/products/create and /api/categories/create
✅ DO import from your existing inventory
```

---

## Method 1: Use Admin Portal (Recommended)

If you have an admin dashboard/portal, add products there directly. This ensures data is consistent across systems.

**Steps:**
1. Login to admin portal
2. Go to Inventory/Products section
3. Add each product:
   - Name: "Coca Cola 500ml"
   - Category: "Drinks"
   - Price: 399
   - Cost: 150
   - Quantity: 100
4. Products automatically appear in POS

---

## Method 2: API Endpoints (For Integration)

Use the NEW endpoints to create products/categories programmatically:

### Create a Category

```bash
curl -X POST http://localhost:3001/api/categories/create \
  -H "Content-Type: application/json" \
  -d '{"name": "Drinks"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Category created successfully",
  "category": {
    "_id": "507f1f77bcf86cd799439001",
    "name": "Drinks"
  }
}
```

### Create a Product

```bash
curl -X POST http://localhost:3001/api/products/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Coca Cola 500ml",
    "category": "Drinks",
    "costPrice": 150,
    "salePriceIncTax": 399,
    "quantity": 100,
    "description": "Refreshing cola beverage",
    "barcode": "12345678"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Product created successfully",
  "product": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Coca Cola 500ml",
    "category": "Drinks",
    "salePriceIncTax": 399
  }
}
```

### Required Fields

**For Categories:**
- `name` (string) - Category name

**For Products:**
- `name` (string) - Product name
- `category` (string) - Must match a category that exists
- `salePriceIncTax` (number) - Selling price including tax
- `quantity` (number, optional) - Stock quantity
- `costPrice` (number, optional) - Cost price
- `description` (string, optional) - Product description
- `barcode` (string, optional) - Product barcode

---

## Method 3: Bulk Import (CSV/JSON)

Create your own bulk import endpoint using the create endpoints above:

```javascript
// Example: Import from CSV
const csv = require('csv-parser');
const fs = require('fs');

fs.createReadStream('products.csv')
  .pipe(csv())
  .on('data', async (row) => {
    // POST to /api/products/create
    await fetch('http://localhost:3001/api/products/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: row.name,
        category: row.category,
        costPrice: row.cost,
        salePriceIncTax: row.price,
        quantity: row.stock,
      })
    });
  });
```

---

## Method 4: Direct MongoDB Insert

Connect to MongoDB directly and insert products:

```javascript
// In MongoDB Compass or mongosh
db.categories.insertMany([
  { name: "Drinks" },
  { name: "Food" },
  { name: "Bakery" }
]);

db.products.insertMany([
  {
    name: "Coca Cola 500ml",
    category: "Drinks",
    costPrice: 150,
    salePriceIncTax: 399,
    quantity: 100,
    description: "Cola beverage",
    barcode: "12345",
    taxRate: 5,
    margin: 249,
    minStock: 10,
    maxStock: 1000,
    images: []
  }
  // ... more products
]);
```

---

## Migration from Seed Data

### Step 1: Don't Call Seed Endpoint

⚠️ **IMPORTANT:** If you already called `/api/seed/test-data`, you now have test data in your database.

### Step 2: Clear Test Data (Optional)

```javascript
// In MongoDB Compass or mongosh
db.categories.deleteMany({ name: { $in: ["Bakery", "Drinks", "Food", "Hotel", "Wine"] } });
db.products.deleteMany({ category: { $in: ["Bakery", "Drinks", "Food", "Hotel", "Wine"] } });
```

### Step 3: Add Your Real Data

Use **Method 1, 2, 3, or 4** above to add your actual inventory.

### Step 4: Verify in POS

1. Start the app
2. Go to MENU tab
3. Categories should show your real data
4. Click category → products should show

---

## Checking Current Data

### In MongoDB Compass

1. Connect to your MongoDB instance
2. Open `SalesPOS` database
3. View `categories` collection - see all categories
4. View `products` collection - see all products

### Via API

**Get all categories:**
```bash
curl http://localhost:3001/api/categories
```

**Get products for "Drinks":**
```bash
curl "http://localhost:3001/api/products?category=Drinks"
```

### Via Browser Console

```javascript
// Get categories from IndexedDB
const categories = await getLocalCategories();
console.log("Categories:", categories);

// Get products for category
const products = await getLocalProductsByCategory("Drinks");
console.log("Products:", products);
```

---

## Live Data Flow (Diagram)

```
Your Inventory System
    ↓
    ├─ Option 1: Admin Portal
    ├─ Option 2: API POST /api/products/create
    ├─ Option 3: CSV/JSON bulk import
    └─ Option 4: Direct MongoDB
    ↓
MongoDB Database
(SalesPOS.categories collection)
(SalesPOS.products collection)
    ↓
POS App Requests
    ├─ GET /api/categories
    └─ GET /api/products?category=X
    ↓
IndexedDB Cache (Client)
    ↓
MenuScreen Display
(Shows your real products)
```

---

## Best Practices

### ✅ DO
- Add products via API or admin portal
- Use your actual inventory data
- Keep categories consistent
- Update inventory as stock changes
- Use real cost/price from your business

### ❌ DON'T
- Call `/api/seed/test-data` in production
- Hardcode product data in components
- Mix seed data with real data
- Use test data for actual sales
- Leave test data in database

---

## Setting Up Initial Inventory

### Create Categories First

```bash
# Create main categories
curl -X POST http://localhost:3001/api/categories/create \
  -H "Content-Type: application/json" \
  -d '{"name": "Electronics"}'

curl -X POST http://localhost:3001/api/categories/create \
  -H "Content-Type: application/json" \
  -d '{"name": "Groceries"}'

curl -X POST http://localhost:3001/api/categories/create \
  -H "Content-Type: application/json" \
  -d '{"name": "Beverages"}'
```

### Then Create Products

```bash
# Add products to "Beverages"
curl -X POST http://localhost:3001/api/products/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Coca Cola 500ml",
    "category": "Beverages",
    "costPrice": 150,
    "salePriceIncTax": 399,
    "quantity": 50,
    "barcode": "001"
  }'

curl -X POST http://localhost:3001/api/products/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fanta Orange 500ml",
    "category": "Beverages",
    "costPrice": 140,
    "salePriceIncTax": 379,
    "quantity": 40,
    "barcode": "002"
  }'
```

---

## Troubleshooting

### Q: Products not showing in POS?
```
A: 
1. Verify products exist in MongoDB
   → Check Compass or: db.products.find()
   
2. Make sure category name matches exactly
   → "Drinks" != "drinks"
   
3. Click "Sync Products" to refresh cache
   
4. Check console for errors (F12 → Console)
```

### Q: Getting "Category already exists" error?
```
A: Category already created. 
   Just add products to that category instead.
```

### Q: Want to update a product?
```
A: Currently need to delete and recreate.
   Consider adding PATCH /api/products/:id endpoint
```

### Q: How do I delete a product?
```
A: In MongoDB Compass:
   1. Select products collection
   2. Find the product
   3. Click delete
   
   Or via mongosh:
   db.products.deleteOne({ _id: ObjectId("...") })
```

---

## API Reference

### POST /api/categories/create
- Creates a new category
- Returns: `{ success, message, category }`
- Errors: 400 (missing name), 400 (duplicate)

### POST /api/products/create
- Creates a new product
- Returns: `{ success, message, product }`
- Errors: 400 (missing required), 400 (duplicate)

### GET /api/categories
- Fetches all categories
- Returns: `{ success, count, data }`
- No parameters needed

### GET /api/products
- Fetches all products (or filtered)
- Query params: `?category=Drinks`
- Returns: `{ success, count, data }`

---

## Next Steps

1. ✅ Create your categories via API
2. ✅ Create your products via API
3. ✅ Test in POS app
4. ✅ Verify data in MongoDB
5. ✅ Remove seed data endpoint (if needed)
6. ✅ Update inventory as stock changes

**Your POS system now uses your real inventory data!** 🎉
