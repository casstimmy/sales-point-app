import mongoose from "mongoose";
import { mongooseConnect } from "@/src/lib/mongoose";
import Order from "@/src/models/Order";

const ACTIVE_ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Shipped",
  "Pending Payment",
  "Inventory Reserved",
];

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    await mongooseConnect();

    const {
      locationId,
      locationName,
      startDate,
      endDate,
      limit = 200,
      includeExpired = "false",
    } = req.query;

    const filters = {
      status: {
        $in: includeExpired === "true"
          ? [...ACTIVE_ORDER_STATUSES, "Reservation Expired"]
          : ACTIVE_ORDER_STATUSES,
      },
    };

    if (locationId && mongoose.Types.ObjectId.isValid(String(locationId))) {
      filters.locationId = locationId;
    } else if (locationName) {
      filters.locationName = {
        $regex: `^${escapeRegex(locationName)}$`,
        $options: "i",
      };
    }

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) {
        filters.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filters.createdAt.$lte = new Date(endDate);
      }
    }

    console.log("📋 Fetching online orders with filters:", filters);

    const orders = await Order.find(filters)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10) || 200)
      .lean();

    const formattedOrders = orders.map((order) => ({
      id: order._id?.toString(),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customerId: order.customer?.toString?.() || order.customer || null,
      customerName: order.shippingDetails?.name || "Online Customer",
      shippingDetails: order.shippingDetails || null,
      items: order.items || [],
      cartProducts: order.cartProducts || [],
      subtotal: order.subtotal || 0,
      shippingCost: order.shippingCost || 0,
      total: order.total || 0,
      locationId: order.locationId?.toString?.() || order.locationId || null,
      locationName: order.locationName || "",
      paymentReference: order.paymentReference || "",
      paymentStatus: order.paymentStatus || "Pending",
      status: order.status || "Pending",
      paid: Boolean(order.paid),
    }));

    return res.status(200).json({
      success: true,
      data: formattedOrders,
      count: formattedOrders.length,
    });
  } catch (error) {
    console.error("❌ Error fetching online orders:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch online orders",
    });
  }
}
