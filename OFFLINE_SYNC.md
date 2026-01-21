# Offline & Sync Functionality

## Overview
Your POS application now has full offline/online support with automatic sync capabilities. When the internet connection is lost, transactions are saved locally and automatically synced to the database when the connection is restored.

## Features Implemented

### 1. **Online/Offline Detection**
- Real-time monitoring of connection status using the `useOnlineStatus` hook
- Automatic detection of network changes
- Connection status indicator in the header

### 2. **Offline Transaction Queue**
- Transactions made while offline are stored in localStorage with unique IDs
- Each offline transaction includes:
  - Transaction details (items, total, payment method, etc.)
  - Timestamp of when it was created (`createdAt`)
  - Timestamp of when it was saved offline (`savedAt`)
  - Unique offline transaction ID
  - `isOfflineTransaction` flag for identification

### 3. **Automatic Sync**
- When connection is restored, all offline transactions are automatically sent to the server
- The sync process:
  1. Detects online status change
  2. Retrieves all queued transactions from localStorage
  3. Attempts to save each transaction to the database
  4. Removes successfully synced transactions
  5. Keeps failed transactions in the queue for retry

### 4. **Header Indicator**
Shows connection status in real-time:
- **🟢 Online (Green)** - Connected to internet, transactions sync immediately
- **🔴 Offline (Red)** - No internet connection, transactions saved locally
  - Displays count of pending offline transactions
  - Manual sync button to retry sending transactions

## File Structure

```
src/
├── hooks/
│   └── useOnlineStatus.js          # Custom hook for online/offline management
├── components/
│   ├── layout/
│   │   └── Header.js               # Updated with connection status indicator
│   ├── payment/
│   │   └── ConfirmationModal.js    # Shows offline notice if applicable
│   └── ...
└── pages/
    └── index.js                     # Updated payment handler for offline support
```

## How It Works

### Payment Flow (Online)
```
User clicks Pay
    ↓
System checks online status
    ↓
Online? → Send to API immediately
    ↓
Save to database
    ↓
Show confirmation (regular mode)
```

### Payment Flow (Offline)
```
User clicks Pay
    ↓
System checks online status
    ↓
Offline? → Save to localStorage
    ↓
Generate offline transaction ID
    ↓
Show confirmation (with offline notice)
    ↓
When online → Auto-sync to database
```

## Usage

### For Users
1. **Normal Usage (Online)**
   - Works exactly as before
   - Transactions saved immediately to database

2. **Offline Usage**
   - Transactions are saved locally
   - An offline notice appears in the confirmation modal
   - Count of pending transactions shows in header
   - System automatically syncs when back online

3. **Manual Sync**
   - Click the sync button (⟳) in header when offline transactions are pending
   - Retries sending all queued transactions

### For Developers

#### Using the `useOnlineStatus` Hook

```javascript
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';

function MyComponent() {
  const { 
    isOnline,                    // Boolean: current online status
    offlineTransactions,         // Array: pending offline transactions
    syncing,                     // Boolean: currently syncing
    manualSync,                  // Function: manually trigger sync
    syncOfflineTransactions      // Function: internal sync handler
  } = useOnlineStatus();

  return (
    <div>
      {isOnline ? '🟢 Online' : '🔴 Offline'}
      {offlineTransactions.length > 0 && (
        <button onClick={manualSync}>Sync {offlineTransactions.length} transactions</button>
      )}
    </div>
  );
}
```

## Local Storage Structure

### Offline Transactions
```javascript
// localStorage key: "offlineTransactions"
[
  {
    _id: "offline_1703123456789_abc123",
    isOfflineTransaction: true,
    tenderType: "Cash",
    amountPaid: 50000,
    total: 48500,
    change: 1500,
    items: [...],
    staff: "staff_id_123",
    location: "location_id_456",
    createdAt: "2025-12-27T10:30:00.000Z",
    savedAt: "2025-12-27T10:30:05.000Z"
  }
]
```

## Error Handling

### What happens if sync fails?
1. Transaction stays in the queue
2. Manual sync button remains available
3. User can retry when connection is more stable
4. Failed transactions are preserved in localStorage

### Data Integrity
- Each transaction is validated before sending
- Original transaction structure is preserved
- No data loss if sync fails

## Testing Offline Functionality

### How to Test
1. **Using Developer Tools**
   - Open DevTools (F12)
   - Go to Network tab
   - Check "Offline" checkbox
   - Make a transaction
   - Notice it's saved to localStorage
   - Uncheck "Offline"
   - Watch it auto-sync

2. **Disable Network Connection**
   - Disconnect from Wi-Fi
   - Or use browser's offline mode
   - Make transactions
   - Reconnect
   - Transactions auto-sync

3. **Check localStorage**
   - Open DevTools → Application tab
   - Navigate to localStorage
   - Look for "offlineTransactions" key
   - See all pending transactions

## Browser Compatibility

The offline functionality relies on:
- `navigator.onLine` API (widely supported)
- `window.addEventListener('online'/'offline')` (widely supported)
- `localStorage` API (widely supported)

**Supported Browsers:**
- Chrome 24+
- Firefox 3.5+
- Safari 4+
- Edge (all versions)
- Mobile browsers (iOS Safari 5+, Android 2.3+)

## Best Practices

1. **Always check `isOnline` before critical operations**
   ```javascript
   if (!isOnline && hasLargeTransaction) {
     // Show warning to user
   }
   ```

2. **Provide feedback to users**
   - Header indicator shows status clearly
   - Confirmation modal explains if offline
   - Manual sync option available

3. **Monitor sync status**
   - Use `syncing` flag to disable buttons during sync
   - Show progress to users for large batches

4. **Handle edge cases**
   - Network interrupted mid-transaction
   - Multiple offline transactions queuing
   - Connection restored while modal open

## Troubleshooting

### Transactions not syncing?
1. Check header indicator - is it online?
2. Click manual sync button
3. Check browser console for errors
4. Verify API endpoint is accessible

### Lost offline transactions?
- Check if localStorage was cleared
- Check browser's storage quota
- Verify transaction didn't sync already

### Stuck in offline mode?
- Refresh the page
- Check actual internet connection
- Try manual sync
- Clear cache and retry

## Future Enhancements

Potential improvements:
- [ ] Sync progress indicator (X of Y transactions synced)
- [ ] Retry with exponential backoff
- [ ] Batch sync optimization
- [ ] Compression for large transaction batches
- [ ] Sync status history
- [ ] Auto-sync scheduling
- [ ] Selective transaction retry
- [ ] Sync conflict resolution

## Related Files

- `src/hooks/useOnlineStatus.js` - Core offline/sync logic
- `src/components/layout/Header.js` - Connection status display
- `src/pages/index.js` - Payment handling with offline support
- `src/components/payment/ConfirmationModal.js` - Offline notice display
