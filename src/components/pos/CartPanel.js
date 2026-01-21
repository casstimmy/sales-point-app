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

import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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
} from '@fortawesome/free-solid-svg-icons';
import { useCart } from '../../context/CartContext';
import { useStaff } from '../../context/StaffContext';
import { saveTransactionOffline, getOnlineStatus, syncPendingTransactions } from '../../lib/offlineSync';
import { printTransactionReceipt, getReceiptSettings } from '../../lib/receiptPrinting';
import PaymentModal from './PaymentModal';
import ThankYouNote from './ThankYouNote';
import AdjustFloatModal from './AdjustFloatModal';

export default function CartPanel() {
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
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

  // Auto-highlight the last added item ONLY if no item is currently selected
  useEffect(() => {
    if (!isEmpty && activeCart.items.length > 0 && selectedItemId === null) {
      const lastItem = activeCart.items[activeCart.items.length - 1];
      setSelectedItemId(lastItem.id);
    }
  }, [activeCart.items.length, isEmpty, selectedItemId]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedItemId]);

  const handlePayment = async () => {
    if (isEmpty) {
      alert('Cart is empty. Add items to complete payment.');
      return;
    }
    // Show payment modal instead of processing immediately
    setShowPaymentModal(true);
  };

  const handlePrintCart = async () => {
    if (isEmpty) {
      alert('Cart is empty. Add items to print.');
      return;
    }

    try {
      // Create a temporary transaction object for printing
      const printTransaction = {
        items: activeCart.items.map(item => ({
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
          method: 'CASH',
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
        status: 'UNPAID', // Mark receipt as unpaid
      };

      // Get receipt settings
      const settings = receiptSettings || (await getReceiptSettings());
      setReceiptSettings(settings);

      // Print receipt (fire and forget)
      printTransactionReceipt(printTransaction, settings).catch(() => {
        // Ignore errors
      });
    } catch (error) {
      console.error('❌ Error printing receipt:', error);
      alert('Error printing receipt. Please try again.');
    }
  };

  const handlePaymentConfirm = async (paymentDetails) => {
    try {
      console.log('🔔 handlePaymentConfirm called');
      console.log('   Staff:', staff);
      console.log('   Location:', location);
      console.log('   Till from context:', till);
      console.log('   Till?._id:', till?._id);
      console.log('   Is till null?', till === null);
      console.log('   Is till undefined?', till === undefined);
      
      // Create transaction object matching schema
      const transaction = {
        items: activeCart.items.map(item => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,  // Maps to 'qty' in schema
          price: item.price,  // Maps to 'salePriceIncTax' in schema
        })),
        total: totals.total,  // Use 'total' from calculateTotals
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: activeCart.discountPercent || 0,
        amountPaid: paymentDetails.amountPaid,  // Actual amount paid by customer
        change: paymentDetails.change,  // Calculate change
        tenderType: paymentDetails.tenderType,  // Primary tender type (legacy, for backwards compatibility)
        tenderPayments: paymentDetails.tenderPayments,  // New: split payments array [{tenderId, tenderName, amount}]
        tenders: paymentDetails.tenders,  // All tender breakdowns (for display)
        staffName: staff?.name || 'Unknown Staff',
        staffId: staff?._id,  // Include staff ObjectId
        location: location?.name || 'Default Location',  // Use store location from login
        device: 'POS',
        tableName: null,
        customerName: activeCart.customer?.name,
        status: 'completed',  // Mark as completed after payment confirmation
        transactionType: 'pos',
        createdAt: new Date().toISOString(),
        tillId: till?._id,  // Link to till session by ID
      };

      console.log('💾 Transaction to save:', transaction);
      console.log('🔍 Totals:', { total: totals.total, subtotal: totals.subtotal, tax: totals.tax });
      console.log('🔍 Payment details:', paymentDetails);
      console.log('🔍 Tender payments:', paymentDetails.tenderPayments);
      
      if (transaction.tillId) {
        console.log(`✅ Till ID included in transaction: ${transaction.tillId}`);
      } else {
        console.warn('⚠️ No Till ID in transaction - till may not be set in context');
        console.warn('   Till is:', till);
      }

      // Send transaction directly if online, queue if offline
      if (getOnlineStatus()) {
        // Online: Send directly to server
        try {
          const response = await fetch('/api/transactions/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction),
          });
          
          if (!response.ok) {
            console.warn('Failed to send transaction online, queuing for sync');
            await saveTransactionOffline(transaction);
          } else {
            console.log('✅ Transaction sent directly to server');
            // Still save to IndexedDB as backup
            await saveTransactionOffline(transaction);
          }
        } catch (err) {
          console.warn('Error sending transaction, queuing for sync:', err);
          await saveTransactionOffline(transaction);
        }
      } else {
        // Offline: Queue to IndexedDB
        console.log('🔴 Offline - Queuing transaction for sync');
        await saveTransactionOffline(transaction);
      }

      // Complete order (clear cart)
      completeOrder('CASH');

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
      console.error('❌ Error processing payment:', error);
      alert('Error saving transaction. Please try again.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white touch-manipulation border-l border-neutral-200">
      {isEmpty ? (
        // Empty Cart State
        <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 p-6 text-center">
          <div className="text-8xl mb-6 opacity-40">🍽️</div>
          <div className="text-2xl font-bold mb-2 text-neutral-600">Add a Dish or Drink</div>
          <div className="text-base text-neutral-500">Tap a product to add to the bill</div>
          <div className="mt-8 w-32 h-1 bg-neutral-300 rounded-full"></div>
        </div>
      ) : (
        // Cart Content
        <>
          {/* Table Header */}
          <div className="bg-neutral-100 border-b border-neutral-300 sticky top-0 z-10">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-base font-semibold text-neutral-600 uppercase">
              <div className="col-span-5">Product</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-2 text-right">Each</div>
              <div className="col-span-3 text-right">Total</div>
            </div>
          </div>

          {/* Line Items */}
          <div className="flex-1 overflow-y-auto bg-white divide-y divide-neutral-200">
            {activeCart.items.map(item => (
              <div key={item.id}>
                {/* Normal Item View */}
                {selectedItemId !== item.id ? (
                  <div
                    onClick={() => setSelectedItemId(item.id)}
                    className="grid grid-cols-12 gap-2 px-4 py-6 items-center hover:bg-neutral-50 cursor-pointer transition-colors duration-base"
                  >
                    <div className="col-span-5">
                      <div className="text-base font-medium text-neutral-700 line-clamp-1">
                        {item.name}
                      </div>
                      {item.discount > 0 && (
                        <div className="text-sm text-neutral-600 mt-0.5">
                          Promotion <span className="text-neutral-900 font-semibold">-₦{item.discount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-center text-base font-semibold text-neutral-900">
                      {item.quantity}
                    </div>
                    <div className="col-span-2 text-right text-lg text-neutral-600">
                      ₦{item.price.toLocaleString()}
                    </div>
                    <div className="col-span-3 text-right text-lg font-semibold text-neutral-900">
                      ₦{(item.price * item.quantity).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  // Selected Item View - Expanded with primary background
                  <div ref={selectedItemRef} className="bg-primary-500 text-white">
                    {/* Item Header with Price Info - All on one line */}
                    <div className="px-3 py-4 border-b border-primary-600">
                      <div className="grid grid-cols-3 gap-3 items-center">
                        <div className="col-span-1">
                          <div className="text-sm font-bold">
                            {item.name}
                          </div>
                        </div>
                        <div className="col-span-1 text-center">
                          <div className="opacity-80 text-xs">EACH</div>
                          <div className="font-bold text-base">₦{item.price.toLocaleString()}</div>
                        </div>
                        <div className="col-span-1 text-right">
                          <div className="opacity-80 text-xs">TOTAL</div>
                          <div className="font-bold text-base">₦{(item.price * item.quantity).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Controls */}
                    <div className="px-3 py-4 space-y-3">
                      {/* Quantity Control - Center */}
                      <div className="flex items-center justify-center gap-6">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            updateQuantity(item.id, Math.max(1, item.quantity - 1));
                          }}
                          className="w-12 h-12 flex items-center justify-center rounded-lg bg-white text-primary-600 font-bold transition-colors duration-base hover:bg-neutral-100 text-lg"
                        >
                          <FontAwesomeIcon icon={faMinus} className="w-5 h-5" />
                        </button>
                        <div className="text-center w-12">
                          <div className="text-3xl font-bold">{item.quantity}</div>
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            updateQuantity(item.id, item.quantity + 1);
                          }}
                          className="w-12 h-12 flex items-center justify-center rounded-lg bg-white text-primary-600 font-bold transition-colors duration-base hover:bg-neutral-100 text-lg"
                        >
                          <FontAwesomeIcon icon={faPlus} className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Quantity Label */}
                      <div className="text-center text-xs font-semibold tracking-wider">
                        QUANTITY
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-3 justify-center">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setExpandedItemId(expandedItemId === item.id ? null : item.id);
                          }}
                          className="flex flex-col items-center gap-1 px-3 py-2 bg-white text-primary-600 font-bold hover:opacity-80 transition-opacity rounded-lg text-sm"
                        >
                          <FontAwesomeIcon icon={faStickyNote} className="w-5 h-5" />
                          <span>NOTE</span>
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setItemDiscount(item.id, (item.discount || 0) + 100);
                          }}
                          className="flex flex-col items-center gap-1 px-3 py-2 bg-white text-primary-600 font-bold hover:opacity-80 transition-opacity rounded-lg text-sm"
                        >
                          <FontAwesomeIcon icon={faTag} className="w-5 h-5" />
                          <span>DISCOUNT</span>
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            removeItem(item.id);
                            setSelectedItemId(null);
                          }}
                          className="flex flex-col items-center gap-1 px-3 py-2 bg-white text-red-600 font-bold hover:opacity-80 transition-opacity rounded-lg text-sm"
                        >
                          <FontAwesomeIcon icon={faTrashAlt} className="w-5 h-5" />
                          <span>DELETE</span>
                        </button>
                      </div>

                      {/* Note Input */}
                      {expandedItemId === item.id && (
                        <div className="pt-3 border-t border-blue-400">
                          <input
                            type="text"
                            placeholder="Add note..."
                            value={item.notes || ''}
                            onChange={e => setItemNotes(item.id, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="w-full text-xs p-2 border border-blue-400 rounded bg-blue-600 text-white placeholder-blue-200 outline-none focus:ring-2 focus:ring-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
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
          <div className="bg-neutral-50 border-t border-neutral-300 p-4">
            <div className="grid grid-cols-2 gap-4 text-base">
              <div className="flex justify-between">
                <span className="text-neutral-700 font-semibold">ITEMS</span>
                <span className="text-neutral-900 font-bold text-lg">{totals.itemCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700 font-semibold">TOTAL</span>
                <span className="text-neutral-900 font-black text-2xl">₦{(totals.total - totals.tax).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700 font-semibold">TOTAL DISCOUNT</span>
                <span className="text-neutral-900 font-bold text-lg">₦{totals.discountAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700 font-semibold">DUE</span>
                <span className="text-red-600 font-bold text-xl">₦{(totals.total - totals.tax).toLocaleString()}</span>
              </div>
              <div className="col-span-2 flex justify-between">
                <span className="text-neutral-700 font-semibold">TAX</span>
                <span className="text-neutral-900 font-bold text-lg">₦0.00</span>
              </div>
            </div>
          </div>

          {/* Action Buttons Grid */}
          <div className="bg-white border-t border-neutral-300 p-4 space-y-3">
            {/* Row 1: Utility Buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={handlePrintCart}
                className="px-2 py-3 text-sm font-bold bg-neutral-300 hover:bg-neutral-400 text-neutral-900 rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-20">
                <FontAwesomeIcon icon={faPrint} className="w-5 h-5" />
                <span>PRINT</span>
              </button>
              <button className="px-2 py-3 text-sm font-bold bg-neutral-300 hover:bg-neutral-400 text-neutral-900 rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-20">
                <FontAwesomeIcon icon={faMoneyBill} className="w-5 h-5" />
                <span>PETTY</span>
                <span>CASH</span>
              </button>
              <button 
                onClick={() => setShowAdjustFloatModal(true)}
                className="px-2 py-3 text-sm font-bold bg-neutral-300 hover:bg-neutral-400 text-neutral-900 rounded-lg transition-colors duration-base flex flex-col items-center gap-1 min-h-20"
              >
                <FontAwesomeIcon icon={faGripVertical} className="w-5 h-5" />
                <span>ADJUST</span>
                <span>FLOAT</span>
              </button>
            </div>

            {/* Row 3: Action Buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={deleteCart}
                className="px-3 py-4 text-lg font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-base flex flex-col items-center gap-2 min-h-24"
              >
                <FontAwesomeIcon icon={faTrashAlt} className="w-6 h-6" />
                <span>DELETE</span>
              </button>
              <button
                onClick={holdOrder}
                className="px-3 py-4 text-lg font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-base flex flex-col items-center gap-2 min-h-24"
              >
                <FontAwesomeIcon icon={faClock} className="w-6 h-6" />
                <span>HOLD</span>
              </button>
              <button
                onClick={handlePayment}
                className="px-3 py-4 text-lg font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-base flex flex-col items-center gap-2 min-h-24"
              >
                <FontAwesomeIcon icon={faMoneyBill} className="w-6 h-6" />
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
