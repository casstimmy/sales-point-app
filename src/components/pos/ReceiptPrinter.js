/**
 * ReceiptPrinter Component
 * 
 * Generates and prints transaction receipts with:
 * - Company branding (logo, name, contact info)
 * - Transaction details (date, staff, items, totals)
 * - Payment breakdown by tender
 * - Thank you message with company info
 * - Optimized for thermal receipt printer (58mm width)
 * 
 * Usage:
 * <ReceiptPrinter 
 *   transaction={transaction}
 *   receiptSettings={receiptSettings}
 *   onPrint={() => {}}
 * />
 */

import React, { useRef, useEffect } from 'react';

export default function ReceiptPrinter({ 
  transaction, 
  receiptSettings = {},
  onPrint = () => {},
  isVisible = true 
}) {
  const receiptRef = useRef(null);
  
  // Format Nigerian Naira
  const formatNaira = (amount) => {
    return `₦${(amount || 0).toLocaleString('en-NG', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  };

  // Format date/time for receipt
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-NG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Handle print
  const handlePrint = () => {
    if (receiptRef.current) {
      const printWindow = window.open('', '_blank');
      const receiptHTML = receiptRef.current.innerHTML;
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Transaction Receipt</title>
            <style>
              body {
                font-family: 'Courier New', monospace;
                width: 58mm;
                margin: 0;
                padding: 0;
                background: white;
              }
              
              .receipt {
                width: 100%;
                padding: 5mm;
                font-size: 10pt;
                line-height: 1.4;
                color: #000;
              }
              
              .receipt-header {
                text-align: center;
                margin-bottom: 5mm;
                padding-bottom: 5mm;
                border-bottom: 1px solid #000;
              }
              
              .receipt-header img {
                max-width: 40mm;
                max-height: 20mm;
                margin-bottom: 3mm;
                filter: grayscale(100%);
              }
              
              .company-name {
                font-weight: bold;
                font-size: 12pt;
                margin: 3mm 0;
                letter-spacing: 1px;
              }
              
              .company-info {
                font-size: 8pt;
                line-height: 1.3;
                color: #333;
              }
              
              .separator {
                display: none;
              }
              
              .receipt-details {
                text-align: left;
                font-size: 9pt;
                margin: 3mm 0;
              }
              
              .detail-row {
                display: flex;
                justify-content: space-between;
                margin: 1mm 0;
              }
              
              .items-section {
                margin: 3mm 0;
                border-top: 1px solid #000;
                border-bottom: 1px solid #000;
                padding: 3mm 0;
              }
              
              .items-header {
                display: grid;
                grid-template-columns: 1fr 0.5fr 0.75fr;
                gap: 2mm;
                font-weight: bold;
                margin-bottom: 2mm;
                font-size: 8pt;
              }
              
              .item-row {
                display: grid;
                grid-template-columns: 1fr 0.5fr 0.75fr;
                gap: 2mm;
                margin: 1mm 0;
                font-size: 9pt;
              }
              
              .item-name {
                text-align: left;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              
              .item-qty {
                text-align: center;
              }
              
              .item-total {
                text-align: right;
              }
              
              .totals-section {
                margin: 3mm 0;
                font-size: 9pt;
              }
              
              .total-row {
                display: flex;
                justify-content: space-between;
                margin: 2mm 0;
              }
              
              .final-total {
                font-weight: bold;
                font-size: 11pt;
                border-top: 1px solid #000;
                padding-top: 2mm;
                margin: 2mm 0;
              }
              
              .payment-section {
                margin: 3mm 0;
                border-top: 1px solid #000;
                border-bottom: 1px solid #000;
                padding: 3mm 0;
              }
              
              .payment-title {
                font-weight: bold;
                font-size: 9pt;
                margin-bottom: 2mm;
              }
              
              .payment-row {
                display: flex;
                justify-content: space-between;
                margin: 1mm 0;
                font-size: 9pt;
              }
              
              .qr-section {
                text-align: center;
                margin: 3mm 0;
                padding: 3mm 0;
                border-top: 1px solid #000;
              }
              
              .qr-box {
                background: #f0f0f0;
                width: 30mm;
                height: 30mm;
                margin: 2mm auto;
                border: 1px solid #000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 8pt;
                color: #666;
              }
              
              .qr-description {
                font-size: 8pt;
                margin: 2mm 0;
                font-weight: bold;
              }
              
              .message-section {
                text-align: center;
                margin: 3mm 0;
                padding: 3mm 0;
                border-top: 1px solid #000;
                font-size: 8pt;
                white-space: pre-wrap;
              }
              
              .thank-you {
                text-align: center;
                font-weight: bold;
                font-size: 11pt;
                margin: 5mm 0;
              }
              
              .footer {
                text-align: center;
                font-size: 8pt;
                margin-top: 5mm;
                color: #666;
              }
              
              .status-box {
                text-align: center;
                font-weight: bold;
                font-size: 12pt;
                border: 2px solid #000;
                padding: 2mm;
                margin: 3mm 0;
              }
              
              @media print {
                body {
                  margin: 0;
                  padding: 0;
                  width: 58mm;
                }
                .receipt {
                  margin: 0;
                  padding: 2mm;
                }
              }
            </style>
          </head>
          <body>
            ${receiptHTML}
          </body>
        </html>
      `);
      
      printWindow.document.close();
      
      // Wait for content to load before printing
      setTimeout(() => {
        printWindow.print();
        onPrint();
      }, 250);
    }
  };

  if (!transaction || !isVisible) return null;

  const {
    items = [],
    total = 0,
    subtotal = 0,
    tax = 0,
    discount = 0,
    change = 0,
    staffName = 'Unknown Staff',
    location = 'Default Location',
    createdAt = new Date().toISOString(),
    tenderPayments = [],
    _id = '',
  } = transaction;

  const {
    companyDisplayName = "St's Michael Hub",
    companyLogo = '/images/logo.png',
    storePhone = '',
    email = '',
    website = '',
    taxNumber = '',
    refundDays = 0,
    receiptMessage = '',
    qrUrl = '',
    qrDescription = '',
    paymentStatus = 'paid',
  } = receiptSettings;

  return (
    <div>
      {/* Hidden Receipt Template for Printing */}
      <div 
        ref={receiptRef} 
        className="receipt"
        style={{ display: 'none' }}
      >
        <div className="receipt-header">
          {/* Company Logo */}
          {companyLogo && (
            <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
              <img 
                src={companyLogo} 
                alt="Company Logo"
                style={{
                  maxWidth: '40mm',
                  maxHeight: '20mm',
                  filter: 'grayscale(100%)',
                }}
              />
            </div>
          )}

          {/* Company Name */}
          <div className="company-name">
            {companyDisplayName}
          </div>

          {/* Store Info */}
          <div className="company-info">
            {location && <div>{location}</div>}
            {storePhone && <div>Tel: {storePhone}</div>}
            {email && <div>{email}</div>}
            {website && <div>{website}</div>}
            {taxNumber && <div>Tax ID: {taxNumber}</div>}
          </div>
        </div>

        {/* Receipt Details */}
        <div className="receipt-details">
          <div style={{ fontWeight: 'bold', marginBottom: '2mm' }}>
            Receipt of Purchase (Inc Tax)
          </div>
          
          <div className="detail-row">
            <span>{formatDateTime(createdAt)}</span>
            <span style={{ textAlign: 'right' }}>{_id.substring(0, 8).toUpperCase()}</span>
          </div>
          
          <div className="detail-row">
            <span>Staff: {staffName}</span>
            <span style={{ textAlign: 'right' }}>Till #1</span>
          </div>
        </div>

        {/* Separator */}
        <div className="separator">━━━━━━━━━━━━━━━━━━</div>

        {/* Items Section */}
        <div className="items-section">
          <div className="items-header">
            <span>PRODUCT</span>
            <span style={{ textAlign: 'center' }}>QTY</span>
            <span style={{ textAlign: 'right' }}>PRICE</span>
          </div>

          {/* Items */}
          {items.map((item, idx) => (
            <div key={idx} className="item-row">
              <div className="item-name">{item.name}</div>
              <div className="item-qty">{item.quantity}</div>
              <div className="item-total">
                {formatNaira(item.price * item.quantity)}
              </div>
            </div>
          ))}

          {/* Total Qty */}
          <div className="detail-row" style={{ marginTop: '3mm', paddingTop: '2mm', borderTop: '1px solid #ccc' }}>
            <span></span>
            <span style={{ fontWeight: 'bold' }}>
              Total: {items.reduce((sum, item) => sum + item.quantity, 0)} Items
            </span>
            <span></span>
          </div>
        </div>

        {/* Separator */}
        <div className="separator">━━━━━━━━━━━━━━━━━━</div>

        {/* Totals */}
        <div className="totals-section">
          <div className="total-row">
            <span>Subtotal:</span>
            <span style={{ textAlign: 'right' }}>{formatNaira(subtotal)}</span>
          </div>
          
          {tax > 0 && (
            <div className="total-row">
              <span>Tax:</span>
              <span style={{ textAlign: 'right' }}>{formatNaira(tax)}</span>
            </div>
          )}

          {discount > 0 && (
            <div className="total-row">
              <span>Discount:</span>
              <span style={{ textAlign: 'right' }}>-{formatNaira(discount)}</span>
            </div>
          )}

          <div className="final-total">
            <div className="total-row">
              <span>TOTAL:</span>
              <span style={{ textAlign: 'right' }}>{formatNaira(total)}</span>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="separator">━━━━━━━━━━━━━━━━━━</div>

        {/* Payment Section */}
        <div className="payment-section">
          <div className="payment-title">PAYMENT BY TENDER</div>
          
          {tenderPayments && tenderPayments.length > 0 ? (
            tenderPayments.map((payment, idx) => (
              <div key={idx} className="payment-row">
                <span>{payment.tenderName || 'Unknown'}</span>
                <span style={{ textAlign: 'right' }}>
                  {formatNaira(payment.amount)}
                </span>
              </div>
            ))
          ) : (
            <div className="payment-row">
              <span>CASH</span>
              <span style={{ textAlign: 'right' }}>{formatNaira(total)}</span>
            </div>
          )}
        </div>

        {/* Change (if applicable) */}
        {change > 0 && (
          <>
            <div className="separator">━━━━━━━━━━━━━━━━━━</div>
            <div className="detail-row">
              <span style={{ fontWeight: 'bold' }}>CHANGE:</span>
              <span style={{ textAlign: 'right', fontWeight: 'bold' }}>
                {formatNaira(change)}
              </span>
            </div>
          </>
        )}

        {/* QR Code */}
        {qrUrl && (
          <div className="qr-section">
            <div className="qr-description">{qrDescription || 'Scan & Follow'}</div>
            <div className="qr-box">[QR CODE]</div>
          </div>
        )}

        {/* Message */}
        {receiptMessage && (
          <div className="message-section">
            {receiptMessage}
          </div>
        )}

        {/* Thank You Section */}
        <div className="thank-you">
          🙏 THANK YOU! 🙏
        </div>

        {/* Additional Info */}
        {refundDays > 0 && (
          <div style={{ textAlign: 'center', fontSize: '8pt', marginTop: '3mm' }}>
            Refund within {refundDays} days with receipt
          </div>
        )}

        {/* Status */}
        <div className="status-box">
          {paymentStatus.toUpperCase()}
        </div>

        {/* Footer */}
        <div className="footer">
          ━━━━━━━━━━━━━━━━━━
          <div style={{ marginTop: '2mm' }}>
            Thank you for shopping with us!
          </div>
        </div>
      </div>

      {/* Print Button (visible during development, remove for production) */}
      <button
        onClick={handlePrint}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '10px 20px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          zIndex: 1000,
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
        title="Click to print receipt"
      >
        🖨️ Print Receipt
      </button>
    </div>
  );
}
