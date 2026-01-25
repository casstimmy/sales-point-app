/**
 * Receipt Printing Utility
 * 
 * Handles automatic receipt generation and printing after payment completion
 * Supports both browser printing and direct thermal printer (ESC/POS)
 * Fetches receipt settings from API and generates formatted receipts
 */

import { getPrinterSettings, sendDirectPrint } from './printerConfig';

/**
 * Get receipt settings from API
 * @returns {Promise<Object>} Receipt settings including logo, company info, messages
 */
export async function getReceiptSettings() {
  try {
    const response = await fetch('/api/receipt-settings');
    if (!response.ok) {
      throw new Error('Failed to fetch receipt settings');
    }
    const data = await response.json();
    return data.settings || {};
  } catch (error) {
    console.error('❌ Error fetching receipt settings:', error);
    // Return default settings if fetch fails
    return {
      companyDisplayName: "St's Michael Hub",
      companyLogo: '/images/st-micheals-logo.png',
      storePhone: '',
      email: '',
      website: '',
      refundDays: 0,
      receiptMessage: 'Thank you for shopping with us!',
    };
  }
}

/**
 * Print transaction receipt using thermal printer (ESC/POS) or browser
 * @param {Object} transaction - Transaction object with items, totals, payment details
 * @param {Object} receiptSettings - Receipt settings (logo, company info, messages)
 * @returns {Promise<void>}
 */
/**
 * Print transaction receipt using thermal printer (ESC/POS) or browser
 * @param {Object} transaction - Transaction object with items, totals, payment details
 * @param {Object} receiptSettings - Receipt settings (logo, company info, messages)
 * @returns {Promise<void>}
 */
export async function printTransactionReceipt(transaction, receiptSettings) {
  try {
    if (!transaction) {
      console.warn('⚠️ No transaction to print');
      return;
    }

    // Use provided settings or get them (cached on client)
    const settings = receiptSettings || (await getReceiptSettings());

    // Get printer settings
    const printerSettings = getPrinterSettings();

    // Try silent printer only if enabled (skip API call if disabled)
    if (printerSettings.enabled && printerSettings.connectionMode === 'usb') {
      try {
        // Fire and forget - don't await the API call
        sendDirectPrint(transaction, settings, printerSettings).catch(() => {
          // Silently fail - will fall back to dialog anyway
        });
        // Don't wait for response - show dialog immediately
      } catch (error) {
        // Ignore
      }
    }

    // Show print dialog immediately (don't wait for thermal printer)
    console.log('🖨️ Showing print dialog...');
    
    const receiptHTML = generateReceiptHTML(transaction, settings);
    
    // Create iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    // Write HTML to iframe
    iframe.contentDocument.write(receiptHTML);
    iframe.contentDocument.close();

    // Print with proper timing and cleanup
    try {
      iframe.contentWindow.focus();
      
      let hasPrinted = false; // Flag to ensure print happens only once
      let cleanupScheduled = false;
      
      // Function to clean up iframe after print
      const cleanupIframe = () => {
        if (cleanupScheduled) return;
        cleanupScheduled = true;
        
        // Wait a bit before cleanup to ensure print dialog is handled
        setTimeout(() => {
          try {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
              console.log('🧹 Print iframe cleaned up');
            }
          } catch (e) {
            // Ignore cleanup errors
          }
        }, 3000); // Wait 3 seconds after print to cleanup
      };
      
      // Function to safely print
      const doPrint = () => {
        if (!hasPrinted) {
          hasPrinted = true;
          try {
            console.log('🖨️ Triggering print dialog...');
            iframe.contentWindow.print();
            console.log('✅ Print dialog triggered');
            cleanupIframe();
          } catch (e) {
            console.error('Print error:', e);
            cleanupIframe();
          }
        }
      };
      
      // Listen for afterprint event (fires when print dialog closes)
      iframe.contentWindow.addEventListener('afterprint', () => {
        console.log('📄 Print dialog closed');
        cleanupIframe();
      }, { once: true });
      
      // Try to print on load event first
      iframe.contentWindow.addEventListener('load', doPrint, { once: true });
      
      // Fallback: print immediately if window is ready
      if (iframe.contentDocument.readyState === 'complete') {
        doPrint();
      }
      
      // Safety timeout: ensure print happens within 1 second
      setTimeout(() => {
        doPrint();
      }, 1000);
      
      // Final safety cleanup (if nothing else triggered)
      setTimeout(() => {
        cleanupIframe();
      }, 10000); // Max 10 seconds before cleanup
    } catch (printError) {
      console.error('❌ Print error:', printError);
      try {
        document.body.removeChild(iframe);
      } catch (e) {
        // Ignore
      }
    }

  } catch (error) {
    console.error('❌ Error printing receipt:', error);
  }
}

/**
 * Generate receipt HTML for printing
 * @param {Object} transaction - Transaction details
 * @param {Object} settings - Receipt settings
 * @returns {string} HTML string
 */
function generateReceiptHTML(transaction, settings) {
  const {
    items = [],
    total = 0,
    subtotal = 0,
    tax = 0,
    discount = 0,
    change = 0,
    staffName = 'Unknown Staff',
    location,
    locationName,
    createdAt = new Date().toISOString(),
    tenderPayments = [],
    _id = '',
    status = 'paid', // Get status from transaction, default to 'paid'
  } = transaction;

  // Use locationName or location, fallback to company display name
  const displayLocation = locationName || location || settings?.companyDisplayName || "St's Michael Hub";

  const {
    companyDisplayName = "St's Michael Hub",
    companyLogo = '/images/st-micheals-logo.png',
    storePhone = '',
    email = '',
    website = '',
    taxNumber = '',
    refundDays = 0,
    receiptMessage = '',
    qrUrl = '',
    qrDescription = '',
  } = settings;

  const formatNaira = (amount) => {
    return `₦${(amount || 0).toLocaleString('en-NG', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  };

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

  const itemsHTML = items.map((item, idx) => `
    <tr>
      <td style="text-align: left; padding: 2px 0;">${item.name}</td>
      <td style="text-align: center; padding: 2px 0;">${item.quantity}</td>
      <td style="text-align: right; padding: 2px 0;">${formatNaira(item.price * item.quantity)}</td>
    </tr>
  `).join('');

  const paymentItemsHTML = tenderPayments && tenderPayments.length > 0
    ? tenderPayments.map((payment, idx) => `
        <tr>
          <td style="text-align: left; padding: 1px 0;">${payment.tenderName || 'Unknown'}</td>
          <td style="text-align: right; padding: 1px 0;">${formatNaira(payment.amount)}</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td style="text-align: left; padding: 1px 0;">CASH</td>
          <td style="text-align: right; padding: 1px 0;">${formatNaira(total)}</td>
        </tr>
      `;

  const changeHTML = change > 0 ? `
    <tr style="border-top: 1px solid #000; margin-top: 3px;">
      <td style="text-align: left; padding: 3px 0; font-weight: bold;">CHANGE:</td>
      <td style="text-align: right; padding: 3px 0; font-weight: bold;">${formatNaira(change)}</td>
    </tr>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Transaction Receipt</title>
        <style>
          * { margin: 0; padding: 0; }
          body {
            font-family: 'Courier New', monospace;
            width: 58mm;
            margin: 0;
            padding: 2mm;
            background: white;
            font-size: 10pt;
            line-height: 1.1;
          }
          .receipt {
            width: 100%;
            color: #000;
            text-align: center;
          }
          .header {
            text-align: center;
            border-bottom: 1px solid #000;
            padding-bottom: 2mm;
            margin-bottom: 2mm;
          }
          .logo {
            max-width: 40mm;
            max-height: 24mm;
            width: auto;
            height: auto;
            display: block;
            margin: 0 auto 2mm auto;
            filter: grayscale(100%);
          }
          .company-name {
            font-weight: bold;
            font-size: 12pt;
            letter-spacing: 1px;
            margin: 1mm 0;
          }
          .company-info {
            font-size: 8pt;
            line-height: 1.3;
          }

          .details {
            font-size: 9pt;
            margin: 0.5mm 0;
            text-align: left;
          }
          .detail-row {
            display: flex;
            justify-content: space-between;
            margin: 0.3mm 0;
            text-align: left;
          }
          .items-section {
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 1mm 0;
            margin: 1mm 0;
            text-align: left;
          }
          .items-header {
            display: grid;
            grid-template-columns: 1fr 0.5fr 0.75fr;
            gap: 2mm;
            font-weight: bold;
            margin-bottom: 0.5mm;
            font-size: 8pt;
            text-align: left;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9pt;
            text-align: left;
          }
          .items-table td {
            padding: 0.3mm 0;
          }
          .totals {
            margin: 0.5mm 0;
            font-size: 9pt;
            text-align: left;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin: 0.3mm 0;
            text-align: left;
          }
          .final-total {
            font-weight: bold;
            font-size: 11pt;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 1mm 0;
            margin: 1mm 0;
          }
          .payment-section {
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 1mm 0;
            margin: 1mm 0;
            text-align: left;
          }
          .payment-title {
            font-weight: bold;
            font-size: 9pt;
            margin-bottom: 0.5mm;
          }
          .payment-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9pt;
          }
          .payment-table td {
            padding: 0.3mm 0;
          }
          .thank-you {
            text-align: center;
            font-weight: bold;
            font-size: 12pt;
            margin: 1mm 0;
          }
          .footer {
            text-align: center;
            font-size: 8pt;
            margin-top: 1mm;
            padding-top: 1mm;
            border-top: 1px solid #000;
          }
          .status-box {
            text-align: center;
            font-weight: bold;
            font-size: 12pt;
            border: 2px solid #000;
            padding: 1mm;
            margin: 1mm 0;
          }
          .message {
            text-align: center;
            font-size: 8pt;
            margin: 0.5mm 0;
            padding: 1mm 0;
            border-top: 1px solid #000;
            white-space: pre-wrap;
          }
          .qr-section {
            text-align: center;
            margin: 1mm 0;
            padding: 1mm 0;
            border-top: 1px solid #000;
          }
          @media print {
            html, body { 
              margin: 0 !important; 
              padding: 2mm !important;
              width: 58mm;
              height: auto;
              background: white;
            }
            .receipt {
              width: 100%;
              margin: 0;
              padding: 0;
            }
            @page {
              size: 58mm auto;
              margin: 0;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <!-- Header -->
          <div class="header">
            ${companyLogo ? `<div style="text-align: center;"><img src="${companyLogo}" class="logo" alt="Logo" onerror="this.style.display='none'"></div>` : ''}
            <div class="company-name">${companyDisplayName}</div>
            <div class="company-info">
              <div>${displayLocation}</div>
              ${storePhone ? `<div>Tel: ${storePhone}</div>` : ''}
              ${email ? `<div>${email}</div>` : ''}
              ${website ? `<div>${website}</div>` : ''}
              ${taxNumber ? `<div>Tax ID: ${taxNumber}</div>` : ''}
            </div>
          </div>

          <!-- Receipt Details -->
          <div class="details">
            <div style="font-weight: bold; margin-bottom: 2mm;">Receipt of Purchase (Inc Tax)</div>
            <div class="detail-row">
              <span>${formatDateTime(createdAt)}</span>
              <span>${_id.substring(0, 8).toUpperCase()}</span>
            </div>
            <div class="detail-row">
              <span>Staff: ${staffName}</span>
              <span>Till #1</span>
            </div>
          </div>

          <!-- Items -->
          <div class="items-section">
            <table style="width: 100%; font-size: 8pt;">
              <thead>
                <tr style="font-weight: bold;">
                  <td style="text-align: left;">PRODUCT</td>
                  <td style="text-align: center;">QTY</td>
                  <td style="text-align: right;">PRICE</td>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
                <tr style="border-top: 1px solid #ccc; margin-top: 2mm; padding-top: 2mm;">
                  <td style="text-align: left;"></td>
                  <td style="text-align: center; font-weight: bold;">Total: ${items.reduce((sum, item) => sum + item.quantity, 0)} Items</td>
                  <td style="text-align: right;"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Totals -->
          <div class="totals">
            <div class="total-row">
              <span>Subtotal:</span>
              <span>${formatNaira(subtotal)}</span>
            </div>
            ${tax > 0 ? `<div class="total-row"><span>Tax:</span><span>${formatNaira(tax)}</span></div>` : ''}
            ${discount > 0 ? `<div class="total-row"><span>Discount:</span><span>-${formatNaira(discount)}</span></div>` : ''}
            <div class="final-total">
              <div class="total-row">
                <span>TOTAL:</span>
                <span>${formatNaira(total)}</span>
              </div>
            </div>
          </div>

          <!-- Payment -->
          <div class="payment-section">
            <div class="payment-title">PAYMENT BY TENDER</div>
            <table class="payment-table">
              <tbody>
                ${paymentItemsHTML}
              </tbody>
            </table>
          </div>

          ${changeHTML}

          <!-- Thank You -->
          <div class="thank-you">🙏 THANK YOU! 🙏</div>

          <!-- Additional Info -->
          ${refundDays > 0 ? `<div style="text-align: center; font-size: 8pt;">Refund within ${refundDays} days with receipt</div>` : ''}

          <!-- Status -->
          <div class="status-box" style="${status === 'UNPAID' ? 'color: red; border-color: red;' : ''}">${status === 'UNPAID' ? 'UNPAID' : 'PAID'}</div>

          <!-- Message -->
          ${receiptMessage ? `<div class="message">${receiptMessage}</div>` : ''}

          <!-- QR Code -->
          ${qrUrl ? `
            <div class="qr-section">
              ${qrDescription ? `<div style="font-weight: bold; font-size: 8pt; margin-bottom: 2mm;">${qrDescription}</div>` : ''}
              <div style="background: #f0f0f0; border: 1px solid #000; width: 30mm; height: 30mm; margin: 2mm auto; display: flex; align-items: center; justify-content: center; font-size: 8pt;">[QR CODE]</div>
            </div>
          ` : ''}

          <!-- Footer -->
          <div class="footer">
            <div style="margin-top: 2mm;">Thank you for shopping with us!</div>
          </div>
        </div>
      </body>
    </html>
  `;
}
