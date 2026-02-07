/**
 * PaymentPanel Component
 *
 * Renders the payment flow inline on the content side.
 */

import React, { useState } from "react";
import { useCart } from "../../context/CartContext";
import { useStaff } from "../../context/StaffContext";
import { useErrorHandler } from "../../hooks/useErrorHandler";
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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import ThankYouNote from "./ThankYouNote";

export default function PaymentPanel() {
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState({});
  const { staff, location, till } = useStaff();
  const { handleError } = useErrorHandler();
  const {
    activeCart,
    calculateTotals,
    completeOrder,
    showPaymentPanel,
    setShowPaymentPanel,
  } = useCart();

  const totals = calculateTotals();
  const isEmpty = activeCart.items.length === 0;

  const handlePaymentConfirm = async (paymentDetails) => {
    try {
      if (!staff?._id || !staff?.name || !location?._id || !location?.name) {
        throw new Error("Staff or location missing. Please log in again.");
      }

      const transaction = {
        items: activeCart.items.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        total: totals.total,
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: activeCart.discountPercent || 0,
        amountPaid: paymentDetails.amountPaid,
        change: paymentDetails.change,
        tenderType: paymentDetails.tenderType,
        tenderPayments: paymentDetails.tenderPayments,
        tenders: paymentDetails.tenders,
        staffName: staff?.name || staff?.fullName || "POS Staff",
        staffId: staff?._id,
        location: location?.name || "Default Location",
        locationId: location?._id,
        locationName: location?.name,
        device: "POS",
        tableName: null,
        customerName: activeCart.customer?.name,
        status: "completed",
        transactionType: "pos",
        createdAt: new Date().toISOString(),
        tillId: till?._id,
      };

      if (getOnlineStatus()) {
        try {
          const response = await fetch("/api/transactions/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(transaction),
          });

          if (!response.ok) {
            await saveTransactionOffline(transaction);
          }
        } catch (err) {
          await saveTransactionOffline(transaction);
        }
      } else {
        await saveTransactionOffline(transaction);
      }

      completeOrder("CASH");
      window.dispatchEvent(new CustomEvent("transactions:completed", { detail: { transaction } }));

      setShowPaymentPanel(false);
      setShowThankYouModal(true);

      const settings = receiptSettings || (await getReceiptSettings());
      setReceiptSettings(settings);

      const receiptTransaction = {
        ...transaction,
        _id: transaction._id || Date.now().toString(),
      };

      printTransactionReceipt(receiptTransaction, settings).catch(() => {});

      if (getOnlineStatus()) {
        syncPendingTransactions().catch(() => {});
      }
    } catch (error) {
      handleError(error, {
        context: "PaymentPanel - handlePaymentConfirm",
        showAlert: true,
        alertMessage: "Error saving transaction. Please try again.",
      });
    }
  };

  if (!showPaymentPanel) return null;

  return (
    <div className="min-h-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-cyan-50 border border-neutral-200 rounded-2xl shadow-lg overflow-hidden">
      {/* Payment Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-neutral-200">
        <button
          onClick={() => setShowPaymentPanel(false)}
          className="w-10 h-10 rounded-full border border-neutral-200 bg-white hover:bg-neutral-100 transition flex items-center justify-center"
          aria-label="Back to menu"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4 text-neutral-700" />
        </button>
        <div className="text-base font-semibold text-neutral-900">Complete Payment</div>
      </div>

      {/* Payment Body */}
      <div className="flex-1 p-4">
        <PaymentModal
          inline
          total={totals.total}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentPanel(false)}
        />

        {isEmpty && (
          <div className="mt-3 text-sm text-red-600 font-semibold">
            Cart is empty. Add items to complete payment.
          </div>
        )}
      </div>

      {/* Thank You Modal */}
      <ThankYouNote
        isOpen={showThankYouModal}
        onClose={() => setShowThankYouModal(false)}
        receiptSettings={receiptSettings}
        companyLogo={receiptSettings.companyLogo}
      />
    </div>
  );
}
