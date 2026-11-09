/**
 * API Endpoint: /api/transactions/held
 *
 * GET  - held (parked, unpaid) sales saved on the server, newest first. Not
 *        limited to today or to one device, so any till can pick up a sale
 *        that was held earlier.
 *        Query: locationId, location (name), limit
 * POST - { action: 'void', transactionId, reason }
 *        Cancels a held sale that will never be paid. Needs refund access,
 *        or must be the staff member who held it.
 */

import mongoose from 'mongoose';
import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';
import { sanitizeBody } from '@/src/lib/apiValidation';
import { requireSessionStaff } from '@/src/lib/staffSession';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HELD_FIELDS = [
  '_id', 'externalId', 'items', 'total', 'subtotal', 'tax', 'discount', 'customerName',
  'customerId', 'tableName', 'staffName', 'heldByStaffName', 'heldByStaffId', 'location',
  'locationId', 'createdAt', 'heldAt', 'updatedAt', 'tillId', 'device',
].join(' ');

const findHeldTransaction = (transactionId) => {
  const id = String(transactionId || '').trim();
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id)
    ? { _id: new mongoose.Types.ObjectId(id) }
    : { externalId: id };
};

export default async function handler(req, res) {
  await mongooseConnect();

  if (req.method === 'GET') {
    const { locationId, location } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);

    const query = { status: 'held', subStatus: { $ne: 'void' } };
    const locationFilters = [];
    if (locationId && mongoose.Types.ObjectId.isValid(String(locationId))) {
      locationFilters.push({ locationId: new mongoose.Types.ObjectId(String(locationId)) });
    }
    if (location && String(location).trim()) {
      locationFilters.push({ location: { $regex: `^${escapeRegex(String(location).trim())}$`, $options: 'i' } });
    }
    if (locationFilters.length) {
      query.$or = locationFilters;
    }

    try {
      const held = await Transaction.find(query)
        .select(HELD_FIELDS)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return res.status(200).json({ success: true, count: held.length, data: held });
    } catch (error) {
      console.error('Failed to load held transactions:', error);
      return res.status(500).json({ success: false, message: 'Could not load held orders.' });
    }
  }

  if (req.method === 'POST') {
    req.body = sanitizeBody(req.body);
    const { action, transactionId, reason } = req.body || {};

    if (action !== 'void') {
      return res.status(400).json({ success: false, message: 'Unsupported action.' });
    }

    const filter = findHeldTransaction(transactionId);
    if (!filter) {
      return res.status(400).json({ success: false, message: 'transactionId is required.' });
    }

    const staff = await requireSessionStaff(req, res);
    if (!staff) return;

    const heldSale = await Transaction.findOne(filter).select('_id status subStatus heldByStaffId').lean();
    if (!heldSale) {
      return res.status(404).json({ success: false, message: 'Held order not found.' });
    }

    const heldBySameStaff = heldSale.heldByStaffId && String(heldSale.heldByStaffId) === staff._id;
    if (!staff.posPermissions?.refundAccess && !heldBySameStaff) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only the staff member who held this order or a manager can cancel it.',
      });
    }

    const voided = await Transaction.findOneAndUpdate(
      { _id: heldSale._id, status: 'held', subStatus: { $ne: 'void' } },
      {
        $set: {
          subStatus: 'void',
          voidedAt: new Date(),
          voidReason: String(reason || '').trim().slice(0, 300) || 'Cancelled at POS',
          voidedByStaffId: new mongoose.Types.ObjectId(staff._id),
          voidedByStaffName: staff.name || '',
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!voided) {
      return res.status(409).json({
        success: false,
        code: 'HELD_NOT_OPEN',
        message: 'This held order was already completed or cancelled.',
      });
    }

    return res.status(200).json({ success: true, message: 'Held order cancelled.', transactionId: voided._id });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
