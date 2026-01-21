// models/Category.js
import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Category = mongoose.models.Category || mongoose.model("Category", CategorySchema);
