# POS Login Page Redesign

## Overview
The StaffLogin.js component has been completely redesigned to match professional POS system standards. The new interface provides a modern, touch-friendly login experience with a split-screen layout.

## Key Features

### 1. **Header Bar** (Cyan #06B6D4)
- **Left:** Clock In/Out button with icon
- **Center:** Real-time till information (TILL 1 - DD/MM/YYYY - HH:MM)
- **Right:** Help & Support + Exit buttons (red)
- Updates every second for accurate time display

### 2. **Offline Mode Banner** (Red)
- Shows when network is unavailable
- Displays "Offline mode" with wifi icon
- Includes "Learn more →" link
- Automatically appears/disappears based on connection status

### 3. **Left Section** (Store/Location Selection)
- **Title:** "HAS PENDING TRANSACTIONS" indicator
- **Grid:** 2-column layout of store buttons
- **Styling:** 
  - Unselected: Cyan background (hover effect)
  - Selected: Dark cyan with yellow ring (ring-4 ring-yellow-400)
  - Responsive scale animation on hover
- **Functionality:** Click to select store for login

### 4. **Right Section** (PIN Entry)
- **Title:** "PLEASE ENTER YOUR PASSCODE"
- **PIN Display:** Masked dots (● ● ● ●) - updates as user enters digits
- **Numeric Keypad:**
  - 3x3 grid (1-9)
  - 0 spans 2 columns
  - Backspace (⌫) button
  - Touch-friendly sizing (py-6 for buttons)
- **Login Button:**
  - Enabled only when PIN is 4 digits AND store is selected
  - Cyan when active, gray when disabled
  - Shows "LOGGING IN..." during authentication

### 5. **Colors**
- **Primary:** Cyan (#06B6D4) - Main color scheme
- **Secondary:** Dark Cyan (#06B6D4 with opacity) - Button backgrounds
- **Accent:** Yellow ring (#FCD34D) - Selected state
- **Error:** Red (#DC2626) - Offline banner and error messages
- **Text:** White on colored backgrounds

## Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 Offline mode                                   Learn more →│ (Offline only)
├──────────────────┬──────────────────────────────────────────┤
│ CLOCK IN/OUT │ ✓ TILL 1 - 22/12/2025 - 21:50 │ HELP │ EXIT │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│  📋 HAS PENDING  │  PLEASE ENTER YOUR PASSCODE             │
│  TRANSACTIONS    │                                          │
│                  │  ● ● ● ●                                │
│  [AYOOLA]        │  ─────────────────                       │
│  [CHIOMA]        │                                          │
│  [Expire...]     │  1 2 3                                   │
│  [IBILE...]      │  4 5 6                                   │
│  [Samson]        │  7 8 9                                   │
│  [STOCK MOVE]    │  0   ⌫                                   │
│                  │                                          │
│                  │  [LOGIN]                                 │
│                  │  Enter 4-digit passcode...              │
└──────────────────┴──────────────────────────────────────────┘
```

## Component Props & State

### State Variables
```javascript
const [stores, setStores] = useState([]);           // Available stores
const [selectedStore, setSelectedStore] = useState("");  // Selected store ID
const [pin, setPin] = useState("");                 // PIN digits (1-4)
const [loading, setLoading] = useState(false);      // Login in progress
const [loadingData, setLoadingData] = useState(true);  // Loading stores
const [error, setError] = useState("");             // Error message
const [isOnline, setIsOnline] = useState(true);     // Network status
const [currentTime, setCurrentTime] = useState(""); // Real-time clock
const [hasPendingTransactions, setHasPendingTransactions] = useState(true);
const [currentTill, setCurrentTill] = useState("TILL 1");  // Till name
```

### Key Functions
- `handleLogin()` - Validates PIN and store, submits to `/api/staff/login`
- `handlePinClick(digit)` - Adds digit to PIN (max 4)
- `handleBackspace()` - Removes last digit from PIN
- `handleKeyPress(e)` - Allows Enter key to submit login

## API Integration

### Fetch Stores
```javascript
GET /api/store/init-locations
Response: { locations: [...] }
```

### Login Request
```javascript
POST /api/staff/login
Body: { store: storeId, pin: "1234" }
Response: { staff: {...}, store: {...}, location: {...} }
```

### Post-Login Routing
After successful login, redirects to `/app` (main POS application)

## Features

✅ **Real-time Clock** - Updates every second with current time
✅ **Offline Detection** - Automatic online/offline status banner
✅ **Touch-Friendly** - Large buttons (py-6, px-6) for touch devices
✅ **Visual Feedback** - Hover effects, scale animations, ring highlights
✅ **Keyboard Support** - Enter key submits login
✅ **Error Handling** - Clear error messages for invalid input
✅ **Loading States** - Button states indicate loading/disabled
✅ **Store Selection** - Visual feedback for selected store
✅ **PIN Security** - Masked input display (●●●●)

## Accessibility

- Semantic HTML with proper labels
- Color contrast meets WCAG standards
- Clear visual hierarchy
- Large touch targets (minimum 48px)
- Keyboard navigation support
- Error messages clearly visible

## Responsive Behavior

- **Mobile:** Maintains layout but may stack differently
- **Tablet:** Full layout visible
- **Desktop:** Optimized for 1920x1080+ resolution
- Grid items scale proportionally (grid-cols-2)
- Scroll handling for store list overflow

## Future Enhancements

- [ ] Clock In/Out functionality
- [ ] Help & Support modal/link
- [ ] Staff member icon/avatar display
- [ ] Transaction pending count badge
- [ ] Biometric authentication option
- [ ] Multi-language support
- [ ] Theme customization

## Testing Checklist

- [ ] Test with 0 stores
- [ ] Test with 6+ stores (grid overflow)
- [ ] Test online/offline toggle
- [ ] Test PIN entry (1-4 digits)
- [ ] Test store selection/deselection
- [ ] Test login button enable/disable logic
- [ ] Test error messages
- [ ] Test routing to `/app` after login
- [ ] Test time updates (real-time)
- [ ] Test responsive layout on mobile

## File Path
`src/components/layout/StaffLogin.js` (316 lines)

## Dependencies
- React & Next.js
- FontAwesome Icons (faClock, faQuestionCircle, faPowerOff, faWifiSlash)
- Tailwind CSS
- StaffContext (for login state)
