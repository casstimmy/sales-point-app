# Offline Till Closing - Quick Reference

## One-Line Summary
Till closing now works offline with automatic cloud sync when reconnected.

## The 3-Step Flow

### 1. Offline (Network Down)
```
Staff → Close Till Modal → Enter Counts → saveTillCloseOffline()
              ↓
        IndexedDB Storage (synced: false)
              ↓
        Redirect to Login
```

### 2. Come Online (Network Restored)
```
Window 'online' event fires
         ↓
syncPendingTillCloses() in offlineSync.js
         ↓
Get all till_closes where synced: false
         ↓
POST each to /api/till/close
         ↓
Mark synced: true in IndexedDB
```

### 3. Server
```
/api/till/close endpoint
      ↓
Process till close (same as online)
      ↓
Update Till document
      ↓
Create EndOfDay report
      ↓
Return success
```

## Key Files

| File | What Changed |
|------|--------------|
| `src/lib/offlineSync.js` | Added syncPendingTillCloses() |
| `src/components/pos/CloseTillModal.js` | Already has offline support |
| `src/components/pos/MenuScreen.js` | Now syncs till closes on manual sync |
| `src/lib/indexedDB.js` | Added till_closes store |

## Code at a Glance

**offlineSync.js - Auto-sync when online:**
```javascript
window.addEventListener('online', () => {
  syncPendingTransactions().catch(...);
  syncPendingTillCloses().catch(...);  // ← NEW
});
```

**CloseTillModal.js - Save offline (already exists):**
```javascript
const saveTillCloseOffline = async (closeData) => {
  const request = indexedDB.open('SalesPOS', 1);
  // Store to till_closes with synced: false
};

if (isOnline) {
  // POST /api/till/close
} else {
  // saveTillCloseOffline()
}
```

**MenuScreen.js - Manual sync:**
```javascript
const handleManualSync = async () => {
  // ... sync categories and products ...
  if (getOnlineStatus()) {
    await syncPendingTransactions();
    await syncPendingTillCloses();  // ← NEW
  }
};
```

**indexedDB.js - Store definition:**
```javascript
if (!database.objectStoreNames.contains(STORES.TILL_CLOSES)) {
  const tillCloseStore = database.createObjectStore(
    STORES.TILL_CLOSES, 
    { keyPath: "_id" }
  );
  tillCloseStore.createIndex("synced", "synced");
}
```

## Console Messages to Look For

| Message | Meaning |
|---------|---------|
| `💾 Till close saved to IndexedDB` | Offline save succeeded |
| `🟢 Online - Syncing queued transactions and till closes` | Auto-sync started |
| `🔄 Syncing till close: [id]` | Syncing specific till close |
| `✅ Till close synced: [id]` | Sync successful |
| `✅ Till closes sync complete: X synced` | Batch sync finished |

## Testing in 3 Steps

### Step 1: Create Offline Till Close
```
1. DevTools → Network → Offline
2. Open till → Add transactions
3. Close till → Enter counts
4. See "OFFLINE" badge
5. Verify "💾 Till close saved to IndexedDB" in console
6. Check DevTools → Storage → IndexedDB → till_closes (synced: false)
```

### Step 2: Come Online
```
1. DevTools → Network → Online
2. See "🟢 Online - Syncing..." in console
3. See "✅ Till close synced..." in console
```

### Step 3: Verify Server
```
1. Check MongoDB for updated Till
2. Check for created EndOfDay report
3. Check IndexedDB till_closes (synced: true)
```

## IndexedDB Structure

**Store:** `till_closes`
**Key:** `_id` (Till ID)
**Data:**
```javascript
{
  _id: "till_id",
  staffId: "staff_id",
  locationId: "location_id",
  tenderCounts: { cash: 50000, card: 25000 },
  closingNotes: "Notes",
  summary: { expectedTotal: 75000, variance: 0 },
  synced: false,  // true after synced
  savedAt: Date,
  syncedAt: Date  // Set after sync
}
```

## Sync Triggers

**Automatic:**
- Window 'online' event (comes back online)

**Manual:**
- Click "Sync" button in MenuScreen

**Both Trigger:**
- syncPendingTransactions()
- syncPendingTillCloses()

## Common Scenarios

### Scenario 1: Close Till While Offline
✅ Works - Saved to IndexedDB with synced: false
✅ Auto-syncs when online
✅ No data loss

### Scenario 2: Close Multiple Tills Offline
✅ Works - Each stored separately
✅ All sync together when online
✅ No conflicts

### Scenario 3: Network Drops During Sync
✅ Handles gracefully - Error logged
✅ Retry on next online event
✅ No duplicate syncs

### Scenario 4: Staff Logs Out Without Closing
⚠️ Till remains open (same as online)
⚠️ Can be resumed with RESUME button

## API Endpoint

**POST /api/till/close**

Called from:
1. CloseTillModal online path (user action)
2. syncPendingTillCloses() (auto-sync)

Same payload both ways:
```javascript
{
  tillId: "string",
  tenderCounts: { id: amount, ... },
  closingNotes: "string",
  summary: { expectedTotal, variance, ... }
}
```

Response:
```javascript
{
  success: true,
  till: { ... },
  endOfDay: { ... }
}
```

## Debugging Checklist

- [ ] Is isOnline state updating? (Check CloseTillModal)
- [ ] Is till_closes store created? (Check IndexedDB initialization)
- [ ] Are console logs appearing? (Check browser console)
- [ ] Is data stored offline? (Check IndexedDB till_closes)
- [ ] Does sync trigger online? (Check console for sync logs)
- [ ] Does API receive data? (Check network tab + server logs)
- [ ] Are records marked synced? (Check IndexedDB syncedAt)

## Performance Notes

- Till closes stored locally → no app slowdown
- Sync happens in background → doesn't block UI
- Multiple till closes sync together → batch efficiency
- IndexedDB queries are fast → minimal latency

## Fallback Behavior

If anything fails:
1. Till close remains in IndexedDB
2. Queued for next sync attempt
3. Console logs the error
4. No data loss
5. Automatic retry when online

## Data Consistency

- IndexedDB is source of truth while offline
- Server is source of truth while online
- On sync: Local data overwrites server (intended)
- Timestamps tracked: savedAt, syncedAt
- Synced flag prevents duplicate processing

## Browser Support

Works on any browser with:
- IndexedDB support (all modern browsers)
- navigator.onLine API (all modern browsers)
- Promise API (all modern browsers)

## Security Considerations

- Till close data stored locally (device only)
- HTTPS required for API transmission
- No sensitive data exposed in logs
- Authentication handled by existing API auth
- Staff context cleared after closing till

## Future Improvements

- [ ] UI badge showing pending till close count
- [ ] Retry with exponential backoff
- [ ] Batch sync multiple till closes in one request
- [ ] Sync queue prioritization
- [ ] Offline sync status dashboard
- [ ] Sync progress indicator

---

**Version:** 1.0
**Status:** ✅ READY
**Last Updated:** 2024
