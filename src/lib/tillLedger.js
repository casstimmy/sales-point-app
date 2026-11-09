/**
 * Till ledger
 *
 * One place that decides what a till's numbers are. Totals are always rebuilt
 * from the completed sales linked to the till, so the till screen, the close
 * screen, the end-of-day report and the admin reports all agree.
 *
 * Also owns the "do this stock change exactly once" claims, so retries and
 * double clicks can never deduct or restock inventory twice.
 */

import mongoose from 'mongoose';
import Till from '@/src/models/Till';
import EndOfDayReport from '@/src/models/EndOfDayReport';
import { Transaction } from '@/src/models/Transactions';
import { updateInventoryForSale, reverseInventoryForRefund } from '@/src/lib/syncPackQty';
import {
  buildExpectedByTender,
  findCashTenderName,
  getAppliedTenderEntries,
  normalizeTenderPaymentsForStorage,
  roundMoney,
} from '@/src/lib/tenderMath';

export {
  buildExpectedByTender,
  findCashTenderName,
  getAppliedTenderEntries,
  normalizeTenderPaymentsForStorage,
  roundMoney,
};

export const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const asString = String(value?._id || value);
  return mongoose.Types.ObjectId.isValid(asString) ? new mongoose.Types.ObjectId(asString) : null;
};

const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toJSON === 'function') {
    const json = value.toJSON();
    if (json && typeof json === 'object') return { ...json };
  }
  return { ...value };
};

async function refreshClosedTillReport(till, totals) {
  const report = await EndOfDayReport.findOne({ tillId: till._id });
  const counted = toPlainObject(report?.tenderActual || {});
  const expectedByTender = buildExpectedByTender(totals.tenderBreakdown, till.openingBalance, Object.keys(counted));

  const tenderVariances = {};
  Object.entries(counted).forEach(([name, countedAmount]) => {
    const expectedAmount = roundMoney(expectedByTender[name] || 0);
    tenderVariances[name] = {
      processed: roundMoney(totals.tenderBreakdown[name] || 0),
      counted: roundMoney(countedAmount),
      variance: roundMoney(Number(countedAmount || 0) - expectedAmount),
    };
  });

  const expectedClosingBalance = roundMoney(Number(till.openingBalance || 0) + totals.totalSales);
  const physicalCount = roundMoney(
    report?.physicalCount ?? till.physicalCount ?? Object.values(counted).reduce((sum, value) => sum + Number(value || 0), 0)
  );
  const variance = roundMoney(physicalCount - expectedClosingBalance);
  const variancePercentage = expectedClosingBalance > 0 ? (variance / expectedClosingBalance) * 100 : 0;

  await Till.updateOne(
    { _id: till._id },
    { $set: { expectedClosingBalance, variance, tenderVariances } }
  );

  if (!report) return false;

  report.totalSales = totals.totalSales;
  report.transactionCount = totals.transactionCount;
  report.tenderBreakdown = new Map(Object.entries(totals.tenderBreakdown));
  report.tenderVariances = new Map(Object.entries(tenderVariances));
  report.expectedClosingBalance = expectedClosingBalance;
  report.variance = variance;
  report.variancePercentage = variancePercentage;
  report.status = Math.abs(variance) < 0.01 ? 'RECONCILED' : 'VARIANCE_NOTED';
  report.updatedAt = new Date();
  await report.save();
  return true;
}

/**
 * Rebuilds totalSales, transactionCount and tenderBreakdown for a till from
 * its completed sales. If the till is already closed, its reconciliation and
 * end-of-day report are refreshed too (late sync, refunds, edits).
 */
export async function recalculateTillTotals(tillId) {
  const id = toObjectId(tillId);
  if (!id) return null;

  const till = await Till.findById(id).lean();
  if (!till) return null;

  const linkedIds = (till.transactions || []).map(toObjectId).filter(Boolean);
  const sales = linkedIds.length
    ? await Transaction.find({ _id: { $in: linkedIds }, status: 'completed' })
        .select('total tenderType tenderPayments')
        .lean()
    : [];

  const tenderBreakdown = {};
  let totalSales = 0;
  for (const sale of sales) {
    totalSales = roundMoney(totalSales + Number(sale.total || 0));
    for (const entry of getAppliedTenderEntries(sale)) {
      tenderBreakdown[entry.name] = roundMoney((tenderBreakdown[entry.name] || 0) + entry.amount);
    }
  }

  const totals = { totalSales, transactionCount: sales.length, tenderBreakdown };

  await Till.updateOne({ _id: id }, { $set: totals });

  let reportAdjusted = false;
  if (till.status === 'CLOSED') {
    reportAdjusted = await refreshClosedTillReport(till, totals);
  }

  return { ...totals, tillId: String(id), status: till.status, openingBalance: till.openingBalance || 0, reportAdjusted };
}

export async function linkTransactionToTill(tillId, transactionId) {
  const tillObjectId = toObjectId(tillId);
  const transactionObjectId = toObjectId(transactionId);
  if (!tillObjectId || !transactionObjectId) return null;

  const result = await Till.updateOne(
    { _id: tillObjectId },
    { $addToSet: { transactions: transactionObjectId } }
  );
  if (!result.matchedCount) return null;
  return recalculateTillTotals(tillObjectId);
}

export async function unlinkTransactionFromTill(tillId, transactionId) {
  const tillObjectId = toObjectId(tillId);
  const transactionObjectId = toObjectId(transactionId);
  if (!tillObjectId || !transactionObjectId) return null;

  await Till.updateOne(
    { _id: tillObjectId },
    { $pull: { transactions: transactionObjectId } }
  );
  return recalculateTillTotals(tillObjectId);
}

const toInventoryItems = (items = []) =>
  (items || []).map((item) => ({
    ...item,
    productId: item.productId || item.id,
    qty: Number(item.qty ?? item.quantity ?? 0),
  }));

/**
 * Deducts stock for a sale exactly once. The flag is claimed atomically before
 * stock moves, so concurrent retries cannot both deduct.
 */
export async function applySaleInventoryOnce(transactionId, items) {
  const id = toObjectId(transactionId);
  if (!id) return false;

  const claimed = await Transaction.findOneAndUpdate(
    { _id: id, inventoryUpdated: { $ne: true } },
    { $set: { inventoryUpdated: true, inventoryRestockedAt: null } },
    { projection: { _id: 1 } }
  );
  if (!claimed) return false;

  try {
    await updateInventoryForSale(toInventoryItems(items));
    return true;
  } catch (error) {
    await Transaction.updateOne({ _id: id }, { $set: { inventoryUpdated: false } });
    throw error;
  }
}

/** Puts stock back for a sale exactly once (refunds, edits, voids). */
export async function restockSaleInventoryOnce(transactionId, items) {
  const id = toObjectId(transactionId);
  if (!id) return false;

  const claimed = await Transaction.findOneAndUpdate(
    { _id: id, inventoryUpdated: true },
    { $set: { inventoryUpdated: false, inventoryRestockedAt: new Date() } },
    { projection: { _id: 1 } }
  );
  if (!claimed) return false;

  try {
    await reverseInventoryForRefund(toInventoryItems(items));
    return true;
  } catch (error) {
    await Transaction.updateOne({ _id: id }, { $set: { inventoryUpdated: true, inventoryRestockedAt: null } });
    throw error;
  }
}
