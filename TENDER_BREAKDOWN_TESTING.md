# Quick Testing Guide - Tender Breakdown System

## How to Test Expected Values Display

### Step 1: Open Till
1. Go to POS page
2. Click "Open Till"
3. Set opening balance (e.g., ₦10,000)
4. Till is now OPEN

### Step 2: Create Multiple Transactions with Different Tenders
Create 3 transactions like this:

**Transaction 1:**
- Items: Whole Wheat Bread (₦2,500)
- Tender: **CASH**
- Total: ₦2,500

**Transaction 2:**
- Items: Frozen Chicken (₦3,500) + Coke (₦3,350)
- Tender: **HYDROGEN POS**
- Total: ₦6,850

**Transaction 3:**
- Items: Any item totaling ₦5,000
- Tender: **ACCESS POS**
- Total: ₦5,000

### Step 3: Open Browser Console
Press `F12` and go to **Console** tab

### Step 4: Close Till
1. Click "Close Till" button
2. **Check console immediately** - you should see:

```
📋 Raw tender breakdown: {CASH: 2500, HYDROGEN_POS: 6850, ACCESS_POS: 5000}

   🏦 EXPECTED AMOUNTS BY TENDER:
      💳 CASH: ₦2,500.00
      💳 HYDROGEN POS: ₦6,850.00
      💳 ACCESS POS: ₦5,000.00

📊 ===== TILL SUMMARY FOR RECONCILIATION =====
   Opening Balance: ₦10,000.00
   Total Sales (stored): ₦14,350.00
   Expected Closing: ₦24,350.00
   Transaction Count: 3
   Linked Transactions Array: 3

💰 TENDER BREAKDOWN (3 types):
      💳 CASH: ₦2,500.00
      💳 HYDROGEN POS: ₦6,850.00
      💳 ACCESS POS: ₦5,000.00
```

### Step 5: Verify the Modal
In the **CloseTillModal reconciliation section:**

| Tender | Expected | Physical Count | Variance |
|--------|----------|-----------------|----------|
| CASH | ₦2,500.00 | _(enter value)_ | _(calculates)_ |
| HYDROGEN POS | ₦6,850.00 | _(enter value)_ | _(calculates)_ |
| ACCESS POS | ₦5,000.00 | _(enter value)_ | _(calculates)_ |

The **Expected** column should show the exact amounts from the console log.

## Troubleshooting

### ❌ Problem: Expected Values Showing ₦0

**Check #1: Console Logging**
- Open F12 Console
- Look for messages starting with `💰 TENDER BREAKDOWN BY AGGREGATION:`
- If you don't see tender amounts listed, the aggregation found no transactions

**Check #2: Transaction Count**
- Look for: `Linked Transactions Array: 0`
- If count is 0, transactions weren't linked to till
- **Fix:** Ensure transactions created AFTER till was opened

**Check #3: TenderType Field**
- In MongoDB, check if transaction has `tenderType` field
- If missing, that transaction won't be counted
- **Fix:** Verify tender is selected when creating transaction

**Check #4: MongoDB Console Output**
- Check server console (where Next.js is running)
- Look for: `💰 TENDER BREAKDOWN BY AGGREGATION:`
- If it says "Found 0 tender types", check aggregation pipeline
- Should show something like:
  ```
  💳 CASH: ₦2,500.00 (1 transaction)
  💳 HYDROGEN POS: ₦6,850.00 (1 transaction)
  ```

### ❌ Problem: Console Shows "Tender breakdown is empty"

**This means:**
- Till was found ✅
- But has no linked transactions ❌

**Solutions:**
1. Create transactions while till is OPEN
2. Don't switch staff or close browser until after creating transactions
3. Check that till._id is being passed correctly to payment API

### ✅ Expected Behavior After Fix

When you close till:
1. **Immediately in console** → See tender breakdown values
2. **In reconciliation modal** → See expected amounts for each tender
3. **No more ₦0 values** → All tenders show correct sums

## Test Scenarios

### Test 1: Single Tender Only
- Create 2 CASH transactions: ₦5,000 + ₦3,000
- Expected breakdown: `{ CASH: 8000 }`

### Test 2: Mixed Tenders
- 1x CASH ₦2,500
- 1x HYDROGEN POS ₦6,850
- 1x ACCESS POS ₦5,000
- Expected breakdown: `{ CASH: 2500, HYDROGEN_POS: 6850, ACCESS_POS: 5000 }`

### Test 3: Multiple Transactions Same Tender
- 3x CASH transactions
- Each ₦1,000 = ₦3,000 total
- Expected breakdown: `{ CASH: 3000 }`

### Test 4: Verify Aggregation
- Create 5 random transactions with mixed tenders
- In console, look for: "Found 2 tender types" (or however many you used)
- Verify total sales = sum of all transaction amounts
- Verify tender breakdown totals = total sales

## Quick Validation Checklist

✅ Till opens successfully  
✅ Tender selection appears in payment modal  
✅ Transactions save with tenderType field  
✅ Till closes without errors  
✅ CloseTillModal opens  
✅ Console shows tender breakdown values (not 0)  
✅ Expected column in modal shows amounts  
✅ Physical count input accepts values  
✅ Variance calculates automatically  

If all ✅, the system is working correctly!

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Expected shows ₦0 | No transactions linked | Create transactions while till OPEN |
| "Till not found" error | Wrong till ID format | Use till._id directly from context |
| Missing tenderType | Payment not recorded | Ensure PaymentModal saves tender |
| No transactions array | Till fetch failed | Check console for API errors |
| Aggregation times out | Too many transactions | Works fine with 1000+ transactions normally |

## Data Structure Check

In MongoDB, a transaction should look like:
```json
{
  "_id": ObjectId("..."),
  "tenderType": "HYDROGEN POS",
  "total": 9350,
  "amountPaid": 9350,
  "staff": ObjectId("..."),
  "location": "Main Store",
  "status": "completed",
  "tillId": ObjectId("..."),
  "items": [...],
  "createdAt": ISODate("2026-01-10T...")
}
```

Key fields for tender breakdown:
- ✅ `tenderType` - Must exist and not be null
- ✅ `total` - Must be > 0
- ✅ `_id` - Must be in till.transactions array
