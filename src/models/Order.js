import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
      default: null,
    },
    shippingDetails: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
    },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: false },
        name: { type: String, default: "" },
        price: { type: Number, default: 0 },
        quantity: { type: Number, default: 0 },
        category: String,
        description: String,
        images: [String],
      },
    ],
    cartProducts: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: false },
        name: { type: String, default: "" },
        price: { type: Number, default: 0 },
        quantity: { type: Number, default: 0 },
        category: String,
        description: String,
        images: [String],
      },
    ],
    subtotal: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      default: null,
    },
    locationName: {
      type: String,
      default: "",
      index: true,
    },
    paymentReference: { type: String, default: "" },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed"],
      default: "Pending",
    },
    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Pending Payment",
        "Inventory Reserved",
        "Reservation Expired",
      ],
      default: "Pending",
    },
    deliveryPerson: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
    },
    paid: { type: Boolean, default: false },
    inventoryFinalizedBy: {
      type: String,
      enum: ["paystack", "admin", null],
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);
