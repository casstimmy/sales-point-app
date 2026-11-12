/**
 * The one place a POS cart is priced. The cart lines, the totals box, held
 * orders, the payment screen, saved sales and receipts all use this, so the
 * numbers on screen, on the receipt and in the reports always agree.
 *
 * Order of operations per line:
 *   price x quantity  ->  minus the staff's line discount  ->  customer promotion
 * Promotion amounts are rounded to whole naira so totals never carry kobo that
 * the cashier cannot key in.
 */

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const wholeNaira = (value) => Math.round(toNumber(value));

export function doesPromotionApplyToItem(promotion, item) {
  if (!promotion || promotion.active === false) return false;
  if (promotion.applicationType === "ALL_PRODUCTS") return true;

  if (promotion.applicationType === "ONE_PRODUCT") {
    const targetIds = (promotion.products || []).map((p) => String(p?._id || p));
    return targetIds.includes(String(item?.id || item?.productId));
  }

  if (promotion.applicationType === "CATEGORY") {
    const targetCategoryIds = (promotion.categories || []).map((c) => String(c?._id || c));
    return targetCategoryIds.includes(String(item?.category?._id || item?.category || ""));
  }

  return false;
}

/** Largest line discount a staff member may give: the whole line, never more. */
export function getMaxLineDiscount(item) {
  return Math.max(0, wholeNaira(toNumber(item?.price) * toNumber(item?.quantity)));
}

export function priceCart(cart = {}) {
  const items = Array.isArray(cart.items) ? cart.items : [];

  // An online order already has its discount inside the total; don't stack a POS promotion on it.
  const hasPreAppliedDiscount = Boolean(cart.onlineOrder?.id) && toNumber(cart.onlineOrder?.discount) > 0;
  const promotion = !hasPreAppliedDiscount && cart.appliedPromotion && cart.appliedPromotion.active !== false
    ? cart.appliedPromotion
    : null;
  const isIncrease = promotion?.valueType === "INCREMENT";
  const promoValue = toNumber(promotion?.discountValue);

  const lines = items.map((item) => {
    const quantity = Math.max(0, toNumber(item.quantity));
    const unitPrice = toNumber(item.price);
    const gross = wholeNaira(unitPrice * quantity);
    const lineDiscount = Math.min(Math.max(0, wholeNaira(item.discount)), gross);
    const afterLineDiscount = gross - lineDiscount;
    const promoApplies = Boolean(promotion) && doesPromotionApplyToItem(promotion, item);

    let promoAdjustment = 0;
    if (promoApplies && promoValue > 0) {
      let amount = 0;
      if (promotion.discountType === "PERCENTAGE") {
        amount = wholeNaira((afterLineDiscount * promoValue) / 100);
      } else if (promotion.discountType === "FIXED" && promotion.fixedAmountApplyMode !== "TOTAL") {
        amount = wholeNaira(promoValue * quantity);
      }
      promoAdjustment = isIncrease ? amount : -Math.min(amount, afterLineDiscount);
    }

    return {
      id: item.id,
      quantity,
      unitPrice,
      gross,
      lineDiscount,
      promoApplies,
      promoAdjustment,
      lineTotal: afterLineDiscount + promoAdjustment,
    };
  });

  // FIXED + TOTAL promotions apply once to the order, against the lines they cover.
  let orderPromoAdjustment = 0;
  if (promotion && promotion.discountType === "FIXED" && promotion.fixedAmountApplyMode === "TOTAL" && promoValue > 0) {
    const qualifyingTotal = lines.filter((line) => line.promoApplies).reduce((sum, line) => sum + line.lineTotal, 0);
    if (lines.some((line) => line.promoApplies)) {
      orderPromoAdjustment = isIncrease ? wholeNaira(promoValue) : -Math.min(wholeNaira(promoValue), qualifyingTotal);
    }
  }

  const subtotal = lines.reduce((sum, line) => sum + line.gross, 0);
  const itemDiscountTotal = lines.reduce((sum, line) => sum + line.lineDiscount, 0);
  const promoAdjustmentTotal = lines.reduce((sum, line) => sum + line.promoAdjustment, 0) + orderPromoAdjustment;
  const promoDiscountTotal = Math.max(0, -promoAdjustmentTotal);
  const incrementAmount = Math.max(0, promoAdjustmentTotal);
  const discountAmount = itemDiscountTotal + promoDiscountTotal;
  const total = Math.max(0, subtotal - discountAmount + incrementAmount);

  let discountName = "";
  if (promoDiscountTotal > 0 && itemDiscountTotal > 0) discountName = `${promotion.name || "Promotion"} + item discount`;
  else if (promoDiscountTotal > 0) discountName = promotion.name || "Promotion";
  else if (itemDiscountTotal > 0) discountName = "Item discount";

  return {
    lines,
    linesById: Object.fromEntries(lines.map((line) => [String(line.id), line])),
    subtotal,
    itemDiscountTotal,
    promoDiscountTotal,
    orderPromoAdjustment,
    discountAmount,
    discountName,
    incrementAmount,
    incrementName: incrementAmount > 0 ? promotion?.name || "Additional charge" : "",
    promotionValueType: promotion && promoAdjustmentTotal !== 0 ? promotion.valueType : null,
    promotionApplied: Boolean(promotion) && promoAdjustmentTotal !== 0,
    discountedSubtotal: total,
    tax: 0,
    total,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/**
 * Sale lines as they are saved: original price, the staff line discount, the
 * promotion adjustment and the net amount. The receipt lists lines at full price
 * and shows the discount once in the totals, so the net figure is kept as
 * `netTotal` (not `lineTotal`, which the receipt would print per line).
 */
export function toSaleItems(cart, pricing = priceCart(cart)) {
  return (cart.items || []).map((item) => {
    const line = pricing.linesById[String(item.id)] || {};
    return {
      productId: item.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      price: item.price,
      discount: line.lineDiscount || 0,
      promoAdjustment: line.promoAdjustment || 0,
      netTotal: line.lineTotal ?? wholeNaira(toNumber(item.price) * toNumber(item.quantity)),
    };
  });
}
