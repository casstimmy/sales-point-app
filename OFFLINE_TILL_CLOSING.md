# Offline Till Closing Implementation

## Overview
Till closing (reconciliation) now works completely offline. When the network is unavailable, till reconciliation data is saved to IndexedDB and automatically synced to the server when the connection is restored.

## Architecture

### Data Flow

**ONLINE PATH:**
```
Staff clicks "Close Till" 
  → Validates tender counts
  → POST to /api/till/close
  → Server processes and creates EndOfDay report
  → Redirect to login
```

**OFFLINE PATH:**
```
Staff clicks "Close Till"
  → Validates tender counts
  → Saves to IndexedDB till_closes store with synced: false
  → Shows "OFFLINE" indicator
  → Redirect to login (same as online)
  → When reconnected: Auto-sync triggers
  → syncPendingTillCloses() POSTs to /api/till/close
  → Server processes (same as online)
  → IndexedDB till_closes marked synced: true
```

## Components Modified

### 1. CloseTillModal.js
**Location:** `src/components/pos/CloseTillModal.js`

**New Features:**
- `isOnline` state tracking with window 'online'/'offline' event listeners
- `saveTillCloseOffline()` function - saves till close data to IndexedDB
- `handleCloseTill()` has online/offline branching logic
- UI shows "OFFLINE" badge when disconnected
- Helpful message about data syncing when offline

**Offline Data Stored:**
```javascript
{
  _id: till._id,                    // Till ID (primary key)
  staffId: contextTill?.staffId,
  locationId: location?._id,
  tenderCounts: {...},              // Physical count per tender
  closingNotes: string,              // Staff notes
  summary: {...},                    // Summary data
  tenderBreakdown: {...},            // System calculated breakdown
  transactionCount: number,          // Transactions in this till
  openingBalance: number,
  totalSales: number,
  closedAt: ISO string,
  synced: false,                     // Flag for sync status
  savedAt: Date,                     // Local save timestamp
}
```

### 2. offlineSync.js
**Location:** `src/lib/offlineSync.js`

**New Functions:**

#### `syncPendingTillCloses()`
- Retrieves all till_closes with `synced: false` from IndexedDB
- POSTs each to `/api/till/close` endpoint
- Marks as `synced: true` after successful POST
- Handles errors gracefully (keeps in queue if sync fails)
- Logs detailed progress to console

#### `markTillCloseSynced(tillId)`
- Updates till_closes record in IndexedDB
- Sets `synced: true` and `syncedAt` timestamp
- Called after successful API sync

**Integration Points:**
- Auto-called in `initOfflineSync()` 'online' event listener
- Called from MenuScreen manual sync button
- Follows same pattern as `syncPendingTransactions()`

### 3. MenuScreen.js
**Location:** `src/components/pos/MenuScreen.js`

**Changes:**
- Added import of `syncPendingTillCloses` from offlineSync.js
- `handleManualSync()` now also calls:
  - `syncPendingTransactions()` when online
  - `syncPendingTillCloses()` when online
- Provides comprehensive sync of all pending data in one action

### 4. indexedDB.js
**Location:** `src/lib/indexedDB.js`

**Changes:**
- Added `TILL_CLOSES: "till_closes"` to STORES constant
- Created till_closes object store on IndexedDB upgrade:
  - Primary key: `_id` (till ID)
  - Indexes: `synced` (for quick lookup of pending), `closedAt` (for sorting)
  - Auto-increment: false (using till ID as key)

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              CLOSE TILL RECONCILIATION                       │
└─────────────────────────────────────────────────────────────┘

OFFLINE STATE
┌───────────────────────────────────────────────────────────┐
│ 1. Staff enters till reconciliation data                  │
│    - Physical tender counts                              │
│    - Closing notes                                       │
│                                                           │
│ 2. Modal detects isOnline = false                        │
│    - Shows "OFFLINE" badge                               │
│    - Explains data will sync when reconnected            │
│                                                           │
│ 3. saveTillCloseOffline() is called:                     │
│    - Opens IndexedDB 'SalesPOS' database                 │
│    - Gets till_closes object store                       │
│    - Stores complete reconciliation data                 │
│    - Sets synced: false                                  │
│    - Records savedAt timestamp                           │
│                                                           │
│ 4. Till context cleared, staff redirected to login      │
│    - User can open new till or logout                    │
└───────────────────────────────────────────────────────────┘
                          ↓
                  [DEVICE OFFLINE]
                  [NO NETWORK]
                          ↓
┌───────────────────────────────────────────────────────────┐
│ 5. Device comes back online (network restored)           │
│    - Window 'online' event fires                         │
│    - initOfflineSync() listener triggered                │
│    - Calls syncPendingTillCloses()                       │
│                                                           │
│ 6. syncPendingTillCloses() in offlineSync.js:           │
│    - Opens IndexedDB till_closes store                  │
│    - Filters records where synced = false               │
│    - For each pending till close:                       │
│      • GET data from IndexedDB                          │
│      • POST to /api/till/close                          │
│      • Wait for server response                         │
│      • Mark as synced: true in IndexedDB                │
│      • Log success to console                           │
│    - Return count of synced till closes                 │
│                                                           │
│ 7. Server processes till close:                         │
│    - Matches till by ID                                 │
│    - Updates Till document                              │
│    - Creates EndOfDay report                            │
│    - Returns updated till data                          │
│                                                           │
│ 8. Local IndexedDB updated:                             │
│    - till_closes record marked synced: true             │
│    - syncedAt timestamp recorded                        │
│    - Ready for next sync cycle                          │
└───────────────────────────────────────────────────────────┘
```

## Manual Sync
Staff can manually trigger sync from MenuScreen "Sync" button:
```
MenuScreen → handleManualSync()
  ↓
  ├─ fetch categories
  ├─ fetch products
  ├─ if online:
  │   ├─ syncPendingTransactions()
  │   └─ syncPendingTillCloses()
  └─ update UI with sync time
```

## Auto-Sync Flow
When device comes back online:
```
Window 'online' event
  ↓
initOfflineSync() listener
  ├─ Set isOnline = true
  ├─ syncPendingTransactions()
  └─ syncPendingTillCloses()
```

## Testing Checklist

### Offline Till Closing
- [ ] Open till and add transactions
- [ ] Toggle network off in DevTools
- [ ] Open Close Till modal
- [ ] Verify "OFFLINE" badge appears
- [ ] Enter physical counts for all tenders
- [ ] Click "Close Till"
- [ ] Verify success message (will sync when online)
- [ ] Check browser console for "Till close saved to IndexedDB" message
- [ ] Verify redirect to login page
- [ ] Open IndexedDB DevTools → till_closes store
- [ ] Verify record exists with `synced: false`

### Auto-Sync of Till Closes
- [ ] Ensure till close saved offline (from above)
- [ ] Toggle network on in DevTools
- [ ] Monitor browser console
- [ ] Verify "Online - Syncing queued transactions and till closes" appears
- [ ] Verify "Syncing till close: [till_id]" log
- [ ] Verify "Till close synced: [till_id]" success log
- [ ] Go to MongoDB and verify till is updated and EndOfDay created
- [ ] Check IndexedDB till_closes store
- [ ] Verify synced: true and syncedAt timestamp

### Manual Sync
- [ ] Create offline till close (from above)
- [ ] Toggle network on
- [ ] Go to MenuScreen
- [ ] Click "Sync" button
- [ ] Verify logs show till close sync
- [ ] Verify server updates
- [ ] Verify IndexedDB marked as synced

### Edge Cases
- [ ] Multiple offline till closes → all sync correctly
- [ ] Network drops during sync → retry on reconnect
- [ ] Invalid tender counts → error message, no offline save
- [ ] Till already closed → API rejects, logged to console
- [ ] Staff logout without closing → till remains open

## API Integration

### Endpoint: POST /api/till/close

**Request (from both online and offline sources):**
```javascript
{
  tillId: "string",                    // Till._id as string
  tenderCounts: {                      // Physical counts
    "tender_id": 5000,
    "tender_id": 2500,
    ...
  },
  closingNotes: "string",              // Optional notes
  summary: {                           // Summary data
    expectedTotal: 7500,
    variance: 500,
    variancePercent: 6.67,
    ...
  }
}
```

**Response:**
```javascript
{
  success: true,
  till: {...},                         // Updated till document
  endOfDay: {...}                      // Created EndOfDay report
}
```

**Processing:**
1. Find Till by ID
2. Verify not already closed
3. Update Till with tender counts and closing notes
4. Create EndOfDay report with reconciliation details
5. Return updated till

## Sync Status Tracking

### IndexedDB till_closes Store Structure
```
KEY: _id (till ID)
DATA:
  - _id: string (primary key)
  - staffId: string
  - locationId: string
  - tenderCounts: object
  - closingNotes: string
  - summary: object
  - tenderBreakdown: object
  - transactionCount: number
  - openingBalance: number
  - totalSales: number
  - closedAt: ISO string
  - synced: boolean (false = pending, true = synced)
  - savedAt: Date (when saved locally)
  - syncedAt: Date (when synced to server, optional)

INDEXES:
  - synced: For quick lookup of pending till closes
  - closedAt: For sorting/filtering by date
```

## Error Handling

### Offline Save Errors
- If IndexedDB fails, error logged to console
- User shown "Error saving offline" message
- Till remains open for retry

### Sync Errors
- If API fails during sync, error logged
- Till close stays in pending queue (synced: false)
- Retried on next sync attempt
- No data loss - stored in IndexedDB

### Network Status
- Monitored via `navigator.onLine` and window events
- UI shows "OFFLINE" badge in CloseTillModal
- No manual intervention required for sync

## Console Logging

### Offline Save
```
💾 Till close saved to IndexedDB: [till_id]
✅ Till close saved offline - will sync when online
📊 Till reconciliation saved locally for sync
```

### Online Sync
```
🟢 Online - Syncing queued transactions and till closes
🔄 Syncing till close: [till_id]
✅ Till close synced: [till_id]
✅ Till closes sync complete: 1 synced
```

### Manual Sync
```
🔄 Syncing pending transactions and till closes...
✅ Pending data synced
```

## Future Enhancements
1. Show count of pending till closes in UI
2. Show till close sync status per till
3. Batch multiple till closes in single sync request
4. Add retry logic with exponential backoff
5. UI dashboard showing sync status for all pending operations
