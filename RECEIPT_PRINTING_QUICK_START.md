# Receipt Printing System - Quick Start

## What Was Implemented

✅ **Automatic Receipt Generation** - Prints immediately after payment
✅ **Company Branding** - Logo, name, contact info, custom messages  
✅ **Split Payment Support** - Works with multiple tenders
✅ **Thermal Printer Optimized** - 58mm width (adjustable)
✅ **Browser Native Printing** - Uses print dialog for flexibility

## Files Added

1. **`src/lib/receiptPrinting.js`** - Receipt generation & printing utilities
2. **`src/pages/api/receipt-settings.js`** - API endpoint to fetch settings
3. **`src/components/pos/ReceiptPrinter.js`** - Receipt component (for reference)
4. **`RECEIPT_PRINTING_SYSTEM.md`** - Full documentation

## Files Modified

- **`src/components/pos/CartPanel.js`** - Added receipt printing after payment

## What Happens When Payment Completes

```
1. Transaction created and saved to IndexedDB
2. Cart cleared
3. Receipt settings fetched from API
4. Receipt HTML generated with transaction data
5. Browser print dialog opens
6. User clicks Print → sent to printer
7. Transaction synced to cloud (if online)
```

## Receipt Settings API

**Endpoint:** `GET /api/receipt-settings`

**Returns:**
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
    "qrUrl": "https://example.com/reviews",
    "qrDescription": "Scan and leave a review",
    "paymentStatus": "paid"
  }
}
```

## Store Settings That Feed Receipt

The Store MongoDB document should have:

```javascript
{
  _id: ObjectId,
  storeName: "St's Michael Hub",
  storePhone: "234-123-4567",
  email: "info@company.com",
  website: "www.company.com",
  taxNumber: "12345678",
  companyDisplayName: "St's Michael Hub",
  logo: "/images/logo.png",
  refundDays: 7,
  receiptMessage: "Thank you for shopping with us!",
  qrUrl: "https://example.com/reviews",
  qrDescription: "Scan and leave us a review",
  paymentStatus: "paid",
  fontSize: "10.0"
}
```

## How to Configure Receipt Settings

### Option 1: Via Existing Setup Page
Update `/pages/api/setup/setup` to save these fields to Store:

```javascript
const store = await Store.findOneAndUpdate(
  {},
  {
    companyDisplayName: req.body.companyDisplayName,
    logo: req.body.logo,
    email: req.body.email,
    website: req.body.website,
    taxNumber: req.body.taxNumber,
    refundDays: req.body.refundDays,
    receiptMessage: req.body.receiptMessage,
    qrUrl: req.body.qrUrl,
    qrDescription: req.body.qrDescription,
    paymentStatus: req.body.paymentStatus,
    fontSize: req.body.fontSize
  },
  { new: true }
);
```

### Option 2: Manual Database Update
```javascript
db.stores.updateOne(
  {},
  {
    $set: {
      companyDisplayName: "St's Michael Hub",
      logo: "/images/logo.png",
      email: "info@company.com",
      website: "www.company.com",
      taxNumber: "12345678",
      refundDays: 7,
      receiptMessage: "Thank you for shopping with us!",
      qrUrl: "https://example.com",
      qrDescription: "Scan and leave feedback",
      paymentStatus: "paid",
      fontSize: "10.0"
    }
  }
);
```

## Place Company Logo

1. Save logo file to: `public/images/logo.png`
2. Supported formats: JPG, PNG
3. Recommended: 256x256px, under 100KB
4. Will be grayscaled on receipt automatically

## Receipt Elements

### Header
- Company logo (grayscaled)
- Company display name
- Location name (from transaction)
- Phone, email, website
- Tax ID

### Transaction Details
- Date and time
- Transaction ID (first 8 chars)
- Staff name
- Till number

### Items Section
- Product name
- Quantity
- Total price per item
- Item count summary

### Totals Section
- Subtotal
- Tax
- Discount (if any)
- **FINAL TOTAL** (bold)

### Payment Section
- Tender name (CASH, TRANSFER, CARD, etc.)
- Amount paid per tender
- Change (if applicable)

### Footer
- Thank you message (configurable)
- QR code (if enabled)
- Refund policy
- Payment status (PAID/UNPAID)

## Testing

### Test 1: Basic Receipt
1. Add items to cart
2. Click PAY
3. Enter amount in CASH
4. Click Confirm
5. Receipt should print with correct details

### Test 2: Split Payment
1. Add items (total ₦5,000)
2. Click PAY
3. Enter ₦3,000 CASH + ₦2,000 TRANSFER
4. Receipt shows both tenders

### Test 3: Custom Settings
1. Update Store document with new company name
2. Complete transaction
3. Receipt shows new company name

## Customization Examples

### Larger Receipt Font
In Store settings, set `fontSize: "12.0"` (default is 10.0)

### No QR Code
Leave `qrUrl` empty string or null

### Custom Thank You Message
```
receiptMessage: "Thank you for your business!

We appreciate your support.
Visit us again soon!

Opening Hours:
Mon-Sat: 9AM - 9PM
Sunday: 10AM - 8PM"
```

### Disable Refund Info
Set `refundDays: 0`

## Troubleshooting

### "Receipt printing failed"
- Check browser console for errors
- Verify `/api/receipt-settings` endpoint exists
- Ensure Store document has settings
- Check logo URL is accessible

### Receipt doesn't show company info
- Verify Store document has `companyDisplayName`
- Confirm settings are saved to database
- Check API response in Network tab

### Logo not printing
- Verify file at `public/images/logo.png`
- Check image is JPG or PNG
- Try refreshing page
- Check browser console for image load errors

### Print dialog doesn't open
- Check browser allows popups
- Verify printer is connected
- Try in Chrome instead (best support)

## Code Examples

### Manual Receipt Printing (Advanced)
```javascript
import { printTransactionReceipt, getReceiptSettings } from '@/lib/receiptPrinting';

// Fetch settings
const settings = await getReceiptSettings();

// Print receipt
await printTransactionReceipt(transaction, settings);
```

### Fetch Receipt Settings Only
```javascript
import { getReceiptSettings } from '@/lib/receiptPrinting';

const settings = await getReceiptSettings();
console.log(settings.companyDisplayName); // "St's Michael Hub"
```

## Browser Support

✅ Chrome/Chromium (best)
✅ Firefox
✅ Safari
✅ Edge
❌ Internet Explorer

## Performance

- Receipts print asynchronously (non-blocking)
- Settings cached after first fetch
- HTML generated on-the-fly
- No additional libraries required

## Storage

Receipt settings are stored in Store MongoDB document. They can also be cached in localStorage for offline access.

## Next Steps

1. ✅ Configure your Store document with receipt settings
2. ✅ Place logo at `public/images/logo.png`
3. ✅ Test with a transaction
4. ✅ Verify receipt prints correctly
5. ✅ Customize message and settings as needed

## Support

For issues with receipt printing:
1. Check browser console for errors
2. Verify API endpoint working: `GET /api/receipt-settings`
3. Ensure Store settings are saved
4. Check printer connectivity
