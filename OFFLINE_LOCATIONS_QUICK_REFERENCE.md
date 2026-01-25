# 📍 Offline Location Storage - Quick Reference

## For Staff Members

### Login Offline
1. Open the login page
2. If internet is down, you'll see **"Offline mode"** banner at top
3. **Location dropdown will show cached locations** (last synced on previous online session)
4. Select your location
5. Select your name from staff list
6. Enter your 4-digit PIN
7. Click **SIGN IN**
   - **Note**: In offline mode, PIN validation is skipped for security reasons
   - You're responsible for PIN security
8. Select or open a till
9. You can now work offline!

### Key Indicators
- **Red banner with X icon** = System is offline
- **Location dropdown populated** = Cached location data available
- **⚠️ Running in OFFLINE mode** in console = PIN validation disabled

---

## For Developers

### Import and Use Utility Functions

```javascript
import { 
  cacheLocationsOffline,
  getCachedLocationsOffline,
  isLocationAvailableOffline,
  getLocationOffline,
  getOfflineLocationSyncStatus,
  logOfflineLocationDebugInfo
} from '@/src/lib/offlineLocationStorage';

// Get all cached locations
const allLocations = getCachedLocationsOffline();

// Check if specific location is available
if (isLocationAvailableOffline('loc_123')) {
  const location = getLocationOffline('loc_123');
  console.log(`Location: ${location.name}`);
}

// Get sync status for UI
const status = getOfflineLocationSyncStatus();
console.log(status.message); // "2 locations cached for offline (last synced: ...)"

// Debug offline data
logOfflineLocationDebugInfo();
```

### Use StaffContext

```javascript
import { useStaff } from '@/src/context/StaffContext';

export default function MyComponent() {
  const { locations, getCachedLocations, setCachedLocations } = useStaff();
  
  // locations array is auto-loaded from cache on hydration
  // You can also programmatically cache locations:
  const handleSync = (fetchedLocations) => {
    setCachedLocations(fetchedLocations);
  };

  return (
    <div>
      <p>Available locations: {locations.length}</p>
      {locations.map(loc => (
        <div key={loc._id}>{loc.name}</div>
      ))}
    </div>
  );
}
```

---

## Data Flow

### Online Login (with Caching)
```
User Opens Login
    ↓
Fetch Locations from API (/api/store/init-locations)
    ↓
Display in Dropdown ← Locations UI
    ↓
Cache to localStorage (cachedLocations + metadata) ← [OFFLINE ACCESS]
    ↓
User Selects Location & Staff
    ↓
PIN Validation Against Server
    ↓
Login Success → Navigate to POS
```

### Offline Login (Using Cache)
```
User Opens Login (No Internet)
    ↓
Detect Offline Status
    ↓
Load from localStorage (cachedLocations) ← [FROM CACHE]
    ↓
Display in Dropdown ← Locations UI
    ↓
User Selects Location & Staff
    ↓
Skip PIN Validation (Offline)
    ↓
Login Success → Navigate to POS
```

---

## localStorage Keys Reference

### `cachedLocations`
- **Type**: JSON Array
- **Updated**: Every time locations are synced from API
- **Used by**: Login page, StaffContext
- **Example**:
```javascript
[
  {
    _id: "507f1f77bcf86cd799439011",
    name: "Lagos Main Store",
    address: "123 Main Street, Lagos",
    phone: "+234 800 123 4567",
    isActive: true,
    categories: ["cat_1", "cat_2"],
    tenders: ["tender_1", "tender_2"]
  }
]
```

### `locations_metadata`
- **Type**: JSON Object
- **Updated**: Every time locations are synced
- **Used by**: Cache validation, UI status display
- **Example**:
```javascript
{
  lastSynced: "2026-01-25T10:30:45.123Z",
  count: 2,
  locationNames: ["Lagos Main Store", "Abuja Branch"],
  locationIds: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

---

## Common Scenarios

### Scenario 1: First Time Use (Online)
```
User opens login page with internet
    ↓
Locations load from API
    ↓
Locations cached to localStorage
    ↓
User logs in normally
    ↓
Next time offline → locations available in cache ✅
```

### Scenario 2: Internet Disconnects During Work
```
User logged in, working on POS
    ↓
Internet drops
    ↓
User can continue working (products/categories also cached)
    ↓
When online again → changes sync automatically
```

### Scenario 3: User Never Synced Before
```
User tries to login offline
    ↓
No cached locations found
    ↓
Error message: "Location data not available offline"
    ↓
User must sync with server when online first
```

### Scenario 4: Check Cache Status
```javascript
// In browser console:
import { getOfflineLocationSyncStatus } from '@/src/lib/offlineLocationStorage'
const status = getOfflineLocationSyncStatus();
console.log(status);

// Output:
{
  hasCachedData: true,
  cachedLocationCount: 2,
  cachedLocationNames: ["Lagos", "Abuja"],
  lastSynced: "25/1/2026, 10:30:45",
  isCacheStale: false,
  message: "2 locations cached for offline (last synced: 25/1/2026, 10:30:45)"
}
```

---

## Troubleshooting

### Problem: Login shows "Location not found"
**Solution**: 
- Check if you've synced when online at least once
- Refresh page when online to force location sync
- Check browser console for error messages

### Problem: Offline mode but no locations showing
**Solution**:
- Run this in console: `localStorage.getItem('cachedLocations')`
- If null/empty → you haven't synced yet (need online)
- If has data → reload page

### Problem: Can't login offline even with cached locations
**Solution**:
- Make sure PIN is exactly 4 digits (validation still works offline)
- Check that staff member exists in cached staff list
- Verify location selection is valid

### Problem: Check what's cached
**Solution**:
Open browser DevTools → Application → Local Storage → find:
- `cachedLocations` - all location data
- `locations_metadata` - sync info
- `cachedStaff` - staff members
- `till` - current till session

---

## Security Notes

⚠️ **PIN Security in Offline Mode**
- When offline, PIN validation is **skipped** (no server to validate against)
- This is intentional to allow offline login
- Staff member is responsible for PIN security
- Never leave terminal unattended in offline mode

✅ **Data Security**
- All location data is public (already shown to staff)
- No sensitive data cached beyond what's needed
- Cache cleared on logout
- Use HTTPS for all online data transfer

---

## Cache Expiry & Refresh

### When Cache Gets Updated
- Every time user logs in online
- Every time user clicks "Refresh Data" button
- When going from offline to online

### Cache Duration
- No automatic expiry (persists until cleared)
- Can manually check staleness with:
```javascript
import { isLocationCacheStale } from '@/src/lib/offlineLocationStorage'
console.log(isLocationCacheStale(24)); // Check if older than 24 hours
```

### Clear Cache Manually
```javascript
import { clearOfflineLocationCache } from '@/src/lib/offlineLocationStorage'
clearOfflineLocationCache();
```

---

## API Dependencies

Offline location feature depends on these API endpoints:

1. **`GET /api/store/init-locations`**
   - Returns store and locations data
   - Called on login page load
   - Results cached for offline use

2. **`GET /api/staff/list`**
   - Returns list of staff members
   - Called on login page load
   - Staff also cached for offline login

Both APIs should continue to work for online login with full PIN validation.
