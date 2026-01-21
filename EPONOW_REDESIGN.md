# EpoNow-Inspired POS System - Complete Redesign

## Overview

This POS (Point of Sale) system has been completely redesigned following **EpoNow HQ** design principles and architecture. The system emphasizes streamlined operations, real-time data insights, inventory management, and simplified staff workflows.

## Key Features

### 1. **Dashboard** 
- Real-time business metrics (Total Sales, Orders, Active Staff, Low Stock Items)
- Quick view of top-performing products
- Active staff roster
- 30-second refresh interval for live data
- **Location**: `src/components/dashboard/Dashboard.js`

### 2. **Point of Sale (POS)**
- 4-column product grid layout with search and category filtering
- Real-time cart panel with quantity controls
- Compact item cards with quick add/remove
- Payment/Hold/Clear transaction buttons
- **Location**: `src/components/pos/EpoNowPOS.js`

### 3. **Order History**
- Complete transaction history with advanced filtering
- Status tracking (Completed, Pending, Cancelled)
- Detailed order view modal with itemization
- Export capabilities
- **Location**: `src/components/orders/OrderHistoryPage.js`

### 4. **Inventory Manager**
- Product table with real-time stock levels
- Low-stock and out-of-stock filtering
- Color-coded status badges (Green/Yellow/Red)
- Quick product search and filtering
- **Location**: `src/components/inventory/InventoryManager.js`

### 5. **Staff Manager**
- Staff roster with active/inactive filtering
- Role badges and performance metrics
- Total sales tracking per staff member
- Avatar initials display
- **Location**: `src/components/staff/StaffManager.js`

### 6. **Reports & Analytics**
- Sales overview and trend analysis
- Time-period filtering (Week/Month/Year)
- Top products and top staff displays
- Payment method breakdown (Cash/Card/Mobile)
- Export functionality
- **Location**: `src/components/reports/ReportsPage.js`

### 7. **Settings**
- Store information management
- Location configuration
- Tax rate setup
- Payment method management (Cash/Card/Mobile Money)
- **Location**: `src/components/settings/SettingsPage.js`

### 8. **Payment Modal**
- Multiple payment methods (Cash, Card, Mobile Money)
- Amount entry with change calculation (for cash)
- Payment processing with visual feedback
- Success confirmation screen
- **Location**: `src/components/payment/EpoNowPaymentModal.js`

### 9. **Main Application Layout**
- Responsive collapsible sidebar (64px closed, 256px open)
- Navigation menu with 7 main sections
- User profile dropdown with logout
- Notification bell with badge
- Top bar with active view display
- **Location**: `src/components/layout/EpoNowLayout.js`

## Authentication

### Staff Login Page
- Modern dual-panel layout (Store/Location selection + PIN entry)
- Store dropdown selection
- Staff dropdown from available staff
- 4-digit PIN keypad (exactly 4 digits required)
- Online/offline status indicator
- Real-time clock display
- **Location**: `src/components/layout/StaffLogin.js`

## Design System

### Color Palette
- **Primary Blue**: `#0095D5`
- **Dark Blue**: `#006BA8`
- **Teal**: `#17A8B8`
- **Success Green**: `#10B981`
- **Warning Yellow**: `#F59E0B`
- **Error Red**: `#EF4444`

### Typography
- **Bold Headers**: Teal/Blue gradient
- **Regular Text**: Gray-700 (`#374151`)
- **Muted Text**: Gray-600 (`#4B5563`)
- **Light Text**: Gray-500 (`#6B7280`)

### Layout System
- **Sidebar**: Gradient from Gray-900 to Gray-800
- **Cards**: White with shadow (shadow-md)
- **Buttons**: Gradient backgrounds with hover effects
- **Tables**: Striped rows with gradient headers
- **Modals**: Centered with backdrop blur

## API Endpoints

### Dashboard
- `GET /api/dashboard/stats` - Real-time dashboard metrics
  - Returns: `{ totalSales, totalOrders, averageTransaction, activeStaff, lowStockItems, topProducts, activeStaffList }`

### Reports
- `GET /api/reports?range=week|month|year` - Period-based analytics
  - Returns: `{ totalSales, totalTransactions, averageTransaction, topProduct, topStaff }`

### Staff
- `GET /api/staff/list` - List all staff members
- `POST /api/staff/login` - Staff authentication with PIN

### Transactions
- `GET /api/transactions` - Transaction history
- `POST /api/transactions/process-payment` - Process payment (to be implemented)

### Store
- `GET /api/store/init-locations` - Store and location data

## Component Integration

The main application is accessed via `/app` route and uses the `MainApp` component which:
1. Manages page state (currentPage)
2. Renders appropriate page component
3. Wraps all pages in EpoNowLayout
4. Handles navigation between sections

```javascript
// Usage in src/pages/app.js
<EpoNowLayout currentPage={currentPage} onPageChange={setCurrentPage}>
  {renderPage()}
</EpoNowLayout>
```

## Navigation Flow

1. **User starts at `/`** → Redirects to `/login` if not authenticated
2. **Login page** → `/login` (StaffLogin.js)
3. **After authentication** → `/app` (MainApp with Dashboard as default)
4. **Navigation** → Use sidebar to switch between sections:
   - Dashboard
   - Point of Sale (POS)
   - Orders
   - Inventory
   - Staff
   - Reports
   - Settings

## Real-Time Data Updates

### Dashboard
- Auto-refreshes every 30 seconds
- Fetches from `/api/dashboard/stats`
- Displays live metrics and top performers

### POS
- Products load on component mount
- Cart state managed locally
- Ready for payment processing integration

### Inventory
- Real-time stock level filtering
- Color-coded status indicators
- Auto-calculation of low-stock items

## Future Enhancements

- [ ] Real-time chart visualization (Sales trends, Category breakdown)
- [ ] Payment gateway integration
- [ ] Receipt printing functionality
- [ ] Offline mode enhancements with data sync
- [ ] Customer loyalty program integration
- [ ] Advanced reporting with custom date ranges
- [ ] Email report delivery
- [ ] Multi-store management
- [ ] Mobile staff app
- [ ] SMS notifications for low stock
- [ ] QR code product integration
- [ ] Barcode scanning support

## Installation & Setup

1. Ensure all dependencies are installed:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Navigate to `http://localhost:3000`

4. Login with your staff credentials (4-digit PIN)

## Database Requirements

Ensure MongoDB collections exist for:
- `staffs` (Staff members)
- `stores` (Store information)
- `products` (Product catalog)
- `transactions` (Sales records)
- `categories` (Product categories)

## Performance Considerations

- Dashboard stats endpoint aggregates data in-database
- Pagination ready for inventory and transaction tables
- Local state management for cart to reduce API calls
- 30-second refresh interval balances real-time updates with server load

## Security Notes

- All endpoints require staff authentication (to be implemented)
- PIN is transmitted (implement HTTPS in production)
- Staff context manages authentication state
- Logout clears all user data

## Support

For issues or feature requests, please refer to the development team.
