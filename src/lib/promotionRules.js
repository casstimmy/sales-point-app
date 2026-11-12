/**
 * Which customer promotion applies, shared by the POS screens and the
 * /api/promotions endpoint so both agree. No database imports.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Admin saves the end date from a date picker, which arrives as midnight at the
 * START of that day. A promotion ending "12 Nov" must still run all of 12 Nov,
 * so a date-only end date counts to the end of that day.
 */
export function getPromotionEndsAt(endDate) {
  const end = toDate(endDate);
  if (!end) return null;
  const isDateOnly =
    end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0 && end.getUTCMilliseconds() === 0;
  return isDateOnly ? new Date(end.getTime() + DAY_MS - 1) : end;
}

export function isPromotionUsableNow(promotion, now = new Date()) {
  if (!promotion || promotion.active === false) return false;

  const maxUses = Number(promotion.maxUses || 0);
  if (maxUses > 0 && Number(promotion.timesUsed || 0) >= maxUses) return false;

  if (promotion.indefinite) return true;

  const start = toDate(promotion.startDate);
  if (start && now < start) return false;

  const end = getPromotionEndsAt(promotion.endDate);
  if (end && now > end) return false;

  return true;
}

const normalizeType = (value) => String(value || "").trim().toUpperCase();

/**
 * The promotion for a customer: usable today, aimed at their customer type,
 * highest priority first (then the most recently created).
 */
export function pickPromotionForCustomer(promotions = [], customer, now = new Date()) {
  const customerType = normalizeType(customer?.type);
  if (!customerType) return null;

  const candidates = (Array.isArray(promotions) ? promotions : []).filter(
    (promotion) =>
      isPromotionUsableNow(promotion, now) &&
      (promotion.targetCustomerTypes || []).map(normalizeType).includes(customerType)
  );

  candidates.sort((left, right) => {
    const byPriority = Number(right.priority || 0) - Number(left.priority || 0);
    if (byPriority !== 0) return byPriority;
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });

  return candidates[0] || null;
}

/** The parts of a promotion a sale needs to keep, so held or recalled sales price the same. */
export function toPromotionSnapshot(promotion) {
  if (!promotion) return null;
  const toId = (value) => String(value?._id || value || "");
  return {
    _id: toId(promotion),
    name: promotion.name || "Promotion",
    valueType: promotion.valueType || "DISCOUNT",
    discountType: promotion.discountType || "PERCENTAGE",
    discountValue: Number(promotion.discountValue || 0),
    fixedAmountApplyMode: promotion.fixedAmountApplyMode || "PER_ITEM",
    applicationType: promotion.applicationType || "ALL_PRODUCTS",
    products: (promotion.products || []).map(toId).filter(Boolean),
    categories: (promotion.categories || []).map(toId).filter(Boolean),
    targetCustomerTypes: promotion.targetCustomerTypes || [],
    active: true,
  };
}

/** Short label for buttons and banners, e.g. "10% off" or "₦500 off each". */
export function describePromotion(promotion) {
  if (!promotion) return "";
  const value = Number(promotion.discountValue || 0);
  const isIncrease = promotion.valueType === "INCREMENT";
  if (promotion.discountType === "PERCENTAGE") {
    return `${value}% ${isIncrease ? "extra" : "off"}`;
  }
  const amount = `₦${value.toLocaleString("en-NG")}`;
  const scope = promotion.fixedAmountApplyMode === "TOTAL" ? "on the order" : "each";
  return `${amount} ${isIncrease ? "added" : "off"} ${scope}`;
}
