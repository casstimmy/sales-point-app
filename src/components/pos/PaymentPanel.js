/**
 * PaymentPanel Component
 *
 * Renders the payment flow inline on the content side.
 */

import React, { useState, useEffect } from "react";
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
import { getUiSettings } from "@/src/lib/uiSettings";
import ThankYouNote from "./ThankYouNote";
import OpenTillModal from "./OpenTillModal";

export default function PaymentPanel() {
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [showOpenTillModal, setShowOpenTillModal] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState({});
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
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
  const [uiSettings, setUiSettings] = useState(getUiSettings());

  useEffect(() => {
    const handleSettingsUpdate = (event) => {
      if (event?.detail) {
        setUiSettings(event.detail);
      } else {
        setUiSettings(getUiSettings());
      }
    };

    handleSettingsUpdate();
    window.addEventListener("uiSettings:updated", handleSettingsUpdate);
    return () => window.removeEventListener("uiSettings:updated", handleSettingsUpdate);
  }, []);

  const handlePaymentConfirm = async (paymentDetails) => {
    // Prevent double-firing of the entire payment handler
    if (isProcessingPayment) {
      console.warn('⚠️ Payment already processing, ignoring duplicate call');
      return;
    }
    setIsProcessingPayment(true);

    try {
      if (!staff?._id || !staff?.name || !location?._id || !location?.name) {
        throw new Error("Staff or location missing. Please log in again.");
      }
      if (!till?._id) {
        throw new Error("Till not open. Please open a till before payment.");
      }

      const clientId = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const transaction = {
        items: activeCart.items.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        externalId: clientId,
        clientId,
        total: totals.total,
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discountAmount || 0,
        amountPaid: paymentDetails.amountPaid,
        change: paymentDetails.change,
        tenderType: paymentDetails.tenderType,
        tenderPayments: paymentDetails.tenderPayments,
        tenders: paymentDetails.tenders,
        staffName: staff?.name || staff?.fullName || "POS Staff",
        staffId: staff?._id,
        storeId: staff?.storeId || "default-store",
        location: location?.name || "Default Location",
        locationId: location?._id,
        locationName: location?.name,
        device: "POS",
        tableName: null,
        customerName: activeCart.customer?.name,
        status: "completed",
        transactionType: "pos",
        createdAt: new Date().toISOString(),
        tillId: till._id,
      };

      // Always save locally first for full offline/online reconciliation
      await saveTransactionOffline(transaction);

      if (getOnlineStatus()) {
        // Best-effort immediate sync (single call only — no duplicates)
        syncPendingTransactions().catch(() => {});
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
    } catch (error) {
      handleError(error, {
        context: "PaymentPanel - handlePaymentConfirm",
        showAlert: true,
        alertMessage: "Error saving transaction. Please try again.",
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (!showPaymentPanel) return null;

  const paymentScale = uiSettings.payment?.scale || "standard";
  const paymentContentSize = uiSettings.payment?.contentSize || "standard";

  const scaleClass = {
    compact: "scale-[0.98]",
    standard: "scale-100",
    large: "scale-[1.02]",
  }[paymentScale] || "scale-100";

  const contentSizeClass = {
    compact: "text-[14px]",
    standard: "text-[16px]",
    large: "text-[18px]",
  }[paymentContentSize] || "text-[16px]";

  const handleTillOpened = () => {
    setShowOpenTillModal(false);
  };

  return (
    <div className={`min-h-[calc(100vh-6rem)] md:min-h-[calc(100vh-10rem)] flex flex-col bg-gradient-to-br from-slate-50 via-white to-cyan-50 border border-neutral-200 rounded-2xl shadow-lg overflow-hidden relative z-50 ${scaleClass} ${contentSizeClass}`}>
      {/* Payment Header */}
      <div className="flex items-center gap-3 px-3 py-2 sm:px-4 sm:py-3 bg-white border-b border-neutral-200">
        <button
          onClick={() => setShowPaymentPanel(false)}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-neutral-200 bg-white hover:bg-neutral-100 transition flex items-center justify-center"
          aria-label="Back to menu"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4 text-neutral-700" />
        </button>
        <div className="text-sm sm:text-base font-semibold text-neutral-900">Complete Payment</div>
      </div>

      {/* Payment Body */}
      <div className="flex-1 p-2 sm:p-4">
        {!till ? (
          <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-cyan-300 bg-white/80 rounded-2xl p-4 sm:p-6">
            <div className="text-base sm:text-lg font-semibold text-neutral-900">Open a till to accept payment</div>
            <div className="text-xs sm:text-sm text-neutral-600 mt-2 max-w-md">
              This session has no active till. Open a till first so sales can be recorded correctly.
            </div>
            <button
              onClick={() => setShowOpenTillModal(true)}
              className="mt-3 sm:mt-4 px-4 py-2 sm:px-5 sm:py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg transition text-sm sm:text-base"
            >
              Open Till
            </button>
          </div>
        ) : (
          <PaymentModal
            inline
            total={totals.total}
            onConfirm={handlePaymentConfirm}
            onCancel={() => setShowPaymentPanel(false)}
          />
        )}

        {isEmpty && (
          <div className="mt-3 text-xs sm:text-sm text-red-600 font-semibold">
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

      <OpenTillModal
        isOpen={showOpenTillModal}
        onClose={() => setShowOpenTillModal(false)}
        onTillOpened={handleTillOpened}
        staffData={staff}
        locationData={location}
      />
    </div>
  );
}
