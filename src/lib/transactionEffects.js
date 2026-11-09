import { ROOM_STATUSES } from '@/src/lib/roomReservations';
import { markRoomsFromTransaction } from '@/src/lib/roomAvailability';
import { applySaleInventoryOnce, linkTransactionToTill } from '@/src/lib/tillLedger';

/**
 * Applies the stock and room effects of a completed sale. Safe to call on
 * retries: stock is only deducted once per transaction.
 */
export async function applyCompletedTransactionEffects(transaction, items, isCompletedTransaction) {
  if (!isCompletedTransaction) {
    return { applied: false };
  }

  await markRoomsFromTransaction(items, transaction, ROOM_STATUSES.RESERVED);

  const applied = await applySaleInventoryOnce(transaction._id, items);
  if (applied) {
    transaction.inventoryUpdated = true;
  }

  return { applied, roomsApplied: true };
}

/**
 * Links a completed sale to its till and rebuilds the till totals from its
 * sales. Linking the same sale twice has no effect.
 */
export async function linkCompletedTransactionToTill({ transaction, tillId, isCompletedTransaction }) {
  if (!tillId || !isCompletedTransaction) {
    return { linked: false };
  }

  const totals = await linkTransactionToTill(tillId, transaction._id);
  if (!totals) {
    throw new Error(`Till ${tillId} not found for completed transaction`);
  }

  return { linked: true, totals };
}
