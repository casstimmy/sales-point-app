import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { mongooseConnect } from '@/src/lib/mongoose';
import Order from '@/src/models/Order';
import { Transaction } from '@/src/models/Transactions';
import Till from '@/src/models/Till';
import Product from '@/src/models/Product';
import { sanitizeBody } from '@/src/lib/apiValidation';
import { updateInventoryForSale } from '@/src/lib/syncPackQty';
import { markRoomsFromTransaction } from '@/src/lib/roomAvailability';
import { ROOM_STATUSES } from '@/src/lib/roomReservations';

const ONLINE_TENDER_NAME = 'ONLINE';
const ONLINE_SALES_CHANNEL = 'ONLINE_STORE';

const ensureTenderBreakdownMap = (value) =>
  value instanceof Map ? value : new Map(Object.entries(value || {}));

const applyTenderEntries = (map, entries = [], sign = 1) => {
  entries.forEach((entry) => {
    const key = entry?.name || ONLINE_TENDER_NAME;
    const current = Number(map.get(key) || 0);
    const next = Math.max(0, current + (sign * Number(entry?.amount || 0)));
    map.set(key, next);
  });
};

const getOrderContactDetails = (order) =>
  order?.shippingDetails || order?.customerSnapshot || order?.customer || {};

const getOrderItems = (order) => {
  if (Array.isArray(order?.cartProducts) && order.cartProducts.length > 0) {
    return order.cartProducts;
  }
  return Array.isArray(order?.items) ? order.items : [];
};

const buildTransactionItems = (items = []) =>
  items
    .map((item) => ({
      productId: item.productId?._id || item.productId || item.id || null,
      name: item.name || 'Unnamed item',
      quantity: Number(item.quantity || item.qty || 0),
      qty: Number(item.quantity || item.qty || 0),
      price: Number(item.price || item.salePriceIncTax || 0),
      salePriceIncTax: Number(item.price || item.salePriceIncTax || 0),
      category: item.category || '',
      description: item.description || '',
      images: Array.isArray(item.images) ? item.images : [],
    }))
    .filter((item) => item.productId && item.quantity > 0);

const getTenderEntries = ({ tenderType, tenderPayments, total }) => {
  if (Array.isArray(tenderPayments) && tenderPayments.length > 0) {
    return tenderPayments.map((payment) => ({
      name: payment?.tenderName || ONLINE_TENDER_NAME,
      amount: Number(payment?.amount || 0),
    }));
  }

  return [{
    name: tenderType || ONLINE_TENDER_NAME,
    amount: Number(total || 0),
  }];
};

const normalizePaymentDetails = ({ order, paymentDetails }) => {
  const total = Number(order?.total || 0);
  const isAlreadyPaid = Boolean(order?.paid || order?.paymentStatus === 'Paid');

  if (isAlreadyPaid) {
    return {
      tenderType: ONLINE_TENDER_NAME,
      tenderPayments: [
        {
          tenderId: null,
          tenderName: ONLINE_TENDER_NAME,
          amount: total,
        },
      ],
      amountPaid: total,
      change: 0,
      paymentChannel: order?.paymentChannel || 'paystack',
    };
  }

  const tenderPayments = Array.isArray(paymentDetails?.tenderPayments)
    ? paymentDetails.tenderPayments
        .map((payment) => ({
          tenderId: payment?.tenderId || null,
          tenderName: payment?.tenderName || '',
          amount: Number(payment?.amount || 0),
        }))
        .filter((payment) => payment.tenderName && payment.amount > 0)
    : [];

  return {
    tenderType: paymentDetails?.tenderType || tenderPayments[0]?.tenderName || '',
    tenderPayments,
    amountPaid: Number(paymentDetails?.amountPaid || 0),
    change: Number(paymentDetails?.change || 0),
    paymentChannel: 'pos',
  };
};

const buildEmailPayload = (order, status) => {
  const contact = getOrderContactDetails(order);
  const items = getOrderItems(order);

  return {
    name: order?.customer?.name || contact?.name || 'Customer',
    email: order?.customer?.email || contact?.email || '',
    orderId: order?._id,
    status,
    total: Number(order?.total || 0),
    products: items.map((item) => ({
      name: item?.name || 'Item',
      quantity: Number(item?.quantity || item?.qty || 0),
      price: Number(item?.price || item?.salePriceIncTax || 0),
    })),
    shippingDetails: contact,
  };
};

const sendDeliveredEmail = async (order) => {
  const payload = buildEmailPayload(order, 'Delivered');
  const recipient = payload.email;

  if (!recipient || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return 'skipped';
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"St's Micheals" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: "Order Delivered - St's Micheals",
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; background: #f9fafb; padding: 20px;">
          <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
              <h2 style="margin: 0;">St's Micheals</h2>
              <p style="margin: 0;">Your order has been delivered</p>
            </div>
            <div style="padding: 25px;">
              <p>Hi <strong>${payload.name}</strong>,</p>
              <p>Your order <strong>${payload.orderId}</strong> has been completed from our POS and marked as delivered.</p>
              <h3 style="margin-top: 25px;">Order Summary</h3>
              <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <thead>
                  <tr style="background: #f1f5f9;">
                    <th style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left;">Item</th>
                    <th style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left;">Qty</th>
                    <th style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${payload.products
                    .map(
                      (product) => `
                        <tr>
                          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${product.name}</td>
                          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${product.quantity}</td>
                          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">₦${product.price.toLocaleString('en-NG')}</td>
                        </tr>
                      `
                    )
                    .join('')}
                </tbody>
              </table>
              <p style="margin-top: 20px;"><strong>Total:</strong> ₦${payload.total.toLocaleString('en-NG')}</p>
              <p><strong>Status:</strong> Delivered</p>
              <p style="margin-top: 24px;">Thank you for shopping with <strong>St's Micheals</strong>.</p>
            </div>
          </div>
        </div>
      `,
    });

    return 'sent';
  } catch (error) {
    console.error('Delivered email failed:', error.message);
    return 'failed';
  }
};

const clearReservedInventory = async (items = []) => {
  for (const item of items) {
    const productId = item.productId?._id || item.productId || item.id;
    const quantity = Number(item.quantity || item.qty || 0);

    if (!productId || quantity <= 0) {
      continue;
    }

    try {
      await Product.updateOne(
        { _id: productId },
        [{
          $set: {
            reservedQuantity: {
              $max: [0, { $subtract: ['$reservedQuantity', quantity] }],
            },
          },
        }]
      );
    } catch (error) {
      console.warn('Failed to clear reserved quantity for product:', productId, error.message);
    }
  }
};

const formatTransactionResponse = (transaction) => ({
  id: transaction?._id?.toString?.() || transaction?._id || null,
  _id: transaction?._id?.toString?.() || transaction?._id || null,
  createdAt: transaction?.createdAt || new Date().toISOString(),
  items: transaction?.items || [],
  subtotal: Number(transaction?.subtotal || 0),
  tax: Number(transaction?.tax || 0),
  total: Number(transaction?.total || 0),
  discount: Number(transaction?.discount || 0),
  amountPaid: Number(transaction?.amountPaid || 0),
  change: Number(transaction?.change || 0),
  tenderType: transaction?.tenderType || null,
  tenderPayments: transaction?.tenderPayments || [],
  customerName: transaction?.customerName || '',
  staffName: transaction?.staffName || 'POS Staff',
  location: transaction?.location || '',
  status: transaction?.status || 'completed',
  salesChannel: transaction?.salesChannel || ONLINE_SALES_CHANNEL,
  sourceOrderId: transaction?.sourceOrderId || null,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  req.body = sanitizeBody(req.body);

  try {
    await mongooseConnect();

    const { id } = req.query;
    const {
      tillId,
      staffId,
      staffName,
      locationId,
      locationName,
      paymentDetails = {},
    } = req.body || {};

    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order id',
      });
    }

    if (!tillId || !mongoose.Types.ObjectId.isValid(String(tillId))) {
      return res.status(400).json({
        success: false,
        error: 'Valid tillId is required',
      });
    }

    const order = await Order.findById(id).populate('customer').lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const till = await Till.findById(tillId);
    if (!till) {
      return res.status(404).json({
        success: false,
        error: 'Till not found',
      });
    }

    const orderItems = getOrderItems(order);
    if (orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Order has no items to process',
      });
    }

    const normalizedPayment = normalizePaymentDetails({ order, paymentDetails });
    if (!order.paid) {
      const hasTender = Boolean(
        normalizedPayment.tenderType ||
        (Array.isArray(normalizedPayment.tenderPayments) && normalizedPayment.tenderPayments.length > 0)
      );

      if (!hasTender || normalizedPayment.amountPaid < Number(order.total || 0)) {
        return res.status(400).json({
          success: false,
          error: 'A complete POS payment is required before delivery',
        });
      }
    }

    const resolvedLocationName = String(locationName || order.locationName || till.locationName || '').trim() || 'Online';
    const resolvedLocationId = mongoose.Types.ObjectId.isValid(String(locationId || ''))
      ? new mongoose.Types.ObjectId(String(locationId))
      : (mongoose.Types.ObjectId.isValid(String(order.locationId || ''))
        ? new mongoose.Types.ObjectId(String(order.locationId))
        : null);

    const externalId = `order:${String(order._id)}`;
    let transaction = await Transaction.findOne({ externalId });

    if (transaction && order.status === 'Delivered') {
      return res.status(200).json({
        success: true,
        alreadyProcessed: true,
        emailState: 'skipped',
        order,
        transaction: formatTransactionResponse(transaction),
      });
    }

    if (!transaction) {
      const mappedItems = buildTransactionItems(orderItems);

      transaction = new Transaction({
        externalId,
        dedupeKey: externalId,
        tenderType: normalizedPayment.tenderType || null,
        tenderPayments: Array.isArray(normalizedPayment.tenderPayments) ? normalizedPayment.tenderPayments : [],
        amountPaid: normalizedPayment.amountPaid || Number(order.total || 0),
        subtotal: Number(order.subtotal || order.total || 0),
        tax: 0,
        total: Number(order.total || 0),
        change: normalizedPayment.change || 0,
        discount: 0,
        staff: staffId || null,
        staffName: staffName || 'POS Staff',
        location: resolvedLocationName,
        locationId: resolvedLocationId,
        device: 'POS',
        customerName: getOrderContactDetails(order)?.name || 'Online Customer',
        status: 'completed',
        items: mappedItems,
        transactionType: 'pos',
        tillId: new mongoose.Types.ObjectId(String(tillId)),
        createdAt: new Date(),
        inventoryUpdated: true,
        salesChannel: ONLINE_SALES_CHANNEL,
        sourceOrderId: String(order._id),
        sourceOrderType: 'online-order',
        sourceSiteKey: order.siteKey || 'store',
      });

      await transaction.save();

      if (!(till.transactions || []).some((transactionId) => String(transactionId) === String(transaction._id))) {
        till.transactions.push(transaction._id);
      }
      till.totalSales = Number(till.totalSales || 0) + Number(order.total || 0);
      till.transactionCount = (till.transactions || []).length;
      till.tenderBreakdown = ensureTenderBreakdownMap(till.tenderBreakdown);
      applyTenderEntries(
        till.tenderBreakdown,
        getTenderEntries({
          tenderType: normalizedPayment.tenderType,
          tenderPayments: normalizedPayment.tenderPayments,
          total: order.total,
        }),
        1
      );
      till.markModified('tenderBreakdown');
      await till.save();

      if (!order.inventoryFinalizedBy) {
        await updateInventoryForSale(mappedItems);
        await clearReservedInventory(orderItems);
      }

      try {
        await markRoomsFromTransaction(mappedItems, transaction, ROOM_STATUSES.OCCUPIED);
      } catch (error) {
        console.warn('Failed to update room occupancy for online POS order:', error.message);
      }
    }

    const updatePayload = {
      status: 'Delivered',
      paid: true,
      paymentStatus: 'Paid',
      paymentChannel: order.paid ? (order.paymentChannel || 'paystack') : 'pos',
      locationId: resolvedLocationId,
      locationName: resolvedLocationName,
      reservationStatus: 'finalized',
      reservationReleasedAt: order.reservationReleasedAt || new Date(),
      finalizedAt: order.finalizedAt || new Date(),
      inventoryFinalizedBy: order.inventoryFinalizedBy || 'pos',
    };

    if (!order.paymentReference) {
      updatePayload.paymentReference = String(transaction._id);
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    )
      .populate('customer')
      .lean();

    const emailState = order.status === 'Delivered' ? 'skipped' : await sendDeliveredEmail(updatedOrder);

    return res.status(200).json({
      success: true,
      alreadyProcessed: false,
      emailState,
      order: updatedOrder,
      transaction: formatTransactionResponse(transaction),
    });
  } catch (error) {
    console.error('Failed to complete online order from POS:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete online order from POS',
    });
  }
}