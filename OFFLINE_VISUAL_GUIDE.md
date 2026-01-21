# Offline & Sync - Visual Guide

## Header Status Display

### Online State (Normal Operation)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← | Store POS | Staff Name | 🟢 Online | ⋮ | 👥 | 🛒 | 🚪            │
│                            Location                                      │
│                            HH:MM:SS                                      │
│                            Shift: HH:MM | Sales: 45                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Status Badge:**
- 🟢 Green icon = Connected to internet
- Green text = "Online"
- Transactions save immediately to database
- No pending transactions

---

### Offline State (No Internet)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← | Store POS | Staff Name | 🔴 Offline | [5] | ⟳ | ⋮ | 👥 | 🛒 | 🚪 │
│                            Location                    ↑   ↑             │
│                            HH:MM:SS              Count  Sync             │
│                            Shift: HH:MM | Sales: 45                      │
└─────────────────────────────────────────────────────────────────────────┘

Count: Shows number of transactions waiting to sync
Sync Button: Manual sync button (spinning when active)
```

**Status Badge:**
- 🔴 Red icon = No internet connection
- Red text = "Offline"
- Transactions save to device locally
- [5] = 5 transactions pending sync
- ⟳ = Manual sync button (shows spinner when syncing)

---

## Transaction Flow Diagrams

### Scenario 1: Online Transaction
```
User Makes Transaction
          ↓
Check Online Status → ONLINE ✅
          ↓
Try to Send to API
          ↓
Success? YES ✅
          ↓
Save to Database
          ↓
Return Transaction ID
          ↓
Show Confirmation Modal
(NO offline notice)
          ↓
Transaction Complete ✅
```

### Scenario 2: Offline Transaction
```
User Makes Transaction
          ↓
Check Online Status → OFFLINE ❌
          ↓
Try to Send to API
          ↓
Fails/Timeout → Use Offline Mode ⚠️
          ↓
Generate Offline ID
_id: "offline_1234567_abc123"
          ↓
Save to localStorage
Queue: offlineTransactions
          ↓
Show Confirmation Modal
+ OFFLINE NOTICE
┌─────────────────────────┐
│ 📴 Offline Mode         │
│ Transaction saved       │
│ locally. Will sync when │
│ you're back online.     │
└─────────────────────────┘
          ↓
Transaction Queued ⏳
Header shows [1]
```

### Scenario 3: Auto Sync (Connection Restored)
```
User is Offline
Offline Transactions: [5]
Header: 🔴 Offline | [5]
          ↓
User Gets Internet Connection
          ↓
Browser Detects Online Event
          ↓
useOnlineStatus Hook Triggered
          ↓
Load Queue from localStorage
Found: 5 transactions
          ↓
For each transaction:
├─ POST to /api/transactions
├─ Success? Remove from queue
└─ Fail? Keep in queue
          ↓
All 5 synced successfully!
          ↓
Clear Queue
Update Header: 🟢 Online
          ↓
Show Console: "✅ All offline transactions synced successfully!"
```

### Scenario 4: Manual Sync
```
User Offline with Pending Transactions
Header: 🔴 Offline | [3] | ⟳
          ↓
User Clicks ⟳ (Sync Button)
          ↓
Spinner Starts: ⟳ (spinning)
          ↓
Attempt Sync All [3] Transactions
For each:
├─ POST to /api/transactions
├─ Transaction 1: ✅ Success
├─ Transaction 2: ✅ Success
└─ Transaction 3: ❌ Failed (keep in queue)
          ↓
Remove Successful (2)
Keep Failed (1)
          ↓
Spinner Stops: ⟳ (static)
Header: 🔴 Offline | [1]
          ↓
User can try again later
```

---

## Modal Displays

### Normal Confirmation (Online)
```
┌──────────────────────────────────────────┐
│       Payment Confirmed ✅               │
│                                          │
│  Tender Type:   Cash                     │
│  Total:         ₦48,500.00               │
│  Paid:          ₦50,000.00               │
│  Change:        ₦1,500.00                │
│                                          │
│  Thank you for your purchase 💙          │
│                                          │
│  [Print Receipt]  [Close]                │
└──────────────────────────────────────────┘
```

### Offline Confirmation (Offline)
```
┌──────────────────────────────────────────┐
│       Payment Confirmed ✅               │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 📴 Offline Mode                    │ │
│  │ Transaction saved locally          │ │
│  │ Will sync when you're back online  │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Tender Type:   Cash                     │
│  Total:         ₦48,500.00               │
│  Paid:          ₦50,000.00               │
│  Change:        ₦1,500.00                │
│                                          │
│  Thank you for your purchase 💙          │
│                                          │
│  [Print Receipt]  [Close]                │
└──────────────────────────────────────────┘
```

---

## LocalStorage Visualization

### While Online
```
Browser Storage
└── localStorage
    ├── staff: {...staff data...}
    ├── cartItems: [] (empty)
    └── offlineTransactions: [] (empty)
           ↑
      No transactions waiting
```

### While Offline (3 Transactions)
```
Browser Storage
└── localStorage
    ├── staff: {...staff data...}
    ├── cartItems: [] (empty)
    └── offlineTransactions: [
        {
          _id: "offline_1703123456789_abc1",
          isOfflineTransaction: true,
          tenderType: "Cash",
          amountPaid: 50000,
          total: 48500,
          items: [...],
          staff: "staff_123",
          location: "loc_456",
          createdAt: "2025-12-27T10:30:00Z",
          savedAt: "2025-12-27T10:30:05Z"
        },
        {
          _id: "offline_1703123466789_def2",
          ... (2nd transaction)
        },
        {
          _id: "offline_1703123476789_ghi3",
          ... (3rd transaction)
        }
      ]
      ↑
   Ready to sync
```

---

## Sync Status Timeline

### Hour-by-Hour Example

```
10:30 - Connection Lost
        User makes transaction
        ❌ API call fails
        → Saved to localStorage
        Header: 🔴 Offline | [1]

10:45 - User Makes More Transactions
        ❌ Still offline
        → 3 more saved locally
        Header: 🔴 Offline | [4]

11:15 - Connection Restored!
        ✅ Browser detects online
        → useOnlineStatus hook triggered
        → syncOfflineTransactions() called
        → [4] transactions sent to API
        → All succeed ✅
        Header: 🟢 Online
        Console: "✅ All offline transactions synced successfully!"

11:16 - Database Updated
        ✅ All 4 transactions now in database
        ✅ Sync complete
        ✅ No data loss
```

---

## Component Interaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         HomePage                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ useOnlineStatus()                                    │  │
│  │ → isOnline, offlineTransactions, syncing, manualSync│  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                ┌─────────┼──────────┐                       │
│                ↓         ↓          ↓                       │
│         ┌──────────┐ ┌───────┐ ┌────────────┐             │
│         │ Header   │ │PayMod │ │ConfirmMod │             │
│         │[Status]  │ │[Pays] │ │[Confirms] │             │
│         └──────────┘ └───────┘ └────────────┘             │
│              ↑                        ↑                     │
│              │                        └──────────┐          │
│              │ Display Status         Show Offline Notice   │
│              │ Show Sync Count        When Applicable       │
│              │ Manual Sync Button                           │
│              └──────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘

         ↓ localStorage ↓         ↓ API ↓
    
┌──────────────────────┐   ┌──────────────────┐
│   Browser Storage    │   │   Backend Server │
│ offlineTransactions  │   │   /api/trans     │
│    (Queue)           │   │   (Database)     │
└──────────────────────┘   └──────────────────┘
```

---

## Key Visual Indicators

### Header Status Indicators

```
State: ONLINE
┌─────────────────────────┐
│ 🟢 Online               │
│                         │
│ Color: Green            │
│ Icon: WiFi (✓)          │
│ Animation: Pulsing      │
│ Count: Hidden           │
│ Sync Button: Hidden     │
└─────────────────────────┘

State: OFFLINE (No Pending)
┌─────────────────────────┐
│ 🔴 Offline              │
│                         │
│ Color: Red              │
│ Icon: WiFi-off          │
│ Animation: Pulsing      │
│ Count: Hidden           │
│ Sync Button: Hidden     │
└─────────────────────────┘

State: OFFLINE (With Pending)
┌─────────────────────────┐
│ 🔴 Offline   [5]   ⟳    │
│                         │
│ Color: Red              │
│ Count: Visible (5)      │
│ Sync Button: Visible    │
│ Sync Animation: On Hover│
└─────────────────────────┘

State: SYNCING
┌─────────────────────────┐
│ 🔴 Offline   [5]   ⟳    │
│                              │
│              ↻ (spinning)    │
│ Sync Button: Animated        │
│ Disabled: Yes                │
└─────────────────────────────┘
```

---

## Success Indicators

✅ **Online Transaction**
- Transaction saves immediately
- Confirmation appears instantly
- Header shows 🟢 Online

✅ **Offline Transaction**
- Confirmation shows with 📴 notice
- Header shows 🔴 Offline | [count]
- Data saved to localStorage

✅ **Sync Complete**
- Header changes to 🟢 Online
- Count disappears
- Console shows success message
- Transactions in database

---

## Troubleshooting Visual Guide

```
Problem: Header shows 🔴 but I'm online
Solution: 
  1. Refresh page
  2. Check actual network connection
  3. Check browser's online API

Problem: Transactions not syncing
Solution:
  1. Check header status
  2. Click manual sync button (⟳)
  3. Check browser console for errors
  4. Verify server is accessible

Problem: Pending count wrong
Solution:
  1. Check localStorage directly
  2. Refresh page
  3. Clear offline queue if needed

Problem: Sync button not appearing
Solution:
  1. Need to be offline first
  2. Need pending transactions
  3. Try refreshing page
```

This guide provides clear visual representation of how the offline and sync system works!
