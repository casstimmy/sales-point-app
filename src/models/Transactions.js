// models/Transactions.js

import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: String,
    salePriceIncTax: Number,
    qty: Number,
  },
   {
    _id: false,
    strict: true, // <-- just to enforce schema mapping
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
  
  amountPaid: Number, // Total amount paid (sum of all tenderPayments if split, or amount for single tender)
  total: Number,
  staff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
  location: String,
  device: String,
  tableName: String,
  discount: Number,
  discountReason: String,
  customerName: String,
  transactionType: { type: String, enum: ["pos"], default: "pos" }, // Only POS transactions
  status: { 
    type: String, 
    enum: ["held", "completed", "refunded"], 
    default: "completed" 
  },
  change: Number,
  items: {
    type: [itemSchema],
    default: [],
  },
  refundReason: String,
  refundBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
  refundedAt: Date,
  
  // Track which till this transaction belongs to
  tillId: { type: mongoose.Schema.Types.ObjectId, ref: "Till" },
  
  createdAt: { type: Date, default: Date.now },
});

// Index for faster lookups by tender type and status
TransactionSchema.index({ tenderType: 1, status: 1 });
// Index for faster lookups by tenders (for split payments)
TransactionSchema.index({ "tenderPayments.tenderId": 1, status: 1 });
// Index for faster lookups by till
TransactionSchema.index({ tillId: 1 });
// Index for getting all transactions from a location on a date
TransactionSchema.index({ location: 1, createdAt: -1 });

// Force refresh the model to avoid schema mismatch in development
delete mongoose.models.Transaction;
const Transaction = mongoose.model("Transaction", TransactionSchema);



export { Transaction };
