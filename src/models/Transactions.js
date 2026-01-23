// models/Transactions.js - Merged from inventory & current app

import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: String,
    price: Number, // Price from POS (for backward compatibility)
    quantity: Number, // Quantity from POS
    salePriceIncTax: Number, // Standardized field for reports
    qty: Number, // Standardized field for reports
  },
  {
    _id: false,
    strict: false, // Allow additional fields from POS
  }
);

const TransactionSchema = new mongoose.Schema({
  // PAYMENT HANDLING: Support both single tenderType (legacy) and split payments (new)
  // Single tender (legacy, for backwards compatibility)
  tenderType: String, // Payment method: CASH, HYDROGEN POS, ACCESS POS, etc.
  
  // Split payments - array of tender amounts (new, takes precedence over tenderType)
  // Example: [{ tenderId: ObjectId, tenderName: "CASH", amount: 3000 }, { tenderId: ObjectId, tenderName: "TRANSFER", amount: 2000 }]
  tenderPayments: [{
    tenderId: mongoose.Schema.Types.ObjectId, // Reference to Tender
    tenderName: String,                         // Tender name (CASH, HYDROGEN POS, etc.)
    amount: Number,                             // Amount paid with this tender
  }],
  
  // Transaction amounts
  amountPaid: Number, // Total amount paid (sum of all tenderPayments if split, or amount for single tender)
  total: Number,
  change: Number,
  discount: Number,
  discountReason: String,
  
  // References
  staff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
  location: String, // Store location as string (location name or 'online')
  
  // Device & Table info
  device: String,
  tableName: String,
  
  // Customer info
  customerName: String,
  
  // Transaction classification
  transactionType: { 
    type: String, 
    enum: ["pos"], 
    default: "pos" 
  }, // Only POS transactions
  
  status: { 
    type: String, 
    enum: ["held", "completed", "refunded"], 
    default: "completed" 
  },
  
  // Items purchased
  items: {
    type: [itemSchema],
    default: [],
  },
  
  // Refund information
  refundReason: String,
  refundBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
  refundedAt: Date,
  
  // Track which till this transaction belongs to
  tillId: { type: mongoose.Schema.Types.ObjectId, ref: "Till" },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes for faster lookups
// Index for single tender (legacy)
TransactionSchema.index({ tenderType: 1, status: 1 });
// Index for split payments
TransactionSchema.index({ "tenderPayments.tenderId": 1, status: 1 });
// Index for till reconciliation
TransactionSchema.index({ tillId: 1 });
// Index for location-based reporting
TransactionSchema.index({ location: 1, createdAt: -1 });
// Index for staff performance
TransactionSchema.index({ staff: 1, createdAt: -1 });

// Avoid re-registering the model in development
delete mongoose.models.Transaction;
const Transaction = mongoose.model("Transaction", TransactionSchema);

export default Transaction;
export { Transaction };
