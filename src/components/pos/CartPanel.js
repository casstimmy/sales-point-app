/**
 * CartPanel Component
 *
 * Persistent right checkout panel - table-based design with inline editing.
 *
 * Responsibilities:
 * - Display active cart/order line items in table format
 * - Show: Product name | Qty | Each price | Total
 * - Inline quantity controls when item is selected
 * - Per-item discount and notes
 * - Delete item functionality
 * - Cart-level calculations (discount, tax)
 * - Action buttons: MISC PRODUCT, PRINT, NO SALE, QUICK ADD, PETTY CASH, ADJUST FLOAT, DELETE, HOLD, PAY
 * - Empty state when no items
 */

import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faMinus,
  faTrash,
  faStickyNote,
  faTag,
  faPrint,
  faBan,
  faTrashAlt,
  faClock,
  faMoneyBill,
  faChevronDown,
  faBoxOpen,
  faGripVertical,
} from "@fortawesome/free-solid-svg-icons";
import { useCart } from "../../context/CartContext";
import { useStaff } from "../../context/StaffContext";
import {
  saveTransactionOffline,
  getOnlineStatus,
  syncPendingTransactions,
} from "../../lib/offlineSync";
import {
  printTransactionReceipt,
  getReceiptSettings,
} from "../../lib/receiptPrinting";
import PaymentModal from "./PaymentModal";
import ThankYouNote from "./ThankYouNote";
import AdjustFloatModal from "./AdjustFloatModal";

export default function CartPanel() {
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [prevItemsLength, setPrevItemsLength] = useState(0);
  const selectedItemRef = useRef(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [showAdjustFloatModal, setShowAdjustFloatModal] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState({});
  const { staff, location, till } = useStaff(); // Get logged-in staff, location, and till
  const {
    activeCart,
    updateQuantity,
    removeItem,
    setItemDiscount,
    setItemNotes,
    setCartDiscount,
    calculateTotals,
    holdOrder,
    completeOrder,
    deleteCart,
  } = useCart();

  const totals = calculateTotals();
  const isEmpty = activeCart.items.length === 0;

  // Auto-highlight the last added item ONLY when a new item is added (not on deselect)
  useEffect(() => {
    const currentLength = activeCart.items.length;
    
    // Only auto-select if items were ADDED (length increased), not on deselect
    if (currentLength > prevItemsLength && currentLength > 0) {
      const lastItem = activeCart.items[currentLength - 1];
      setSelectedItemId(lastItem.id);
    }
    
    setPrevItemsLength(currentLength);
  }, [activeCart.items.length, prevItemsLength]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedItemId]);

  const handlePayment = async () => {
    if (isEmpty) {
      alert("Cart is empty. Add items to complete payment.");
      return;
    }
    // Show payment modal instead of processing immediately
    setShowPaymentModal(true);
  };

  const handlePrintCart = async () => {
    if (isEmpty) {
      alert("Cart is empty. Add items to print.");
      return;
    }

    try {
      // Create a temporary transaction object for printing
      const printTransaction = {
        items: activeCart.items.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        total: totals.total,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        tax: totals.tax,
        payment: {
          method: "CASH",
          amount: totals.total,
          change: 0,
        },
        staffId: staff?._id,
        staffName: staff?.name,
        locationId: location?._id,
        locationName: location?.name,
        tillId: till?._id,
        tillNumber: till?.number,
        timestamp: new Date(),
        _id: Date.now().toString(),
        status: "UNPAID", // Mark receipt as unpaid
      };

      // Get receipt settings
      const settings = receiptSettings || (await getReceiptSettings());
      setReceiptSettings(settings);

      // Print receipt (fire and forget)
      printTransactionReceipt(printTransaction, settings).catch(() => {
        // Ignore errors
      });
    } catch (error) {
      console.error("❌ Error printing receipt:", error);
      alert("Error printing receipt. Please try again.");
    }
  };

  const handlePaymentConfirm = async (paymentDetails) => {
    try {
      console.log("🔔 handlePaymentConfirm called");
      console.log("   Staff:", staff);
      console.log("   Location:", location);
      console.log("   Till from context:", till);
      console.log("   Till?._id:", till?._id);
      console.log("   Is till null?", till === null);
      console.log("   Is till undefined?", till === undefined);

      // Create transaction object matching schema
      const transaction = {
        items: activeCart.items.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity, // Maps to 'qty' in schema
          price: item.price, // Maps to 'salePriceIncTax' in schema
        })),
        total: totals.total, // Use 'total' from calculateTotals
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: activeCart.discountPercent || 0,
        amountPaid: paymentDetails.amountPaid, // Actual amount paid by customer
        change: paymentDetails.change, // Calculate change
        tenderType: paymentDetails.tenderType, // Primary tender type (legacy, for backwards compatibility)
        tenderPayments: paymentDetails.tenderPayments, // New: split payments array [{tenderId, tenderName, amount}]
        tenders: paymentDetails.tenders, // All tender breakdowns (for display)
        staffName: staff?.name || "Unknown Staff",
        staffId: staff?._id, // Include staff ObjectId
        location: location?.name || "Default Location", // Use store location from login
        device: "POS",
        tableName: null,
        customerName: activeCart.customer?.name,
        status: "completed", // Mark as completed after payment confirmation
        transactionType: "pos",
        createdAt: new Date().toISOString(),
        tillId: till?._id, // Link to till session by ID
      };

      console.log("💾 Transaction to save:", transaction);
      console.log("🔍 Totals:", {
        total: totals.total,
        subtotal: totals.subtotal,
        tax: totals.tax,
      });
      console.log("🔍 Payment details:", paymentDetails);
      console.log("🔍 Tender payments:", paymentDetails.tenderPayments);

      if (transaction.tillId) {
        console.log(
          `✅ Till ID included in transaction: ${transaction.tillId}`,
        );
      } else {
        console.warn(
          "⚠️ No Till ID in transaction - till may not be set in context",
        );
        console.warn("   Till is:", till);
      }

      // Send transaction directly if online, queue if offline
      if (getOnlineStatus()) {
        // Online: Send directly to server
        try {
          const response = await fetch("/api/transactions/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(transaction),
          });

          if (!response.ok) {
            console.warn("Failed to send transaction online, queuing for sync");
            await saveTransactionOffline(transaction);
          } else {
            console.log("✅ Transaction sent directly to server");
            // Still save to IndexedDB as backup
            await saveTransactionOffline(transaction);
          }
        } catch (err) {
          console.warn("Error sending transaction, queuing for sync:", err);
          await saveTransactionOffline(transaction);
        }
      } else {
        // Offline: Queue to IndexedDB
        console.log("🔴 Offline - Queuing transaction for sync");
        await saveTransactionOffline(transaction);
      }

      // Complete order (clear cart)
      completeOrder("CASH");

      // Hide modal
      setShowPaymentModal(false);

      // Show thank you modal immediately
      setShowThankYouModal(true);

      // Get receipt settings (use cached if available)
      const settings = receiptSettings || (await getReceiptSettings());
      setReceiptSettings(settings);

      // Print receipt asynchronously (fire and forget)
      const receiptTransaction = {
        ...transaction,
        _id: transaction._id || Date.now().toString(),
      };

      // Don't await printing - do it in background
      printTransactionReceipt(receiptTransaction, settings).catch(() => {
        // Ignore errors
      });

      // Sync if online (don't wait)
      const onlineStatus = getOnlineStatus();
      if (onlineStatus) {
        syncPendingTransactions().catch(() => {
          // Silently fail - user will see thank you modal
        });
      }
    } catch (error) {
      console.error("❌ Error processing payment:", error);
      alert("Error saving transaction. Please try again.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white touch-manipulation border-l border-neutral-200">
      {isEmpty ? (
        // Empty Cart State
        <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 p-4 text-center">
          <div className="text-6xl mb-3 opacity-40">🍽️</div>
          <div className="text-lg font-bold mb-1 text-neutral-600">
            Add a Dish or Drink
          </div>
          <div className="text-sm text-neutral-500">
            Tap a product to add to the bill
          </div>
          <div className="mt-6 w-24 h-0.5 bg-neutral-300 rounded-full"></div>
        </div>
      ) : (
        // Cart Content
        <>
          {/* Table Header */}
          <div className="bg-neutral-100 border-b border-neutral-300 sticky top-0 z-10">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-neutral-600 uppercase">
              <div className="col-span-5">Product</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-2 text-right">Each</div>
              <div className="col-span-3 text-right">Total</div>
            </div>
          </div>

          {/* Line Items */}
          <div className="flex-1 overflow-y-auto bg-white divide-y divide-neutral-200">
            {activeCart.items.map((item) => {
              // Calculate adjusted price if promotion is active
              let adjustedPrice = item.price;
              if (
                activeCart.appliedPromotion &&
                activeCart.appliedPromotion.active
              ) {
                if (activeCart.appliedPromotion.discountType === "PERCENTAGE") {
                  const percentChange =
                    activeCart.appliedPromotion.discountValue / 100;
                  if (activeCart.appliedPromotion.valueType === "INCREMENT") {
                    // INCREMENT increases the price
                    adjustedPrice = item.price * (1 + percentChange);
                  } else {
                    // DISCOUNT decreases the price
                    adjustedPrice = item.price * (1 - percentChange);
                  }
                } else if (
                  activeCart.appliedPromotion.discountType === "FIXED"
                ) {
                  // Fixed discount - apply to each item
                  if (activeCart.appliedPromotion.valueType === "INCREMENT") {
                    adjustedPrice =
                      item.price + activeCart.appliedPromotion.discountValue;
                  } else {
                    adjustedPrice = Math.max(
                      0,
                      item.price - activeCart.appliedPromotion.discountValue,
                    );
                  }
                }
              }
              const itemTotal =
                adjustedPrice * item.quantity - (item.discount || 0);
              const hasPromoAdjustment = adjustedPrice !== item.price;

              return (
                <div key={item.id}>
                  {/* Normal Item View */}
                  {selectedItemId !== item.id ? (
                    <div
                      onClick={() => setSelectedItemId(item.id)}
                      className="grid grid-cols-12 gap-1 px-3 py-3 items-center hover:bg-primary-50 cursor-pointer transition-colors duration-base"
                    >
                      <div className="col-span-5">
                        <div className="text-sm font-medium text-neutral-700 line-clamp-1">
                          {item.name}
                        </div>
                        {(item.discount > 0 || hasPromoAdjustment) && (
                          <div className="text-xs text-purple-600 mt-0.5 font-semibold">
                            {hasPromoAdjustment && (
                              <span>
                                {activeCart.appliedPromotion.valueType ===
                                "INCREMENT"
                                  ? "↑"
                                  : "↓"}{" "}
                                Promo
                              </span>
                            )}
                            {item.discount > 0 && (
                              <span className="ml-1">
                                -₦{item.discount.toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 text-center text-sm font-semibold text-neutral-900">
                        {item.quantity}
                      </div>
                      <div className="col-span-2 text-right">
                        {hasPromoAdjustment ? (
                          <div>
                            <div className="text-xs text-gray-400 line-through">
                              ₦{item.price.toLocaleString()}
                            </div>
                            <div
                              className={`text-sm font-semibold ${activeCart.appliedPromotion.valueType === "INCREMENT" ? "text-blue-600" : "text-green-600"}`}
                            >
                              ₦{Math.round(adjustedPrice).toLocaleString()}
                            </div>
                          </div>
                        ) : (
                          <div className="text-base text-neutral-600">
                            ₦{item.price.toLocaleString()}
                          </div>
                        )}
                      </div>
                      <div
                        className={`col-span-3 text-right text-base font-semibold ${hasPromoAdjustment ? (activeCart.appliedPromotion.valueType === "INCREMENT" ? "text-blue-700" : "text-green-700") : "text-neutral-900"}`}
                      >
                        ₦{Math.round(itemTotal).toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    // Selected Item View - Expanded with primary background
                    <div
                      ref={selectedItemRef}
                      className="bg-primary-500 text-white"
                    >
                      {/* Item Header with Price Info - All on one line */}
                      <div 
                        className="px-3 py-3 border-b border-primary-600 cursor-pointer hover:bg-primary-600 transition-colors"
                        onClick={() => setSelectedItemId(null)}
                      >
                        <div className="grid grid-cols-3 gap-2 items-center">
                          <div className="col-span-1">
                            <div className="text-xs font-bold line-clamp-1">
                              {item.name}
                            </div>
                          </div>
                          <div className="col-span-1 text-center">
                            <div className="opacity-80 text-xs">EACH</div>
                            {hasPromoAdjustment ? (
                              <div>
                                <div className="text-xs line-through opacity-70">
                                  ₦{item.price.toLocaleString()}
                                </div>
                                <div className="font-bold text-sm">
                                  ₦{Math.round(adjustedPrice).toLocaleString()}
                                </div>
                              </div>
                            ) : (
                              <div className="font-bold text-sm">
                                ₦{item.price.toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="col-span-1 text-right">
                            <div className="opacity-80 text-xs">TOTAL</div>
                            <div className="font-bold text-sm">
                              ₦{Math.round(itemTotal).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {hasPromoAdjustment && (
                          <div className="mt-2 text-xs text-blue-100 font-semibold">
                            {activeCart.appliedPromotion.valueType === "INCREMENT"
                              ? "↑ Price Increase"
                              : "↓ Discount Applied"}
                            {" "}({activeCart.appliedPromotion.discountValue}
                            {activeCart.appliedPromotion.discountType === "PERCENTAGE"
                              ? "%"
                              : "₦"}
                            )
                          </div>
                        )}
                      </div>

                      {/* Expanded Controls */}
                      <div 
                        className="px-3 py-2 space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Quantity Control - Center */}
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(
                                item.id,
                                Math.max(1, item.quantity - 1),
                              );
                            }}
                            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white text-primary-600 font-bold transition-colors duration-base hover:bg-neutral-100"
                          >
                            <FontAwesomeIcon
                              icon={faMinus}
                              className="w-4 h-4"
                            />
                          </button>
                          <div className="text-center w-10">
                            <div className="text-2xl font-bold">
                              {item.quantity}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(item.id, item.quantity + 1);
                            }}
                            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white text-primary-600 font-bold transition-colors duration-base hover:bg-neutral-100"
                          >
                            <FontAwesomeIcon
                              icon={faPlus}
                              className="w-4 h-4"
                            />
                          </button>
                        </div>

                        {/* Quantity Label */}
                        <div className="text-center text-xs font-semibold tracking-wider">
                          QTY
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-1.5 pt-1 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedItemId(
                                expandedItemId === item.id ? null : item.id,
                              );
                            }}
                            className="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white text-primary-600 font-bold hover:opacity-80 transition-opacity rounded-lg text-xs"
                          >
                            <FontAwesomeIcon
                              icon={faStickyNote}
                              className="w-3.5 h-3.5"
                            />
                            <span>NOTE</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemDiscount(
                                item.id,
                                (item.discount || 0) + 100,
                              );
                            }}
                            className="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white text-primary-600 font-bold hover:opacity-80 transition-opacity rounded-lg text-xs"
                          >
                            <FontAwesomeIcon icon={faTag} className="w-3.5 h-3.5" />
                            <span>DISC</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeItem(item.id);
                              setSelectedItemId(null);
                            }}
                            className="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white text-red-600 font-bold hover:opacity-80 transition-opacity rounded-lg text-xs"
                          >
                            <FontAwesomeIcon
                              icon={faTrashAlt}
                              className="w-4 h-4"
                            />
                            <span>DEL</span>
                          </button>
                        </div>

                        {/* Note Input */}
                        {expandedItemId === item.id && (
                          <div 
                            className="pt-3 border-t border-blue-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              placeholder="Add note..."
                              value={item.notes || ""}
                              onChange={(e) =>
                                setItemNotes(item.id, e.target.value)
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="w-full text-xs p-2 border border-blue-400 rounded bg-blue-600 text-white placeholder-blue-200 outline-none focus:ring-2 focus:ring-white"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Collapse Button */}
          <div className="bg-neutral-50 border-b border-neutral-200 flex justify-center py-3">
            <button
              onClick={() => setSelectedItemId(null)}
              className="text-neutral-600 hover:text-neutral-900 transition-colors duration-base"
            >
              <FontAwesomeIcon icon={faChevronDown} className="w-4 h-4" />
            </button>
          </div>

          {/* Totals Section */}
          <div className="bg-neutral-50 border-t border-neutral-300 p-3">
            {/* Customer Promotion Note */}
            {activeCart.appliedPromotion && (
              <div className="mb-2 pb-2 border-b border-neutral-200">
                <div className="flex justify-between text-sm">
                  <span className="text-purple-700 font-semibold flex items-center gap-1">
                    {activeCart.appliedPromotion.name}
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-700 font-semibold">ITEMS</span>
                <span className="text-neutral-900 font-bold text-lg">
                  {totals.itemCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700 font-semibold">SUBTOTAL</span>
                <span className="text-neutral-700 font-bold text-lg">
                  ₦{totals.subtotal.toLocaleString()}
                </span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between col-span-2">
                  <span
                    className={`font-semibold ${activeCart.appliedPromotion?.valueType === "INCREMENT" ? "text-blue-600" : "text-green-600"}`}
                  >
                    {activeCart.appliedPromotion?.valueType === "INCREMENT"
                      ? "INCREMENT"
                      : "SAVINGS"}
                  </span>
                  <span
                    className={`font-bold text-lg ${activeCart.appliedPromotion?.valueType === "INCREMENT" ? "text-blue-600" : "text-green-600"}`}
                  >
                    {activeCart.appliedPromotion?.valueType === "INCREMENT"
                      ? "+"
                      : "-"}
                    ₦{Math.round(totals.discountAmount).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between col-span-2 pt-2 border-t border-neutral-200">
                <span className="text-neutral-900 font-bold text-base">
                  TOTAL DUE
                </span>
                <span className="text-cyan-700 font-black text-xl">
                  ₦{Math.round(totals.total).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons Grid */}
          <div className="bg-white border-t border-neutral-300 p-2 space-y-1.5">
            {/* Row 1: Utility Buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={handlePrintCart}
                className="px-1.5 py-2 text-xs font-bold bg-neutral-300 hover:bg-neutral-400 text-neutral-900 rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-14"
              >
                <FontAwesomeIcon icon={faPrint} className="w-4 h-4" />
                <span>PRINT</span>
              </button>
              <button className="px-1.5 py-2 text-xs font-bold bg-neutral-300 hover:bg-neutral-400 text-neutral-900 rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-14">
                <FontAwesomeIcon icon={faMoneyBill} className="w-4 h-4" />
                <span>PETTY CASH</span>
              </button>
              <button
                onClick={() => setShowAdjustFloatModal(true)}
                className="px-1.5 py-2 text-xs font-bold bg-neutral-300 hover:bg-neutral-400 text-neutral-900 rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-14"
              >
                <FontAwesomeIcon icon={faGripVertical} className="w-4 h-4" />
                <span>ADJUST</span>
              </button>
            </div>

            {/* Row 2: Action Buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={deleteCart}
                className="px-2 py-2.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-16"
              >
                <FontAwesomeIcon icon={faTrashAlt} className="w-5 h-5" />
                <span>DELETE</span>
              </button>
              <button
                onClick={() => holdOrder(staff, location)}
                className="px-2 py-2.5 text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-16"
              >
                <FontAwesomeIcon icon={faClock} className="w-5 h-5" />
                <span>HOLD</span>
              </button>
              <button
                onClick={handlePayment}
                className="px-2 py-2.5 text-xs font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-16"
              >
                <FontAwesomeIcon icon={faMoneyBill} className="w-5 h-5" />
                <span>PAY</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          total={totals.total}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentModal(false)}
        />
      )}

      {/* Thank You Modal */}
      <ThankYouNote
        isOpen={showThankYouModal}
        onClose={() => setShowThankYouModal(false)}
        receiptSettings={receiptSettings}
        companyLogo={receiptSettings.companyLogo}
      />

      {/* Adjust Float Modal */}
      <AdjustFloatModal
        isOpen={showAdjustFloatModal}
        onClose={() => setShowAdjustFloatModal(false)}
      />
    </div>
  );
}
