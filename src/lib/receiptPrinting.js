/**
 * Receipt Printing Utility
 * 
 * Handles automatic receipt generation and printing after payment completion
 * Supports both browser printing and direct thermal printer (ESC/POS)
 * Fetches receipt settings from API and generates formatted receipts
 */

import { getPrinterSettings, sendDirectPrint } from './printerConfig';
import { getStoreLogo } from './logoCache';

/**
 * Get receipt settings from API with local caching
 * Uses localStorage cache first, then refreshes from API in background
 * @returns {Promise<Object>} Receipt settings including logo, company info, messages
 */
const RECEIPT_SETTINGS_CACHE_KEY = 'cachedReceiptSettings';

function getCachedReceiptSettings() {
  try {
    const cached = localStorage.getItem(RECEIPT_SETTINGS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return null;
}

function cacheReceiptSettings(settings) {
  try {
    localStorage.setItem(RECEIPT_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {}
}

export async function getReceiptSettings() {
  // Always use cached logo from logoCache for the logo field
  const cachedLogo = getStoreLogo();
  const cached = getCachedReceiptSettings();

  // If we have cached settings, return immediately and refresh in background
  if (cached) {
    const result = { ...cached, companyLogo: cachedLogo };
    // Background refresh if online (non-blocking)
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      fetch('/api/receipt-settings', { signal: AbortSignal.timeout(3000) })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.settings) cacheReceiptSettings(data.settings); })
        .catch(() => {});
    }
    return result;
  }

  // No cache — must fetch (but only if online)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      companyDisplayName: "St's Michael Hub",
      companyLogo: cachedLogo,
      storePhone: '',
      email: '',
      website: '',
      businessAddress: '',
      taxNumber: '',
      refundDays: 0,
      receiptMessage: 'Thank you for shopping with us!',
      qrUrl: '',
      qrDataUrl: '',
      qrDescription: '',
      paymentStatus: 'paid',
      fontSize: '8.0',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('/api/receipt-settings', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error('Failed to fetch receipt settings');
    }
    const data = await response.json();
    const settings = data.settings || {};
    cacheReceiptSettings(settings);
    return { ...settings, companyLogo: cachedLogo || settings.companyLogo };
  } catch (error) {
    console.error('❌ Error fetching receipt settings:', error);
    return {
      companyDisplayName: "St's Michael Hub",
      companyLogo: cachedLogo,
      storePhone: '',
      email: '',
      website: '',
      businessAddress: '',
      taxNumber: '',
      refundDays: 0,
      receiptMessage: 'Thank you for shopping with us!',
      qrUrl: '',
      qrDataUrl: '',
      qrDescription: '',
      paymentStatus: 'paid',
      fontSize: '8.0',
    };
  }
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeReceiptFontSize(fontSize) {
  const parsed = Number.parseFloat(fontSize);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(9.5, Math.max(7.2, parsed));
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

    const shouldTryDirect = printerSettings.enabled &&
      (printerSettings.printMethod === 'direct' || printerSettings.printMethod === 'both') &&
      (printerSettings.connectionMode === 'usb' || printerSettings.connectionMode === 'network');

    const shouldTryBrowser = !printerSettings.enabled ||
      printerSettings.printMethod === 'browser' ||
      printerSettings.printMethod === 'both';

    let directSuccess = false;

    // Try direct thermal print if configured
    if (shouldTryDirect) {
      try {
        const directResult = await sendDirectPrint(transaction, settings, printerSettings).catch(() => null);
        directSuccess = directResult?.success === true;
        if (directSuccess) {
          console.log('🖨️ Direct print succeeded');
        }
      } catch (error) {
        console.warn('⚠️ Direct print failed, will try fallback');
      }
    }

    if (printerSettings.enabled && printerSettings.autoPrint && !directSuccess) {
      printerSettings.autoPrint = false;
    }

    // If autoPrint is enabled, skip browser dialog entirely regardless of result
    if (printerSettings.enabled && printerSettings.autoPrint) {
      if (directSuccess) {
        console.log('🖨️ Auto-printed via direct print (no dialog)');
      } else {
        console.warn('⚠️ Auto-print enabled but direct print failed — skipping browser dialog');
      }
      return;
    }

    // If method is direct-only, don't fall back to browser
    if (printerSettings.enabled && printerSettings.printMethod === 'direct') {
      if (!directSuccess) {
        console.warn('⚠️ Direct print failed — direct-only mode, no browser fallback');
      }
      return;
    }

    // Skip browser print if direct already succeeded (method = 'both')
    if (directSuccess) {
      return;
    }

    // Show browser print dialog for 'browser' or 'both' (when direct failed) methods
    if (!shouldTryBrowser) return;

    console.log('🖨️ Showing branded print preview...');
    
    const receiptHTML = generateReceiptHTML(transaction, settings);

    // Check if user wants the print preview modal or silent print
    let showPreview = true;
    try {
      const stored = localStorage.getItem('uiSettings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.system?.showPrintPreview === false) showPreview = false;
      }
    } catch (e) {}

    if (!showPreview) {
      // Silent print — skip modal, print directly via hidden iframe
      console.log('🖨️ Silent print mode — skipping preview modal');
      silentPrintHTML(receiptHTML);
      return;
    }

    // Try to show branded print preview overlay (if component is mounted)
    try {
      const printEvent = new CustomEvent('printPreview:show', {
        detail: {
          receiptHTML,
          companyName: settings?.companyDisplayName || '',
          transaction,
        },
      });
      window.dispatchEvent(printEvent);
      console.log('✅ Branded print preview dispatched');
      return; // The PrintPreview component handles the actual printing
    } catch (previewError) {
      console.warn('⚠️ Branded preview failed, falling back to iframe print:', previewError);
    }
    
    // Fallback: direct iframe print if branded preview isn't available
    console.log('🖨️ Fallback: Showing print dialog...');
    
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

      // Wait for all images to load before printing
      const waitForImages = () => {
        const images = iframe.contentDocument.querySelectorAll('img');
        if (images.length === 0) {
          doPrint();
          return;
        }
        let loaded = 0;
        const onImageReady = () => {
          loaded++;
          if (loaded >= images.length) doPrint();
        };
        images.forEach((img) => {
          if (img.complete) {
            onImageReady();
          } else {
            img.addEventListener('load', onImageReady, { once: true });
            img.addEventListener('error', onImageReady, { once: true });
          }
        });
      };
      
      // Listen for afterprint event (fires when print dialog closes)
      iframe.contentWindow.addEventListener('afterprint', () => {
        console.log('📄 Print dialog closed');
        cleanupIframe();
      }, { once: true });
      
      // Wait for document load, then wait for images
      iframe.contentWindow.addEventListener('load', waitForImages, { once: true });
      
      // Fallback: if load already fired
      if (iframe.contentDocument.readyState === 'complete') {
        waitForImages();
      }
      
      // Safety timeout: ensure print happens within 1.5 seconds even if images fail
      setTimeout(() => {
        doPrint();
      }, 1500);
      
      // Final safety cleanup (if nothing else triggered)
      setTimeout(() => {
        cleanupIframe();
      }, 8000); // Max 8 seconds before cleanup
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
 * Silent print — sends receipt HTML to printer via a hidden iframe
 * Uses a print-specific CSS approach that tries to bypass the OS dialog.
 * Falls back to iframe.contentWindow.print() which may still show the dialog
 * on some browsers, but avoids the branded preview modal.
 */
function silentPrintHTML(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  iframe.contentDocument.write(html);
  iframe.contentDocument.close();

  let hasPrinted = false;
  const doPrint = () => {
    if (hasPrinted) return;
    hasPrinted = true;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('Silent print error:', e);
    }
    setTimeout(() => {
      try { if (iframe.parentNode) document.body.removeChild(iframe); } catch (e) {}
    }, 3000);
  };

  const waitForImages = () => {
    const images = iframe.contentDocument.querySelectorAll('img');
    if (images.length === 0) { doPrint(); return; }
    let loaded = 0;
    const onReady = () => { loaded++; if (loaded >= images.length) doPrint(); };
    images.forEach((img) => {
      if (img.complete) onReady();
      else {
        img.addEventListener('load', onReady, { once: true });
        img.addEventListener('error', onReady, { once: true });
      }
    });
  };

  if (iframe.contentDocument.readyState === 'complete') {
    waitForImages();
  } else {
    iframe.contentWindow.addEventListener('load', waitForImages, { once: true });
  }
  setTimeout(doPrint, 1500);
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
    incrementAmount = 0,
    promotionValueType = null,
    customerType = '',
    change = 0,
    staffName = 'Unknown Staff',
    location,
    locationName,
    locationAddress,
    createdAt = new Date().toISOString(),
    tenderPayments = [],
    _id = '',
    status = 'paid', // Get status from transaction, default to 'paid'
  } = transaction;

  // Use locationName or location, fallback to company display name
  const displayLocation = locationName || location || settings?.companyDisplayName || "St's Michael Hub";
  const displayAddress = locationAddress || settings?.businessAddress || '';

  const {
    companyDisplayName = "St's Michael Hub",
    companyLogo: rawLogo = '',
    storePhone = '',
    email = '',
    website = '',
    businessAddress = '',
    taxNumber = '',
    refundDays = 0,
    receiptMessage = '',
    qrUrl = '',
    qrDataUrl = '',
    qrDescription = '',
    paymentStatus = 'paid',
    fontSize = '8.0',
  } = settings;

  // Ensure logo URL is absolute for print context (iframe/new window)
  const fallbackLogo = getStoreLogo();
  const logoSrc = rawLogo || fallbackLogo;
  const companyLogo = logoSrc && logoSrc !== '/images/placeholder.jpg'
    ? (logoSrc.startsWith('http') || logoSrc.startsWith('data:')
        ? logoSrc
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${logoSrc.startsWith('/') ? '' : '/'}${logoSrc}`)
    : '';

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
      hour12: false,
    });
  };

  const receiptFontSize = normalizeReceiptFontSize(fontSize);
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const shortReceiptId = String(_id || '').substring(0, 8).toUpperCase() || 'RECEIPT';
  const receiptStatus = String(status || paymentStatus || 'paid').trim().toUpperCase() || 'PAID';
  const incrementLabel = incrementAmount > 0 || promotionValueType === 'INCREMENT'
    ? (customerType || 'Service Fee')
    : '';
  const incrementValue = incrementAmount || (promotionValueType === 'INCREMENT' ? discount : 0);
  const contactLine = [
    storePhone ? `Tel: ${storePhone}` : '',
    website,
    email,
  ].filter(Boolean).join(' • ');
  const renderedItems = items.length > 0 ? items : [{ name: 'No items', quantity: 0, price: 0 }];

  const itemsHTML = renderedItems.map((item) => {
    const quantity = Number(item.quantity || 0);
    const lineTotal = Number(item.price || 0) * quantity;
    return `
      <tr>
        <td class="item-name">${escapeHTML(item.name || 'Item')}</td>
        <td class="item-qty">${escapeHTML(quantity)}</td>
        <td class="item-amount">${escapeHTML(formatNaira(lineTotal))}</td>
      </tr>
    `;
  }).join('');

  const paymentItemsHTML = tenderPayments && tenderPayments.length > 0
    ? tenderPayments.map((payment) => `
        <div class="summary-row">
          <span>${escapeHTML(payment.tenderName || 'Unknown')}</span>
          <span>${escapeHTML(formatNaira(payment.amount))}</span>
        </div>
      `).join('')
    : `
        <div class="summary-row">
          <span>CASH</span>
          <span>${escapeHTML(formatNaira(total))}</span>
        </div>
      `;

  const qrMarkup = qrDataUrl
    ? `<img src="${escapeHTML(qrDataUrl)}" class="qr-image" alt="QR code" />`
    : (qrUrl ? `<div class="qr-link">${escapeHTML(qrUrl)}</div>` : '');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Transaction Receipt</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          :root { --receipt-font-size: ${receiptFontSize}pt; }
          html, body {
            margin: 0;
            padding: 0;
            background: white;
          }
          body {
            font-family: 'Roboto Mono', 'Courier New', monospace;
            font-size: var(--receipt-font-size);
            line-height: 1.18;
            color: #111;
            overflow-x: hidden;
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
            margin: 0;
            padding: 1.7mm 1.35mm 1.35mm;
          }
          .header,
          .section,
          .footer {
            border-top: 1px dashed #000;
            padding-top: 1.05mm;
            margin-top: 1.05mm;
          }
          .header {
            text-align: center;
            border-top: none;
            padding-top: 0;
            margin-top: 0;
          }
          .logo {
            max-width: 28mm;
            max-height: 12mm;
            width: auto;
            height: auto;
            display: block;
            margin: 0 auto 1.2mm auto;
            filter: grayscale(100%) contrast(1.05);
          }
          .company-name {
            font-weight: bold;
            font-size: 1.15em;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .company-line,
          .compact-text,
          .message,
          .qr-link {
            font-size: 0.84em;
            line-height: 1.24;
            word-break: break-word;
          }
          .company-line + .company-line {
            margin-top: 0.35mm;
          }
          .receipt-title {
            font-weight: bold;
            font-size: 0.96em;
            margin-bottom: 0.65mm;
            text-transform: uppercase;
          }
          .meta-row,
          .summary-row {
            display: flex;
            justify-content: space-between;
            gap: 2mm;
            margin: 0.35mm 0;
            align-items: flex-start;
          }
          .meta-row span:first-child,
          .summary-row span:first-child {
            flex: 1;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-top: 0.3mm;
          }
          .items-table th {
            font-size: 0.82em;
            padding-bottom: 0.45mm;
            text-transform: uppercase;
          }
          .items-table td {
            padding: 0.38mm 0;
            vertical-align: top;
          }
          .items-table th:first-child,
          .item-name {
            text-align: left;
          }
          .item-name {
            width: 68%;
            padding-right: 1.5mm;
            word-break: break-word;
          }
          .item-qty,
          .items-table th:nth-child(2) {
            width: 12%;
            text-align: center;
          }
          .item-amount,
          .items-table th:last-child {
            width: 20%;
            text-align: right;
          }
          .minor-rule {
            border-top: 1px solid #c7c7c7;
            margin-top: 0.7mm;
            padding-top: 0.7mm;
          }
          .summary-row.strong {
            font-weight: bold;
            font-size: 1.03em;
          }
          .footer {
            text-align: center;
          }
          .footer-note {
            font-weight: bold;
            margin-top: 0.85mm;
          }
          .status-line {
            margin-top: 0.9mm;
            padding-top: 0.8mm;
            border-top: 1px dashed #000;
            font-weight: bold;
            font-size: 0.9em;
            letter-spacing: 0.12em;
          }
          .status-line.alert {
            background: #efefef;
            border: 1px solid #111;
            padding: 0.65mm 0;
          }
          .qr-section {
            text-align: center;
            margin-top: 0.9mm;
          }
          .qr-image {
            width: 18mm;
            height: 18mm;
            margin: 0.75mm auto;
            image-rendering: pixelated;
          }
          .message {
            margin-top: 0.8mm;
            white-space: pre-wrap;
          }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              height: auto;
              background: white;
              overflow-x: hidden;
            }
            .receipt-page {
              width: 58mm;
              min-width: 58mm;
              max-width: 58mm;
              margin: 0 auto !important;
              padding: 0 !important;
            }
            .receipt {
              width: 100%;
              margin: 0;
              padding: 1.7mm 1.35mm 1.35mm;
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
        <div class="receipt-page">
        <div class="receipt">
          <div class="header">
            ${companyLogo ? `<img src="${escapeHTML(companyLogo)}" class="logo" alt="Logo" onerror="this.style.display='none'">` : ''}
            <div class="company-name">${escapeHTML(companyDisplayName)}</div>
            <div class="company-line">${escapeHTML(displayLocation)}</div>
            ${displayAddress ? `<div class="company-line">${escapeHTML(displayAddress)}</div>` : ''}
            ${contactLine ? `<div class="company-line compact-text">${escapeHTML(contactLine)}</div>` : ''}
            ${taxNumber ? `<div class="company-line compact-text">Tax ID: ${escapeHTML(taxNumber)}</div>` : ''}
          </div>

          <div class="section">
            <div class="receipt-title">${tax > 0 ? 'Sales Receipt (Inc Tax)' : 'Sales Receipt'}</div>
            <div class="meta-row">
              <span>${escapeHTML(formatDateTime(createdAt))}</span>
              <span>${escapeHTML(shortReceiptId)}</span>
            </div>
            <div class="meta-row">
              <span>Staff: ${escapeHTML(staffName)}</span>
              <span>${customerType ? escapeHTML(customerType) : ''}</span>
            </div>
          </div>

          <div class="section">
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Amt</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
              </tbody>
            </table>
            <div class="summary-row minor-rule compact-text">
              <span>Total Qty</span>
              <span>${escapeHTML(totalQuantity)}</span>
            </div>
          </div>

          <div class="section">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>${escapeHTML(formatNaira(subtotal))}</span>
            </div>
            ${tax > 0 ? `<div class="summary-row"><span>Tax:</span><span>${escapeHTML(formatNaira(tax))}</span></div>` : ''}
            ${discount > 0 && promotionValueType !== 'INCREMENT' ? `<div class="summary-row"><span>Discount:</span><span>-${escapeHTML(formatNaira(discount))}</span></div>` : ''}
            ${incrementLabel ? `<div class="summary-row"><span>${escapeHTML(incrementLabel)}:</span><span>${escapeHTML(formatNaira(incrementValue))}</span></div>` : ''}
            <div class="summary-row strong minor-rule">
              <span>Total</span>
              <span>${escapeHTML(formatNaira(total))}</span>
            </div>
            ${change > 0 ? `<div class="summary-row strong"><span>Change</span><span>${escapeHTML(formatNaira(change))}</span></div>` : ''}
          </div>

          <div class="section">
            <div class="receipt-title">Payment</div>
            ${paymentItemsHTML}
          </div>

          <div class="footer">
            ${refundDays > 0 ? `<div class="compact-text">Refund within ${escapeHTML(refundDays)} days with receipt</div>` : ''}
            ${receiptMessage ? `<div class="message">${escapeHTML(receiptMessage)}</div>` : ''}
            ${(qrDataUrl || qrUrl) ? `
              <div class="qr-section">
                ${qrDescription ? `<div class="compact-text">${escapeHTML(qrDescription)}</div>` : ''}
                ${qrMarkup}
              </div>
            ` : ''}
            <div class="footer-note">Thank You</div>
            <div class="status-line ${receiptStatus === 'PAID' ? '' : 'alert'}">${escapeHTML(receiptStatus)}</div>
          </div>
        </div>
        </div>
      </body>
    </html>
  `;
}
