// models/Staff.js
import mongoose, { Schema, models } from "mongoose";

const StaffSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    pin: {
      type: String,
      default: "0000", // Default 4-digit PIN
    },

    role: {
      type: String,
      enum: ["staff", "manager", "admin"],
      default: "staff",
    },

    locationId: { type: Schema.Types.ObjectId },
    locationName: String,

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const Staff =
  models.Staff || mongoose.model("Staff", StaffSchema);
