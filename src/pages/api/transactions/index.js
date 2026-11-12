/**
 * API Endpoint: POST /api/transactions
 *
 * Single entry point for POS sales coming from the till, the offline queue and
 * held orders:
 *   - new sales (completed, credit, held)
 *   - edits of an existing record (resuming a held sale, recalling a sale)
 *
 * Every step is safe to retry. Stock moves at most once per sale, a sale is
 * linked to a till at most once, and till totals are rebuilt from the sales
 * themselves so they always match.
 */

import { mongooseConnect } from '@/src/lib/mongoose';
import { Transaction } from '@/src/models/Transactions';
import Customer from '@/src/models/Customer';
import Promotion from '@/src/models/Promotion';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { sanitizeBody } from '@/src/lib/apiValidation';
import { ROOM_STATUSES } from '@/src/lib/roomReservations';
import { markRoomsFromTransaction, releaseRoomsFromTransaction } from '@/src/lib/roomAvailability';
import {
  applySaleInventoryOnce,
  linkTransactionToTill,
  normalizeTenderPaymentsForStorage,
  restockSaleInventoryOnce,
  toObjectId,
  unlinkTransactionFromTill,
} from '@/src/lib/tillLedger';

const VALID_STATUSES = ['completed', 'held', 'refunded', 'credit'];
const STOCK_STATUSES = ['completed', 'credit'];

const normalizeLocationName = (location) => {
  if (typeof location === 'string' && location.trim()) return location.trim();
  if (location && typeof location === 'object') {
    if (typeof location.name === 'string' && location.name.trim()) return location.name.trim();
    if (typeof location.code === 'string' && location.code.trim()) return location.code.trim();
  }
  return 'Main Store';
};

const toDate = (value, fallback = new Date()) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const mapItems = (items = []) =>
  items.map((item) => ({
    ...item,
    productId: item.productId || item.id,
    name: item.name,
    salePriceIncTax: item.price || item.salePriceIncTax || 0,
    qty: item.quantity || item.qty || 0,
  }));

const getCreditPaidTotal = (transaction = {}) => {
  const payments = Array.isArray(transaction.creditPayments) ? transaction.creditPayments : [];
  if (payments.length > 0) {
    return payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }
  return Number(transaction.creditPaidAmount || 0);
};

const getCreditBalance = (transaction = {}) => {
  const total = Number(transaction.creditOriginalTotal || transaction.total || 0);
  return Math.max(0, total - getCreditPaidTotal(transaction));
};

const recalculateCustomerCreditBalance = async (customerId) => {
  const id = toObjectId(customerId);
  if (!id) return;

  const openCredits = await Transaction.find({
    status: 'credit',
    creditCustomerId: id,
    creditStatus: { $nin: ['paid', 'written_off'] },
  }).select('creditBalance total creditOriginalTotal creditPaidAmount creditPayments');

  const creditBalance = openCredits.reduce((sum, transaction) => sum + getCreditBalance(transaction), 0);
  await Customer.findByIdAndUpdate(id, {
    type: 'CREDIT',
    isCreditCustomer: true,
    creditBalance,
    updatedAt: new Date(),
  });
};

/** Counts one use of the customer promotion on a sale, so promotion usage limits work. */
async function recordPromotionUse(appliedPromotion) {
  const promotionId = toObjectId(appliedPromotion?._id);
  if (!promotionId) return;
  try {
    await Promotion.updateOne({ _id: promotionId }, { $inc: { timesUsed: 1 } });
  } catch (error) {
    console.warn('Could not record promotion use:', error.message);
  }
}

/** Keeps only the promotion fields a sale needs (never trust a large client object as-is). */
const toStoredPromotion = (promotion) => {
  if (!promotion || typeof promotion !== 'object') return null;
  const {
    _id, name, valueType, discountType, discountValue, fixedAmountApplyMode,
    applicationType, products, categories, targetCustomerTypes,
  } = promotion;
  return {
    _id: _id ? String(_id) : null,
    name: String(name || 'Promotion').slice(0, 120),
    valueType, discountType,
    discountValue: Number(discountValue || 0),
    fixedAmountApplyMode, applicationType,
    products: Array.isArray(products) ? products.map(String).slice(0, 200) : [],
    categories: Array.isArray(categories) ? categories.map(String).slice(0, 200) : [],
    targetCustomerTypes: Array.isArray(targetCustomerTypes) ? targetCustomerTypes.map(String).slice(0, 20) : [],
    active: true,
  };
};

/** Finishes any effects a sale should have but may have missed (crash, timeout, retry). */
async function ensureSaleEffects(transaction, items, tillId) {
  if (!STOCK_STATUSES.includes(transaction.status)) return;

  try {
    await applySaleInventoryOnce(transaction._id, items?.length ? items : transaction.items);
  } catch (error) {
    console.warn('Stock update retry failed for', String(transaction._id), error.message);
  }

  const linkTillId = transaction.tillId || tillId;
  if (transaction.status === 'completed' && linkTillId) {
    try {
      await linkTransactionToTill(linkTillId, transaction._id);
    } catch (error) {
      console.warn('Till link retry failed for', String(transaction._id), error.message);
    }
  }
}

function duplicateResponse(res, transaction, message = 'Transaction already exists (duplicate prevented)') {
  return res.status(200).json({
    success: true,
    message,
    transactionId: transaction?._id,
    duplicate: true,
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ success: true, message: 'Transactions endpoint is ready' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  req.body = sanitizeBody(req.body);

  try {
    await mongooseConnect();

    const {
      items,
      total,
      tax = 0,
      subtotal = 0,
      tenderType,
      tenderPayments,
      amountPaid,
      change,
      staffName: rawStaffName = 'Unknown',
      staffId,
      discount = 0,
      location = 'Default Location',
      locationId,
      device,
      tableName,
      customerName,
      customerId,
      createdAt,
      updatedAt: clientUpdatedAt,
      status = 'completed',
      tillId: rawTillId,
      originalOfflineTillId,
      externalId,
      editTransactionId,
      recallSourceStatus,
      subStatus,
      heldByStaffName,
      heldByStaffId,
      incrementAmount,
      incrementName,
      discountName,
      appliedPromotion: rawAppliedPromotion,
      promotionValueType,
      customerType,
      creditDueDate,
      creditNotes,
      salesChannel,
      sourceOrderId,
      sourceOrderType,
      sourceSiteKey,
    } = req.body;

    const staffName = rawStaffName && rawStaffName !== 'Unknown' ? rawStaffName : 'POS Staff';
    const normalizedLocation = normalizeLocationName(location);
    const tillObjectId = toObjectId(rawTillId);
    const syncedByStaffId = toObjectId(req.headers['x-auth-staff-id']);

    const hasMultiplePayments = Array.isArray(tenderPayments) && tenderPayments.length > 0;
    const hasSingleTender = Boolean(tenderType) && !hasMultiplePayments;
    const rawStatus = String(status || 'completed').trim().toLowerCase();
    const requestedStatus = rawStatus === 'complete' ? 'completed' : rawStatus;
    const normalizedStatus = VALID_STATUSES.includes(requestedStatus) ? requestedStatus : 'completed';
    const isHeldTransaction = normalizedStatus === 'held';
    const isCompletedTransaction = normalizedStatus === 'completed';
    const isCreditTransaction = normalizedStatus === 'credit';
    const isStockAffectingTransaction = STOCK_STATUSES.includes(normalizedStatus);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid transaction: items array required' });
    }

    if (total === undefined || (!isHeldTransaction && !isCreditTransaction && !hasSingleTender && !hasMultiplePayments)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction: total and (tenderType or tenderPayments) required',
      });
    }

    const storedTenderPayments = hasMultiplePayments
      ? normalizeTenderPaymentsForStorage({ tenderPayments, tenderType, total })
      : [];
    const mappedItems = mapItems(items);
    const appliedPromotion = toStoredPromotion(rawAppliedPromotion);

    const buildCreateContext = () => {
      const buildDedupeKey = () => {
        const createdAtStamp = toDate(createdAt);
        const roundedCreatedAt = new Date(Math.floor(createdAtStamp.getTime() / 1000) * 1000).toISOString();
        const normalizedItems = items.map((item) => ({
          productId: String(item.productId || item.id || ''),
          name: item.name || '',
          qty: Number(item.quantity || item.qty || 0),
          price: Number(item.price || item.salePriceIncTax || 0),
        }));
        const normalizedPayments = (tenderPayments || [])
          .map((payment) => ({
            tenderId: String(payment.tenderId || ''),
            tenderName: payment.tenderName || '',
            amount: Number(payment.amount || 0),
          }))
          .sort((a, b) => (a.tenderName + a.tenderId).localeCompare(b.tenderName + b.tenderId));
        return crypto.createHash('sha1').update(JSON.stringify({
          items: normalizedItems,
          total: Number(total || 0),
          amountPaid: Number(amountPaid || total || 0),
          change: Number(change || 0),
          tenderType: hasMultiplePayments ? null : (tenderType || null),
          tenderPayments: normalizedPayments,
          staffId: staffId ? String(staffId) : null,
          location: normalizedLocation || null,
          tillId: rawTillId ? String(rawTillId) : null,
          createdAt: roundedCreatedAt,
          status: normalizedStatus,
        })).digest('hex');
      };

      return {
        externalId: externalId ? String(externalId) : null,
        dedupeKey: externalId ? String(externalId) : buildDedupeKey(),
        subStatus: subStatus || null,
        appliedEditIds: [],
      };
    };

    const createTransaction = async (context) => {
      const existing = context.externalId
        ? await Transaction.findOne({ externalId: context.externalId })
        : await Transaction.findOne({ dedupeKey: context.dedupeKey });

      if (existing) {
        await ensureSaleEffects(existing, mappedItems, tillObjectId);
        return duplicateResponse(res, existing);
      }

      if (!context.externalId && createdAt && tillObjectId) {
        const sameSale = await Transaction.findOne({
          createdAt: toDate(createdAt),
          total,
          tillId: tillObjectId,
          location: normalizedLocation,
        });
        if (sameSale) {
          await ensureSaleEffects(sameSale, mappedItems, tillObjectId);
          return duplicateResponse(res, sameSale);
        }
      }

      const createdAtDate = toDate(createdAt);
      const transaction = new Transaction({
        ...(context.externalId && { externalId: context.externalId }),
        dedupeKey: context.dedupeKey,
        ...(hasSingleTender && { tenderType }),
        ...(hasMultiplePayments && { tenderPayments: storedTenderPayments }),
        amountPaid: amountPaid || total,
        subtotal: subtotal || total - tax,
        tax: tax || 0,
        total,
        staff: toObjectId(staffId),
        staffName: staffName || 'Unknown',
        location: normalizedLocation,
        locationId: toObjectId(locationId),
        device,
        tableName,
        discount: discount || 0,
        customerId: toObjectId(customerId),
        customerName,
        creditStatus: isCreditTransaction ? 'open' : 'none',
        creditCustomerId: toObjectId(customerId),
        creditCustomerName: customerName || '',
        creditOriginalTotal: isCreditTransaction ? Number(total || 0) : 0,
        creditPaidAmount: isCreditTransaction ? Number(amountPaid || 0) : 0,
        creditBalance: isCreditTransaction ? Math.max(0, Number(total || 0) - Number(amountPaid || 0)) : 0,
        creditDueDate: creditDueDate ? new Date(creditDueDate) : null,
        creditNotes: creditNotes || '',
        status: normalizedStatus,
        subStatus: context.subStatus,
        change: change || 0,
        items: mappedItems,
        transactionType: 'pos',
        createdAt: createdAtDate,
        heldAt: isHeldTransaction ? createdAtDate : null,
        completedAt: context.completedAt || null,
        tillId: tillObjectId,
        originalOfflineTillId: originalOfflineTillId || null,
        tillLinkMissing: Boolean(originalOfflineTillId && !tillObjectId && isCompletedTransaction),
        appliedEditIds: context.appliedEditIds || [],
        syncedByStaffId,
        ...(heldByStaffName && { heldByStaffName }),
        ...(toObjectId(heldByStaffId) && { heldByStaffId: toObjectId(heldByStaffId) }),
        ...(incrementAmount && { incrementAmount }),
        ...(incrementName && { incrementName }),
        ...(discountName && { discountName }),
        ...(appliedPromotion && { appliedPromotion }),
        ...(promotionValueType && { promotionValueType }),
        ...(customerType && { customerType }),
        ...(salesChannel && { salesChannel }),
        ...(sourceOrderId && { sourceOrderId }),
        ...(sourceOrderType && { sourceOrderType }),
        ...(sourceSiteKey && { sourceSiteKey }),
      });

      const savedTransaction = await transaction.save();

      if (tillObjectId && isCompletedTransaction) {
        try {
          const totals = await linkTransactionToTill(tillObjectId, savedTransaction._id);
          if (!totals) console.warn(`Till ${tillObjectId} not found - sale ${savedTransaction._id} not linked`);
        } catch (tillErr) {
          console.warn('Failed to link transaction to till:', tillErr.message);
        }
      }

      if (isStockAffectingTransaction) {
        try {
          await applySaleInventoryOnce(savedTransaction._id, mappedItems);
        } catch (updateErr) {
          console.error('Failed to update product quantities:', updateErr.message);
        }

        if (isCompletedTransaction) {
          try {
            await markRoomsFromTransaction(mappedItems, savedTransaction, ROOM_STATUSES.RESERVED);
          } catch (roomOccupancyErr) {
            console.warn('Failed to update room occupancy:', roomOccupancyErr.message);
          }
        }
      }

      if (isCreditTransaction && savedTransaction.creditCustomerId) {
        await recalculateCustomerCreditBalance(savedTransaction.creditCustomerId);
      }

      if (isStockAffectingTransaction) {
        await recordPromotionUse(appliedPromotion);
      }

      return res.status(201).json({
        success: true,
        message: 'Transaction saved successfully',
        transactionId: savedTransaction._id,
        data: { id: savedTransaction._id, total: savedTransaction.total },
      });
    };

    // ------------------------------------------------------------------
    // EDIT FLOW: resume a held sale or re-save a recalled sale
    // ------------------------------------------------------------------
    if (editTransactionId) {
      const editId = String(editTransactionId);
      let existingTransaction = mongoose.Types.ObjectId.isValid(editId)
        ? await Transaction.findById(editId)
        : await Transaction.findOne({ externalId: editId });

      // The held order was paid before its hold record reached the server (the hold
      // was still in the offline queue). Record the sale under the hold's id so the
      // queued hold is recognised as already done when it syncs.
      if (!existingTransaction && (!mongoose.Types.ObjectId.isValid(editId) || recallSourceStatus === 'held')) {
        return createTransaction({
          ...buildCreateContext(),
          externalId: editId,
          dedupeKey: editId,
          subStatus: null,
          completedAt: isHeldTransaction ? null : new Date(),
          appliedEditIds: externalId && externalId !== editId ? [String(externalId)] : [],
        });
      }

      if (!existingTransaction) {
        return res.status(404).json({
          success: false,
          code: 'EDIT_TARGET_NOT_FOUND',
          message: 'The original sale for this edit was not found on the server. It can be saved as a new sale instead.',
        });
      }

      // Each payment attempt carries its own client id; holds reuse the order id, so they are excluded.
      const editClientId = !isHeldTransaction && externalId && String(externalId) !== String(existingTransaction.externalId || '')
        ? String(externalId)
        : null;

      if (editClientId && (existingTransaction.appliedEditIds || []).includes(editClientId)) {
        await ensureSaleEffects(existingTransaction, existingTransaction.items, tillObjectId);
        return duplicateResponse(res, existingTransaction, 'Edit already applied');
      }

      // A hold that was queued offline must never re-open a sale that has since been paid.
      if (
        isHeldTransaction &&
        existingTransaction.status !== 'held' &&
        existingTransaction.completedAt &&
        toDate(clientUpdatedAt, new Date(0)) <= existingTransaction.completedAt
      ) {
        return res.status(200).json({
          success: true,
          ignored: true,
          reason: 'already-completed',
          message: 'This held order was already paid. The older hold was ignored.',
          transactionId: existingTransaction._id,
        });
      }

      const oldStatus = existingTransaction.status;
      const oldWasCompleted = oldStatus === 'completed';
      const oldAffectedStock = STOCK_STATUSES.includes(oldStatus);
      const oldItems = existingTransaction.items || [];
      const oldTillId = existingTransaction.tillId ? String(existingTransaction.tillId) : null;
      const oldCreditCustomerId = existingTransaction.creditCustomerId;
      const completingHeldSale = oldStatus === 'held' && !isHeldTransaction;

      // Claim the held sale so two tills cannot both take payment for it.
      if (completingHeldSale) {
        const claimed = await Transaction.findOneAndUpdate(
          { _id: existingTransaction._id, status: 'held' },
          {
            $set: { status: normalizedStatus, updatedAt: new Date() },
            ...(editClientId ? { $addToSet: { appliedEditIds: editClientId } } : {}),
          },
          { new: true }
        );

        if (!claimed) {
          const latest = await Transaction.findById(existingTransaction._id);
          if (editClientId && (latest?.appliedEditIds || []).includes(editClientId)) {
            await ensureSaleEffects(latest, latest.items, tillObjectId);
            return duplicateResponse(res, latest, 'Edit already applied');
          }
          return res.status(409).json({
            success: false,
            code: 'HELD_ALREADY_COMPLETED',
            message: 'This held order was already completed on another till.',
            transactionId: existingTransaction._id,
          });
        }
        existingTransaction = claimed;
      }

      if (oldAffectedStock) {
        await restockSaleInventoryOnce(existingTransaction._id, oldItems);
      }

      const newTillId = tillObjectId ? String(tillObjectId) : oldTillId;
      const newTotal = Number(total || 0);

      existingTransaction.items = mappedItems;
      existingTransaction.total = newTotal;
      existingTransaction.subtotal = subtotal || (newTotal - Number(tax || 0));
      existingTransaction.tax = Number(tax || 0);
      existingTransaction.discount = Number(discount || 0);
      existingTransaction.amountPaid = amountPaid || newTotal;
      existingTransaction.change = Number(change || 0);
      existingTransaction.staff = toObjectId(staffId) || existingTransaction.staff || null;
      existingTransaction.staffName = staffName || existingTransaction.staffName || 'POS Staff';
      existingTransaction.location = normalizedLocation;
      existingTransaction.locationId = toObjectId(locationId) || existingTransaction.locationId || null;
      existingTransaction.device = device || existingTransaction.device;
      existingTransaction.tableName = tableName || existingTransaction.tableName;
      existingTransaction.customerName = customerName || existingTransaction.customerName;
      existingTransaction.customerId = toObjectId(customerId) || existingTransaction.customerId || null;
      existingTransaction.status = normalizedStatus;
      existingTransaction.creditStatus = isCreditTransaction
        ? existingTransaction.creditStatus === 'paid' ? 'paid' : 'open'
        : existingTransaction.creditStatus || 'none';
      existingTransaction.creditCustomerId = toObjectId(customerId) || existingTransaction.creditCustomerId || null;
      existingTransaction.creditCustomerName = customerName || existingTransaction.creditCustomerName || '';
      existingTransaction.creditOriginalTotal = isCreditTransaction ? newTotal : existingTransaction.creditOriginalTotal || 0;
      existingTransaction.creditPaidAmount = isCreditTransaction ? Number(amountPaid || 0) : existingTransaction.creditPaidAmount || 0;
      existingTransaction.creditBalance = isCreditTransaction ? Math.max(0, newTotal - Number(amountPaid || 0)) : existingTransaction.creditBalance || 0;
      existingTransaction.creditDueDate = creditDueDate ? new Date(creditDueDate) : existingTransaction.creditDueDate || null;
      existingTransaction.creditNotes = creditNotes || existingTransaction.creditNotes || '';
      existingTransaction.tillId = newTillId ? toObjectId(newTillId) : existingTransaction.tillId;
      existingTransaction.incrementAmount = Number(incrementAmount || 0);
      existingTransaction.incrementName = incrementName || '';
      existingTransaction.discountName = discountName || '';
      existingTransaction.appliedPromotion = appliedPromotion;
      existingTransaction.promotionValueType = promotionValueType || null;
      existingTransaction.customerType = customerType || null;
      existingTransaction.salesChannel = salesChannel || existingTransaction.salesChannel || 'POS';
      existingTransaction.sourceOrderId = sourceOrderId || existingTransaction.sourceOrderId || '';
      existingTransaction.sourceOrderType = sourceOrderType || existingTransaction.sourceOrderType || '';
      existingTransaction.sourceSiteKey = sourceSiteKey || existingTransaction.sourceSiteKey || '';
      existingTransaction.syncedByStaffId = syncedByStaffId || existingTransaction.syncedByStaffId || null;
      existingTransaction.updatedAt = new Date();
      if (heldByStaffName) existingTransaction.heldByStaffName = heldByStaffName;
      if (toObjectId(heldByStaffId)) existingTransaction.heldByStaffId = toObjectId(heldByStaffId);

      if (completingHeldSale) {
        // A held sale counts on the day it is paid, so it lines up with the till that took the money.
        existingTransaction.heldAt = existingTransaction.heldAt || existingTransaction.createdAt;
        existingTransaction.createdAt = toDate(createdAt);
        existingTransaction.completedAt = new Date();
        existingTransaction.subStatus = null;
      } else if (isHeldTransaction && oldStatus === 'held') {
        existingTransaction.heldAt = existingTransaction.heldAt || existingTransaction.createdAt;
        existingTransaction.subStatus = null;
      } else {
        existingTransaction.subStatus = subStatus || 'edited';
      }

      if (hasMultiplePayments) {
        existingTransaction.tenderPayments = storedTenderPayments;
        existingTransaction.tenderType = null;
      } else {
        existingTransaction.tenderType = tenderType || null;
        existingTransaction.tenderPayments = [];
      }

      if (editClientId && !completingHeldSale) {
        existingTransaction.appliedEditIds = Array.from(
          new Set([...(existingTransaction.appliedEditIds || []), editClientId])
        );
      }

      await existingTransaction.save();

      // Till links: take the sale off the old till if it moved or is no longer a sale,
      // then (re)link it to the till that took payment. Totals are rebuilt each time.
      if (oldWasCompleted && oldTillId && (!isCompletedTransaction || oldTillId !== newTillId)) {
        await unlinkTransactionFromTill(oldTillId, existingTransaction._id);
      }
      if (isCompletedTransaction && newTillId) {
        await linkTransactionToTill(newTillId, existingTransaction._id);
      }

      if (oldWasCompleted) {
        try {
          await releaseRoomsFromTransaction(oldItems, existingTransaction);
        } catch (roomReleaseErr) {
          console.warn('Failed to release existing room booking state:', roomReleaseErr.message);
        }
      }

      if (isStockAffectingTransaction) {
        await applySaleInventoryOnce(existingTransaction._id, mappedItems);

        if (isCompletedTransaction) {
          try {
            await markRoomsFromTransaction(mappedItems, existingTransaction, ROOM_STATUSES.RESERVED);
          } catch (roomOccupancyErr) {
            console.warn('Failed to update room occupancy for edited transaction:', roomOccupancyErr.message);
          }
        }
      }

      if (isCreditTransaction || oldStatus === 'credit') {
        await recalculateCustomerCreditBalance(existingTransaction.creditCustomerId || oldCreditCustomerId);
      }

      // A held order paid now is a new use of its promotion; edits of finished sales are not.
      if (completingHeldSale && isStockAffectingTransaction) {
        await recordPromotionUse(appliedPromotion);
      }

      return res.status(200).json({
        success: true,
        message: completingHeldSale ? 'Held order completed' : 'Transaction edited successfully',
        edited: true,
        transactionId: existingTransaction._id,
        transaction: {
          id: existingTransaction._id,
          status: existingTransaction.status,
          subStatus: existingTransaction.subStatus,
          total: existingTransaction.total,
        },
      });
    }

    // ------------------------------------------------------------------
    // NEW RECORD
    // ------------------------------------------------------------------
    return createTransaction(buildCreateContext());

  } catch (error) {
    if (error?.code === 11000 && (error?.keyPattern?.externalId || error?.keyPattern?.dedupeKey)) {
      return res.status(200).json({
        success: true,
        message: 'Transaction already exists (duplicate prevented)',
        duplicate: true,
      });
    }
    console.error('Error saving transaction:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to save transaction',
      message: error.message,
    });
  }
}
