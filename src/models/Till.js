// models/Till.js
import mongoose from "mongoose";

const TillSchema = new mongoose.Schema(
  {
    // Reference to store location
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Location within store
    
    // Staff who opened the till
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    staffName: { type: String, required: true },
    
    // Till session dates
    openedAt: { type: Date, default: () => new Date(), required: true },
    closedAt: { type: Date },
    
    // Till balances
    openingBalance: { type: Number, required: true, default: 0 }, // Cash in till at opening
    expectedClosingBalance: { type: Number }, // Opening balance + sales
    physicalCount: { type: Number }, // Actual cash count at close
    variance: { type: Number }, // Difference between expected and physical
    
    // Sales totals for the till session
    totalSales: { type: Number, default: 0 }, // Sum of all transactions
    transactionCount: { type: Number, default: 0 }, // Number of transactions
    transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Transaction" }], // Transaction refs
    
    // Breakdown by tender type (Map to support dynamic tender names)
    tenderBreakdown: {
      type: Map,
      of: Number,
      default: {},
    },

    // Tender reconciliation data (processed vs physical count per tender)
    tenderVariances: {
      type: Map,
      of: {
        processed: Number,
        counted: Number,
        variance: Number,
      },
      default: {},
    },
    
    // Till status
    status: { 
      type: String, 
      enum: ["OPEN", "CLOSED"], 
      default: "OPEN"
    },
    
    // Notes/comments at closing
    closingNotes: { type: String },
    
    // Daily summary
    date: { type: Date, default: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }},
  },
  { timestamps: true }
);

// Index for quick lookup of current open till
TillSchema.index({ storeId: 1, locationId: 1, status: 1, openedAt: -1 });
TillSchema.index({ date: 1, locationId: 1 });

export default mongoose.models.Till || mongoose.model("Till", TillSchema);
