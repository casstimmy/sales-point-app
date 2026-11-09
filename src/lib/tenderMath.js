/**
 * Tender maths shared by the server (till ledger) and the POS screens.
 * No database imports here so it can run in the browser too.
 */

const CASH_TENDER_PATTERN = /cash/i;

export const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

/**
 * Turns the tenders on a sale into the amounts actually applied to the sale.
 *
 * Older POS builds stored the amount handed over (a 5,000 note for a 3,500
 * sale), which overstated cash by the change given. Any excess over the sale
 * total is taken back off cash tenders first, then off the last tenders.
 */
export function getAppliedTenderEntries(transaction = {}) {
  const total = roundMoney(transaction.total);
  const payments = Array.isArray(transaction.tenderPayments) ? transaction.tenderPayments : [];

  let entries = payments.length > 0
    ? payments.map((payment) => ({
        name: String(payment?.tenderName || 'CASH').trim() || 'CASH',
        amount: roundMoney(payment?.amount),
      }))
    : [{ name: String(transaction.tenderType || 'CASH').trim() || 'CASH', amount: total }];

  entries = entries.filter((entry) => entry.amount > 0);
  if (entries.length === 0) {
    return total > 0 ? [{ name: String(transaction.tenderType || 'CASH'), amount: total }] : [];
  }

  let excess = roundMoney(entries.reduce((sum, entry) => sum + entry.amount, 0) - total);
  if (excess > 0) {
    const reductionOrder = entries
      .map((entry, index) => ({ index, isCash: CASH_TENDER_PATTERN.test(entry.name) }))
      .sort((left, right) => {
        if (left.isCash !== right.isCash) return left.isCash ? -1 : 1;
        return right.index - left.index;
      });

    for (const { index } of reductionOrder) {
      if (excess <= 0) break;
      const reduction = Math.min(entries[index].amount, excess);
      entries[index].amount = roundMoney(entries[index].amount - reduction);
      excess = roundMoney(excess - reduction);
    }
  }

  const merged = new Map();
  entries
    .filter((entry) => entry.amount > 0)
    .forEach((entry) => merged.set(entry.name, roundMoney((merged.get(entry.name) || 0) + entry.amount)));

  return Array.from(merged.entries()).map(([name, amount]) => ({ name, amount }));
}

/**
 * Normalises incoming tender payments before they are stored: `amount` becomes
 * the applied amount and `tendered` keeps what the customer handed over.
 */
export function normalizeTenderPaymentsForStorage({ tenderPayments, tenderType, total }) {
  if (!Array.isArray(tenderPayments) || tenderPayments.length === 0) return tenderPayments;

  const applied = getAppliedTenderEntries({ tenderPayments, tenderType, total });
  const remainingByName = new Map(applied.map((entry) => [entry.name, entry.amount]));

  return tenderPayments.map((payment) => {
    const name = String(payment?.tenderName || 'CASH').trim() || 'CASH';
    const tendered = roundMoney(payment?.tendered ?? payment?.amount);
    const available = remainingByName.get(name) || 0;
    const amount = Math.min(tendered, available);
    remainingByName.set(name, roundMoney(available - amount));
    return { ...payment, tenderName: name, tendered, amount: roundMoney(amount) };
  });
}

/** Picks the tender that holds the opening float: the first configured cash tender. */
export function findCashTenderName(tenderNames = [], tenderBreakdown = {}) {
  return [...tenderNames, ...Object.keys(tenderBreakdown || {})]
    .find((name) => CASH_TENDER_PATTERN.test(String(name || ''))) || 'CASH';
}

/**
 * Expected amount per tender at close: sales on that tender, plus the opening
 * float on the cash tender (the float sits in the cash drawer).
 */
export function buildExpectedByTender(tenderBreakdown = {}, openingBalance = 0, tenderNames = []) {
  const expected = { ...tenderBreakdown };
  const float = roundMoney(openingBalance);
  if (float <= 0) return expected;

  const cashKey = findCashTenderName(tenderNames, tenderBreakdown);
  expected[cashKey] = roundMoney((expected[cashKey] || 0) + float);
  return expected;
}
