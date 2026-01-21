# Offline & Sync - Quick Reference

## What Changed?

✅ **New Features:**
1. **Automatic Online/Offline Detection** - App knows when you lose internet
2. **Local Transaction Queue** - Transactions saved to device when offline
3. **Auto Sync** - Transactions automatically sent to server when online again
4. **Connection Indicator** - Header shows 🟢 Online / 🔴 Offline status
5. **Manual Sync Button** - Retry syncing offline transactions anytime

## Header Status Indicator

### Online (🟢 Green)
```
[🟢 Online]
```
- Transactions save immediately to database
- Everything works normally

### Offline (🔴 Red) with Pending Transactions
```
[🔴 Offline | [5] | ⟳]
         └─ Count of pending transactions
            └─ Manual sync button
```
- Transactions saved to device
- Click ⟳ to retry syncing
- Auto-syncs when connection restored

## User Journey

### Making a Transaction Offline
```
1. No internet connection
2. User completes payment
3. ✅ Payment confirmation shows (with 📴 Offline notice)
4. Transaction saved to device
5. Header shows: 🔴 Offline | [1]
6. Internet restored
7. Transaction auto-syncs ✅
8. Header shows: 🟢 Online
```

### Testing Offline Mode

**In Google Chrome:**
1. Press F12 (DevTools)
2. Go to Network tab
3. Check "Offline" checkbox
4. Make a transaction
5. Uncheck "Offline" checkbox
6. Watch it sync automatically

## Implementation Details

### Files Modified
- `src/hooks/useOnlineStatus.js` (NEW) - Offline/sync logic
- `src/components/layout/Header.js` - Connection status display
- `src/pages/index.js` - Payment handling for offline
- `src/components/payment/ConfirmationModal.js` - Offline notice

### LocalStorage Queue
```javascript
Key: "offlineTransactions"
Value: [
  {
    _id: "offline_timestamp_random",
    tenderType: "Cash",
    amountPaid: 50000,
    total: 48500,
    items: [...],
    // ... transaction data
  }
]
```

## Common Scenarios

### Scenario 1: User makes transaction while offline
1. User opens POS app (offline)
2. Selects products
3. Completes payment
4. **Result:** Transaction saved locally, confirmation shows offline notice

### Scenario 2: Connection restored
1. App detects internet connection
2. **Result:** All pending transactions auto-sync to server

### Scenario 3: User wants to sync manually
1. User clicks ⟳ button in header
2. **Result:** All offline transactions retry syncing immediately

### Scenario 4: Sync fails
1. User has pending transactions
2. Sync attempt fails (server down, timeout, etc.)
3. **Result:** Transactions stay in queue, can retry with manual sync button

## API Endpoint Used

- **POST /api/transactions**
  - Accepts transaction data
  - Saves to database
  - Returns saved transaction or error

No new endpoints needed - uses existing transaction API.

## Data Preserved

When offline, the system preserves:
- ✅ Product selection (items, quantities)
- ✅ Prices (sale prices, promotional prices)
- ✅ Payment details (amount, tender type, change)
- ✅ Staff information
- ✅ Location information
- ✅ Timestamp of transaction
- ✅ All transaction metadata

## Sync Process

```
Online Event Detected
       ↓
Get all transactions from localStorage
       ↓
For each transaction:
   ↓
   Send to /api/transactions
   ↓
   Success? → Remove from queue
   ↓
   Fail? → Keep in queue
       ↓
Show results to user
```

## Error Messages

**In Confirmation Modal (if offline):**
```
📴 Offline Mode - Transaction saved locally
This transaction will sync to the database when you're back online.
```

**In Header (if sync fails):**
```
[🔴 Offline | [3]]
          └─ 3 transactions pending
```

## Testing Checklist

- [ ] Make transaction online (should save immediately)
- [ ] Make transaction offline (should show offline notice)
- [ ] Go online (should auto-sync)
- [ ] Check header status indicator changes
- [ ] Click manual sync button when offline
- [ ] Verify transactions in database after sync
- [ ] Check localStorage for offline transactions
- [ ] Test with multiple offline transactions
- [ ] Test sync failure scenario
- [ ] Test page refresh while offline

## Performance Notes

- ✅ Non-blocking - sync happens in background
- ✅ No lag for user interactions
- ✅ Lightweight localStorage usage
- ✅ Efficient network requests
- ✅ No blocking while syncing

## Browser Support

✅ All modern browsers (Chrome, Firefox, Safari, Edge)
✅ Mobile browsers (iOS Safari, Android Chrome)
✅ Requires JavaScript enabled
✅ Requires localStorage available

## FAQ

**Q: Will I lose transactions if offline?**
A: No! Transactions are safely stored in browser's localStorage until synced.

**Q: How many transactions can I make offline?**
A: Limited only by device storage. Typically thousands of transactions.

**Q: Do I need to do anything to sync?**
A: No! System auto-syncs when online. You can also click the sync button.

**Q: What if sync fails?**
A: Transactions stay in queue. Click sync button to retry anytime.

**Q: Will offline transactions work on another device?**
A: No, they're stored locally on the device that made them.

**Q: Can I use the app while syncing?**
A: Yes! Sync happens in background, doesn't block UI.

## Next Steps

1. **Test offline mode** using Developer Tools
2. **Monitor the header** indicator during testing
3. **Check localStorage** to verify transactions saved
4. **Verify sync** by checking database after going online
5. **Train staff** on what offline mode means (they'll see it in header)
