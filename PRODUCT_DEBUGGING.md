## Product Population Debugging Guide

### Steps to Fix & Test:

#### 1. **Start the Development Server**
```bash
npm run dev
```
Wait for it to show "ready - started server on 0.0.0.0:3000"

#### 2. **Seed Test Data**
Open a browser and go to:
```
http://localhost:3000/api/seed/test-data?token=dev-seed-key-123
```

You should see:
```json
{
  "success": true,
  "message": "Test data seeded successfully",
  "categoriesCreated": 8,
  "productsCreated": 10,
  ...
}
```

**Check server logs** - should show:
```
🌱 Seeding test data...
✅ Debug: Connected to MongoDB
🌱 Creating test categories...
✅ Created 8 categories
🌱 Creating test products...
✅ Created 10 products
```

#### 3. **Verify Categories Are Loaded**
Go to:
```
http://localhost:3000/api/categories
```

Should return something like:
```json
{
  "success": true,
  "count": 8,
  "data": [
    { "_id": "...", "name": "Bakery" },
    { "_id": "...", "name": "Beverages" }
  ]
}
```

**Check server logs** - should show:
```
📦 Categories API: Connecting to MongoDB...
✅ Categories API: Connected to MongoDB
📦 Categories API: Querying all categories...
✅ Categories API: Found 8 categories
✅ Categories API: Categories: [...]
```

#### 4. **Test Product Fetching by Category**
Try fetching products for "Bakery":
```
http://localhost:3000/api/products?category=Bakery
```

Should return products in that category:
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "...",
      "name": "Whole Wheat Bread",
      "category": "Bakery",
      "salePriceIncTax": 750,
      "quantity": 30,
      "images": []
    }
  ]
}
```

**Check server logs** - should show:
```
🛍️ Products API: Connecting to MongoDB...
✅ Products API: Connected to MongoDB
🛍️ Products API: Query params - category: Bakery search: undefined
🛍️ Products API: Filtering by category: Bakery
🛍️ Products API: MongoDB query object: {"category":"Bakery"}
✅ Products API: Found 1 products for query: {"category":"Bakery"}
```

#### 5. **Check in the POS App**
1. Go to `http://localhost:3000`
2. Login with test credentials
3. Categories should load immediately in MenuScreen
4. Click on a category (e.g., "Bakery")
5. Products should appear below

**Check browser DevTools Console** (F12) - should show:
```
📦 Fetching categories...
📦 Categories response status: 200
📦 Categories data: {success: true, count: 8, data: [...]}
🛍️ Fetching products for category: Bakery
🛍️ Request URL: /api/products?category=Bakery
🛍️ Products response status: 200
🛍️ Products data: {success: true, count: 1, data: [...]}
```

---

### Common Issues & Fixes:

#### Issue: "No products in this category"
- **Cause**: Database has no data
- **Fix**: Run the seed endpoint (step 2 above)

#### Issue: Categories load but products don't
- **Cause**: API connection error or category name mismatch
- **Fix**: 
  - Check server logs for API errors
  - Verify category names match exactly (case-sensitive)
  - Go to `/api/debug/categories` and `/api/debug/products` to check raw data

#### Issue: "Loading products..." spinner doesn't go away
- **Cause**: API request hanging or timing out
- **Fix**:
  - Check server is running (`npm run dev`)
  - Check MongoDB connection in server logs
  - Check browser Network tab (F12) for failed requests

#### Issue: API returns 404
- **Cause**: Next.js dev server not running or API not compiled
- **Fix**:
  - Stop dev server (Ctrl+C)
  - Start again: `npm run dev`
  - Wait for "ready" message
  - Try again

---

### Debugging Checklist:

- [ ] Dev server running (`npm run dev`)
- [ ] Test data seeded (see 8 categories, 10 products in response)
- [ ] `/api/categories` returns data
- [ ] `/api/products?category=Bakery` returns data
- [ ] Browser console shows 📦 and 🛍️ logs
- [ ] Server logs show database connection messages
- [ ] Clicking category in POS shows products

---

### API Response Formats:

#### Categories Response
```javascript
{
  "success": true,
  "count": 8,
  "data": [
    { "_id": "ObjectId", "name": "Category Name" }
  ]
}
```

#### Products Response
```javascript
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "ObjectId",
      "name": "Product Name",
      "category": "Category Name",
      "salePriceIncTax": 1000,
      "quantity": 50,
      "images": []
    }
  ]
}
```

---

### Files with Enhanced Logging:

- ✅ `src/pages/api/categories/index.js` - Now logs all steps
- ✅ `src/pages/api/products/index.js` - Now logs all steps including query
- ✅ `src/components/pos/MenuScreen.js` - Already has emoji logging

