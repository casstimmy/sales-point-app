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

/* eslint-disable @next/next/no-img-element */
import React, { useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  buildReceiptViewModel,
  formatReceiptNaira,
} from '../../lib/receiptViewModel';

export default function ReceiptPrinter({ 
  transaction, 
  receiptSettings = {},
  onPrint = () => {},
  isVisible = true 
}) {
  const receiptRef = useRef(null);
  
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
	              html, body {
	                margin: 0;
	                padding: 0;
	                background: white;
	              }

	              body {
	                font-family: 'Arial', 'Helvetica Neue', sans-serif;
	              }

	              .receipt-page {
	                width: 58mm;
	                min-width: 58mm;
	                max-width: 58mm;
	                margin: 0 auto;
	                padding: 0;
	                background: white;
	                display: flex;
	                justify-content: center;
	              }
	              
	              .receipt {
	                width: 100%;
	                padding: 2mm 1.5mm 1.5mm;
	                font-size: 8pt;
	                line-height: 1.2;
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
                font-size: 10pt;
                margin: 3mm 0;
                letter-spacing: 1px;
              }
              
              .company-info {
                font-size: 7pt;
                line-height: 1.2;
                color: #333;
              }
              
              .separator {
                display: none;
              }
              
              .receipt-details {
                text-align: left;
                font-size: 7.5pt;
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
                font-size: 7pt;
              }
              
              .item-row {
                display: grid;
                grid-template-columns: 1fr 0.5fr 0.75fr;
                gap: 2mm;
                margin: 1mm 0;
                font-size: 7.5pt;
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
                font-size: 7.5pt;
              }
              
              .total-row {
                display: flex;
                justify-content: space-between;
                margin: 2mm 0;
              }
              
              .final-total {
                font-weight: bold;
                font-size: 9pt;
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
                font-size: 7.5pt;
                margin-bottom: 2mm;
              }
              
              .payment-row {
                display: flex;
                justify-content: space-between;
                margin: 1mm 0;
                font-size: 7.5pt;
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
                font-size: 7pt;
                color: #666;
              }
              
              .qr-description {
                font-size: 7pt;
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
                font-size: 9pt;
                margin: 5mm 0;
              }
              
              .footer {
                text-align: center;
                font-size: 7pt;
                margin-top: 5mm;
                color: #666;
              }
              
              .status-box {
                text-align: center;
                font-weight: bold;
                font-size: 9pt;
                border: 2px solid #000;
                padding: 2mm;
                margin: 3mm 0;
              }
              
              @media print {
	                html, body {
	                  margin: 0 !important;
	                  padding: 0 !important;
	                  background: white;
	                }
	                .receipt-page {
	                  width: 58mm;
	                  min-width: 58mm;
	                  max-width: 58mm;
	                  margin: 0 auto !important;
	                  padding: 0 !important;
	                }
	                .receipt {
	                  margin: 0;
	                  padding: 2mm 1.5mm 1.5mm;
	                }
	              }
	            </style>
          </head>
	          <body>
	            <div class="receipt-page">${receiptHTML}</div>
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

  const model = buildReceiptViewModel(transaction, receiptSettings);

  // Ensure logo is an absolute URL for printing contexts
  const companyLogo = model.companyLogo && model.companyLogo !== '/images/placeholder.jpg'
    ? model.companyLogo
    : '';

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
              <Image
                src={companyLogo}
                alt="Company Logo"
                width={160}
                height={80}
                style={{
                  maxWidth: '40mm',
                  maxHeight: '20mm',
                  filter: 'grayscale(100%)',
                  width: 'auto',
                  height: 'auto',
                }}
              />
            </div>
          )}

          {/* Company Name */}
          <div className="company-name">
            {model.companyName}
          </div>

          {/* Store Info */}
          <div className="company-info">
            {model.locationName && <div>{model.locationName}</div>}
            {model.address && <div>{model.address}</div>}
            {model.contactLine && <div>{model.contactLine}</div>}
            {model.taxNumber && <div>Tax ID: {model.taxNumber}</div>}
          </div>
        </div>

        {/* Receipt Details */}
        <div className="receipt-details">
          <div style={{ fontWeight: 'bold', marginBottom: '2mm' }}>
            {model.title}
          </div>
          
          <div className="detail-row">
            <span>{model.dateTime}</span>
            <span style={{ textAlign: 'right' }}>{model.receiptId}</span>
          </div>
          
          <div className="detail-row">
            <span>Staff: {model.staffName}</span>
            <span style={{ textAlign: 'right' }}>{model.status}</span>
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
          {model.items.map((item, idx) => (
            <div key={idx} className="item-row">
              <div className="item-name">{item.name}</div>
              <div className="item-qty">{item.quantity}</div>
              <div className="item-total">
                {formatReceiptNaira(item.lineTotal)}
              </div>
            </div>
          ))}

          {/* Total Qty */}
          <div className="detail-row" style={{ marginTop: '3mm', paddingTop: '2mm', borderTop: '1px solid #ccc' }}>
            <span></span>
            <span style={{ fontWeight: 'bold' }}>
              Total: {model.totalQuantity} Items
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
            <span style={{ textAlign: 'right' }}>{formatReceiptNaira(model.subtotal)}</span>
          </div>
          
          {model.tax > 0 && (
            <div className="total-row">
              <span>Tax:</span>
              <span style={{ textAlign: 'right' }}>{formatReceiptNaira(model.tax)}</span>
            </div>
          )}

          {model.adjustmentLines.map((line, idx) => (
            <div key={`${line.label}-${idx}`} className="total-row">
              <span>{line.label}:</span>
              <span style={{ textAlign: 'right' }}>{line.type === 'subtract' ? '-' : ''}{formatReceiptNaira(line.amount)}</span>
            </div>
          ))}

          <div className="final-total">
            <div className="total-row">
              <span>TOTAL:</span>
              <span style={{ textAlign: 'right' }}>{formatReceiptNaira(model.total)}</span>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="separator">━━━━━━━━━━━━━━━━━━</div>

        {/* Payment Section */}
        <div className="payment-section">
          <div className="payment-title">PAYMENT BY TENDER</div>
          
          {model.tenderPayments.map((payment, idx) => (
              <div key={idx} className="payment-row">
                <span>{payment.name}</span>
                <span style={{ textAlign: 'right' }}>
                  {formatReceiptNaira(payment.amount)}
                </span>
              </div>
            ))}
        </div>

        {/* Change (if applicable) */}
        {model.change > 0 && (
          <>
            <div className="separator">━━━━━━━━━━━━━━━━━━</div>
            <div className="detail-row">
              <span style={{ fontWeight: 'bold' }}>CHANGE:</span>
              <span style={{ textAlign: 'right', fontWeight: 'bold' }}>
                {formatReceiptNaira(model.change)}
              </span>
            </div>
          </>
        )}

        {/* QR Code */}
        {(model.qrImageSrc || model.qrUrl) && (
          <div className="qr-section">
            {model.qrDescription && <div className="qr-description">{model.qrDescription}</div>}
            {model.qrImageSrc ? (
              <img src={model.qrImageSrc} alt="QR Code" className="qr-box" />
            ) : (
              <div className="qr-description">{model.qrUrl}</div>
            )}
          </div>
        )}

        {/* Message */}
        {model.receiptMessage && (
          <div className="message-section">
            {model.receiptMessage}
          </div>
        )}

        {/* Additional Info */}
        {model.refundDays > 0 && (
          <div style={{ textAlign: 'center', fontSize: '8pt', marginTop: '3mm' }}>
            Refund within {model.refundDays} days with receipt
          </div>
        )}

        {/* Status */}
        <div className="status-box">
          {model.status}
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
