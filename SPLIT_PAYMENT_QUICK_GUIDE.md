# Split Payment Quick Reference

## 🎯 What is Split Payment?

One transaction can now be paid using multiple tender types:

```
Order: ₦5000
Payment:
  ₦3000 via CASH
  ₦2000 via TRANSFER
```

## 📦 Transaction Structure

### Before (Single Tender Only)
```javascript
{
  tenderType: "CASH",
  total: 5000,
  amountPaid: 5000
}
```

### After (Supports Both)
```javascript
// Option 1: Single Tender (unchanged)
{
  tenderType: "CASH",
  total: 5000,
  amountPaid: 5000
}

// Option 2: Split Payments (new)
{
  tenderPayments: [
    { tenderId: "...", tenderName: "CASH", amount: 3000 },
    { tenderId: "...", tenderName: "TRANSFER", amount: 2000 }
  ],
  total: 5000,
  amountPaid: 5000
}
```

## 🔄 How Till Reconciliation Works with Split Payments

```
Transaction 1: { tenderType: "CASH", total: 5000 }
Transaction 2: { tenderPayments: [{tenderName: "CASH", amount: 3000}, {tenderName: "TRANSFER", amount: 2000}] }

Aggregation Result:
  CASH: ₦8000 (5000 + 3000)
  TRANSFER: ₦2000

Reconciliation Modal Shows:
  ┌─────────────────────┬──────────┬──────────┐
  │ CASH                │ ₦8000    │ ₦8000    │ ✓ Perfect
  │ TRANSFER            │ ₦2000    │ ₦2000    │ ✓ Perfect
  └─────────────────────┴──────────┴──────────┘
```

## 💻 API Usage

### Creating a Transaction with Split Payment

```javascript
// Payload
{
  items: [...],
  total: 5000,
  tenderPayments: [
    { tenderId: "507f1f77bcf86cd799439011", tenderName: "CASH", amount: 3000 },
    { tenderId: "507f1f77bcf86cd799439012", tenderName: "TRANSFER", amount: 2000 }
  ],
  staffId: "...",
  tillId: "...",
  // ... other fields
}

// POST /api/transactions
// Transaction is saved with tenderPayments array
// Till's tenderBreakdown is updated with both amounts
```

### Till Reconciliation

```javascript
// GET /api/till/[tillId]

// Response includes tenderBreakdown:
{
  tenderBreakdown: {
    "CASH": 8000,      // From both single and split transactions
    "TRANSFER": 2000   // Only from split transactions
  }
}

// Reconciliation modal displays both tenders
```

## 🛠️ Component Integration

### PaymentModal
- User can enter amounts for multiple tenders
- Builds `tenderPayments` array on confirmation
- Maintains backwards compatibility with single-tender payments

### CartPanel
- Includes `tenderPayments` in transaction object
- Passes to API for saving

### CloseTillModal
- Shows all tenders (whether used in split or single payments)
- Allows physical count per tender
- Calculates variance correctly for split payments

## 🎯 Key Changes Summary

| Component | Change | Purpose |
|-----------|--------|---------|
| Transaction Model | Added `tenderPayments[]` | Store split payment details |
| `/api/transactions` | Accept both formats | Support legacy + split |
| Till APIs | New aggregation pipeline | Handle both payment types |
| PaymentModal | Build `tenderPayments[]` | Enable split payment input |
| CartPanel | Include `tenderPayments` | Pass to API |

## ✅ Backwards Compatibility

- ✓ Existing single-tender transactions work unchanged
- ✓ No database migration required
- ✓ Aggregation auto-detects payment format
- ✓ Till closing works identically
- ✓ Reconciliation works for both types

## 🧪 Testing a Split Payment

### Step 1: Create Order
```
Product: ₦5000
```

### Step 2: Open Payment Modal
- System shows CASH and TRANSFER tender options

### Step 3: Enter Split Payment
```
CASH: ₦3000
TRANSFER: ₦2000
Confirm
```

### Step 4: Verify Transaction
```
MongoDB Transaction:
  tenderPayments: [
    {tenderName: "CASH", amount: 3000},
    {tenderName: "TRANSFER", amount: 2000}
  ]
```

### Step 5: Close Till
```
Till reconciliation shows:
  CASH (Expected): ₦...
  CASH (Physical): [enter count]
  TRANSFER (Expected): ₦2000
  TRANSFER (Physical): [enter count]
```

## 📊 Example Till Reconciliation with Split Payments

```
Morning Till:
  Opening Balance: ₦10,000

Transactions:
  1. Order ₦5000 → CASH
  2. Order ₦6000 → CASH ₦3000 + TRANSFER ₦3000
  3. Order ₦4000 → TRANSFER

Till Breakdown (Expected):
  CASH: ₦8000 (5000 + 3000)
  TRANSFER: ₦7000 (3000 + 4000)

Staff Physical Count:
  CASH: ₦8000
  TRANSFER: ₦7000

Reconciliation:
  CASH:     Expected ₦8000  -  Physical ₦8000  = Variance ₦0    ✓ Perfect
  TRANSFER: Expected ₦7000  -  Physical ₦7000  = Variance ₦0    ✓ Perfect
```

---

**Ready to use!** Split payments are now fully integrated into the system.
