# Receipt Printing System - Implementation Guide

## Overview

A complete receipt printing system that automatically generates and prints transaction receipts after payment completion. Receipts are branded with company logo, name, contact info, and custom messages.

## Features

✅ **Automatic Receipt Generation** - Generates receipt immediately after payment completes
✅ **Company Branding** - Includes logo, company name, address, phone, email, website
✅ **Transaction Details** - Date, time, staff name, transaction ID, till number
✅ **Item Breakdown** - Product name, quantity, price per unit, total per item
✅ **Payment Breakdown** - Shows each tender/payment method used (supports split payments)
✅ **Financial Summary** - Subtotal, tax, discount, final total, change
✅ **Custom Messages** - Configurable thank you message and refund policy
✅ **QR Code Support** - Optional QR code with description text
✅ **Thermal Printer Optimized** - Designed for 58mm thermal receipt printers
✅ **Print Dialog** - Uses browser's native print dialog for flexibility
✅ **Offline Support** - Works even if settings fetch fails (uses defaults)

## Architecture

### 1. **Receipt Printing Utility** (`src/lib/receiptPrinting.js`)
Main utility functions for receipt handling:

```javascript
// Get receipt settings from API
const settings = await getReceiptSettings();

// Print receipt automatically
await printTransactionReceipt(transaction, receiptSettings);
```

**Functions:**
- `getReceiptSettings()` - Fetches receipt configuration from API
- `printTransactionReceipt(transaction, settings)` - Generates and prints receipt
- `generateReceiptHTML(transaction, settings)` - Creates HTML for printing

### 2. **Receipt Settings API** (`src/pages/api/receipt-settings.js`)
REST API endpoint to fetch receipt configuration:

```
GET /api/receipt-settings
```

Returns:
```json
{
  "success": true,
  "settings": {
    "companyDisplayName": "St's Michael Hub",
    "companyLogo": "/images/logo.png",
    "storePhone": "234-123-4567",
    "email": "info@company.com",
    "website": "www.company.com",
    "taxNumber": "12345678",
    "refundDays": 7,
    "receiptMessage": "Thank you for shopping with us!",
    "qrUrl": "https://google.com/reviews",
    "qrDescription": "Scan and leave us a review",
    "paymentStatus": "paid",
    "fontSize": "10.0"
  }
}
```

### 3. **CartPanel Integration** (`src/components/pos/CartPanel.js`)
Integrated into payment completion flow:

```javascript
// After payment confirmation
const receiptSettings = await getReceiptSettings();
const receiptTransaction = {
  ...transaction,
  _id: transaction._id || Date.now().toString(),
};

// Print receipt asynchronously
printTransactionReceipt(receiptTransaction, receiptSettings)
  .catch(err => console.warn('Receipt printing failed:', err));
```

### 4. **Receipt Printer Component** (`src/components/pos/ReceiptPrinter.js`)
React component for rendering receipt (optional, for custom implementations):

```jsx
<ReceiptPrinter 
  transaction={transaction}
  receiptSettings={settings}
  onPrint={() => console.log('Printed!')}
  isVisible={true}
/>
```

## Receipt Settings Configuration

Receipt settings are stored in the **Store** MongoDB document and include:

| Field | Type | Description |
|-------|------|-------------|
| `companyDisplayName` | String | Company/store name displayed on receipt |
| `companyLogo` | String | URL to company logo image |
| `storePhone` | String | Store phone number |
| `email` | String | Store email address |
| `website` | String | Store website URL |
| `taxNumber` | String | Tax ID or VAT number |
| `refundDays` | Number | Days allowed for refunds |
| `receiptMessage` | String | Custom message/thank you note |
| `qrUrl` | String | URL encoded in QR code |
| `qrDescription` | String | Text above QR code |
| `paymentStatus` | String | "paid" or "unpaid" |
| `fontSize` | String | Font size for receipt (8.0, 9.0, 10.0) |

## Data Flow

```
Payment Completion
       ↓
handlePaymentConfirm() in CartPanel
       ↓
Create transaction object
       ↓
Save to IndexedDB (offline-first)
       ↓
getReceiptSettings() API call
       ↓
printTransactionReceipt()
       ↓
generateReceiptHTML() creates HTML
       ↓
Opens print dialog with formatted receipt
       ↓
Browser native print → printer
```

## Transaction Data Used in Receipt

The receipt displays:

```javascript
{
  items: [
    {
      name: "Product Name",
      quantity: 2,
      price: 1500  // Price per unit
    }
  ],
  total: 3000,           // Final total with tax and discount
  subtotal: 2857,        // Before tax
  tax: 143,              // Tax amount
  discount: 0,           // Discount amount
  change: 500,           // Change from payment
  staffName: "John Doe",
  location: "Main Counter",
  createdAt: "2025-01-10T10:30:00Z",
  tenderPayments: [
    { tenderName: "CASH", amount: 2000 },
    { tenderName: "TRANSFER", amount: 1000 }
  ],
  _id: "5f7a8b9c0d1e2f3g4h5i6j7k"
}
```

## Receipt Layout (58mm Thermal Printer)

```
        ╔═══════════════════════════════════════╗
        ║                                       ║
        ║            [COMPANY LOGO]            ║
        ║      ST'S MICHAEL HUB                ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║  Main Counter                        ║
        ║  Tel: 234-123-4567                  ║
        ║  Email: info@company.com            ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║                                       ║
        ║  Receipt of Purchase (Inc Tax)      ║
        ║  2025-01-10 10:30:45                ║
        ║  Staff: John Doe          Till #1   ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║  PRODUCT          QTY        PRICE  ║
        ║  Item 1            1    ₦1,500.00  ║
        ║  Item 2            2    ₦3,000.00  ║
        ║  ___________Total: 3 Items_______  ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║  Subtotal:             ₦4,285.71  ║
        ║  Tax:                    ₦214.29  ║
        ║╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┃
        ║  TOTAL:             ₦4,500.00     ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║                                       ║
        ║  PAYMENT BY TENDER                  ║
        ║  CASH              ₦3,500.00       ║
        ║  TRANSFER          ₦1,000.00       ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║                                       ║
        ║  CHANGE:              ₦500.00      ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║                                       ║
        ║           🙏 THANK YOU! 🙏         ║
        ║                                       ║
        ║      Thank you for shopping with    ║
        ║              us!                    ║
        ║                                       ║
        ║           ┌─────────────┐           ║
        ║           │             │           ║
        ║           │   [QR CODE] │           ║
        ║           │             │           ║
        ║           └─────────────┘           ║
        ║     Scan and leave us a review     ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║                                       ║
        ║              ╔════════════╗         ║
        ║              ║    PAID    ║         ║
        ║              ╚════════════╝         ║
        ║                                       ║
        ║  Refund within 7 days with receipt ║
        ║                                       ║
        ║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        ║                                       ║
        ║   Thank you for shopping with us!   ║
        ║                                       ║
        ╚═══════════════════════════════════════╝
```

## Payment Methods Display

The receipt automatically detects split payments:

**Single Tender (Legacy):**
```
PAYMENT BY TENDER
CASH                    ₦5,000.00
```

**Split Payments (New):**
```
PAYMENT BY TENDER
CASH                    ₦3,000.00
TRANSFER                ₦2,000.00
```

Both formats handled automatically!

## Setup & Configuration

### 1. **Add Receipt Settings to Store Setup**

When creating/updating store in `/api/setup/setup`:

```javascript
const store = await Store.create({
  storeName: "St's Michael Hub",
  storePhone: "234-123-4567",
  email: "info@company.com",
  website: "www.company.com",
  taxNumber: "12345678",
  companyDisplayName: "St's Michael Hub",
  refundDays: 7,
  receiptMessage: "Thank you for shopping with us!",
  qrUrl: "https://google.com/reviews",
  qrDescription: "Scan and leave us a review",
  paymentStatus: "paid",
  fontSize: "10.0",
  logo: "/images/logo.png"
});
```

### 2. **Update Store Model**

Ensure Store model has these fields:
```javascript
companyDisplayName: String,
logo: String,
email: String,
website: String,
taxNumber: String,
refundDays: Number,
receiptMessage: String,
qrUrl: String,
qrDescription: String,
paymentStatus: String,
fontSize: String
```

### 3. **Place Company Logo**

Add logo to: `public/images/logo.png`

Supported formats: JPG, PNG
Recommended size: 256x256 pixels max

## Testing the System

### Test 1: Single Tender Receipt
1. Add items to cart
2. Click PAY
3. Pay entire amount with CASH
4. Receipt should print with:
   - All items listed
   - Correct totals
   - CASH as single payment method
   - Thank you message
   - Company branding

### Test 2: Split Payment Receipt
1. Add items to cart
2. Click PAY
3. Pay ₦2000 with CASH, ₦3000 with TRANSFER
4. Receipt should print with:
   - Both tenders listed separately
   - Correct breakdown
   - Change (if any)

### Test 3: Receipt Settings
1. Visit Receipt Settings page
2. Update company name, logo, message
3. Complete a transaction
4. Verify receipt reflects new settings

### Test 4: No Settings Fallback
1. Disable API temporarily
2. Complete transaction
3. Receipt should still print with default settings

## Customization

### Change Receipt Message
```javascript
// In Store setup/update
receiptMessage: `Thank you for shopping with us!

Opening Hours: 9AM - 9PM
Saturday: 10AM - 8PM
Sunday: Closed

Visit us at: www.company.com`
```

### Add Custom Footer
Modify `generateReceiptHTML()` in `receiptPrinting.js` to add custom text/styling.

### Change Thermal Printer Width
Default is 58mm. For 80mm printers:
```css
body { width: 80mm; }  /* Change from 58mm */
```

### Disable QR Code
Set `qrUrl` to empty string in Store settings.

## Troubleshooting

### Receipt Not Printing
- Check browser's print dialog appears
- Verify printer is connected and online
- Check console for errors: `console.log()`
- Ensure logo URL is accessible

### Settings Not Loading
- Check `/api/receipt-settings` returns data
- Verify Store document has receipt settings
- Check browser network tab for API errors

### Logo Not Showing
- Verify image URL: `public/images/logo.png`
- Ensure image format is JPG or PNG
- Check file is less than 1MB
- Try absolute URL: `https://domain.com/images/logo.png`

### Receipt Text Too Small/Large
- Adjust `fontSize` in Store settings (8.0, 9.0, 10.0)
- Or modify `font-size` in receipt CSS

## Browser Compatibility

✅ Chrome/Chromium
✅ Firefox
✅ Safari
✅ Edge
❌ Internet Explorer (not supported)

## Performance Notes

- Receipt printing is **asynchronous** - doesn't block transaction completion
- If print dialog takes time, customer can continue with next transaction
- Receipt HTML is generated on-the-fly (not pre-rendered)
- Settings cached in memory after first fetch

## Files Created/Modified

| File | Type | Purpose |
|------|------|---------|
| `src/lib/receiptPrinting.js` | NEW | Receipt generation & printing utilities |
| `src/pages/api/receipt-settings.js` | NEW | API endpoint for settings |
| `src/components/pos/ReceiptPrinter.js` | NEW | Receipt component (optional) |
| `src/components/pos/CartPanel.js` | MODIFIED | Integrated receipt printing |

## Security Considerations

- Receipt settings fetched via API (not hardcoded)
- Settings stored in MongoDB (not exposed to frontend)
- No sensitive data in receipts
- Print dialog uses browser native security
- Supports both online and offline modes

## Future Enhancements

🔄 Email receipt to customer
📊 Receipt reprint from transaction history
🎨 Multiple receipt templates
🌐 Multi-language support
💾 Receipt archival/history
📱 Mobile receipt generation
🔄 Auto-print without dialog (ESC POS driver)
