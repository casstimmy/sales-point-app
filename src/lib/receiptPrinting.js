/**
 * Receipt Printing Utility
 *
 * Handles automatic receipt generation and printing after payment completion.
 * Supports both browser printing and direct thermal printer (ESC/POS).
 */

import { getPrinterSettings, sendDirectPrint } from './printerConfig';
import { getStoreLogo } from './logoCache';

const RECEIPT_SETTINGS_CACHE_KEY = 'cachedReceiptSettings';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeAssetUrl(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed;
  }

  return '';
}

function normalizeReceiptFontSize(value, fallback = 10) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(11.5, Math.max(8.5, parsed));
}

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
  const cachedLogo = getStoreLogo();
  const cached = getCachedReceiptSettings();

  if (cached) {
    const result = { ...cached, companyLogo: cachedLogo || cached.companyLogo };

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      fetch('/api/receipt-settings', { signal: AbortSignal.timeout(3000) })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data?.settings) cacheReceiptSettings(data.settings);
        })
        .catch(() => {});
    }

    return result;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      companyDisplayName: "St's Michael Hub",
      companyLogo: cachedLogo,
      storePhone: '',
      email: '',
      website: '',
      businessAddress: '',
      refundDays: 0,
      receiptMessage: 'Thank you for shopping with us!',
      fontSize: '10.0',
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
    console.error('Error fetching receipt settings:', error);
    return {
      companyDisplayName: "St's Michael Hub",
      companyLogo: cachedLogo,
      storePhone: '',
      email: '',
      website: '',
      businessAddress: '',
      refundDays: 0,
      receiptMessage: 'Thank you for shopping with us!',
      fontSize: '10.0',
    };
  }
}

export async function printTransactionReceipt(transaction, receiptSettings) {
  try {
    if (!transaction) {
      console.warn('No transaction to print');
      return;
    }

    const settings = receiptSettings || (await getReceiptSettings());
    const printerSettings = getPrinterSettings();

    const shouldTryDirect =
      printerSettings.enabled &&
      (printerSettings.printMethod === 'direct' || printerSettings.printMethod === 'both') &&
      (printerSettings.connectionMode === 'usb' || printerSettings.connectionMode === 'network');

    const shouldTryBrowser =
      !printerSettings.enabled ||
      printerSettings.printMethod === 'browser' ||
      printerSettings.printMethod === 'both';

    let directSuccess = false;

    if (shouldTryDirect) {
      try {
        const directResult = await sendDirectPrint(transaction, settings, printerSettings).catch(() => null);
        directSuccess = directResult?.success === true;
        if (directSuccess) {
          console.log('Direct print succeeded');
        }
      } catch {
        console.warn('Direct print failed, will try fallback');
      }
    }

    if (printerSettings.enabled && printerSettings.autoPrint && !directSuccess) {
      printerSettings.autoPrint = false;
    }

    if (printerSettings.enabled && printerSettings.autoPrint) {
      if (directSuccess) {
        console.log('Auto-printed via direct print');
      } else {
        console.warn('Auto-print enabled but direct print failed, skipping browser dialog');
      }
      return;
    }

    if (printerSettings.enabled && printerSettings.printMethod === 'direct') {
      if (!directSuccess) {
        console.warn('Direct print failed in direct-only mode');
      }
      return;
    }

    if (directSuccess || !shouldTryBrowser) {
      return;
    }

    const receiptHTML = generateReceiptHTML(transaction, settings);

    let showPreview = true;
    try {
      const stored = localStorage.getItem('uiSettings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.system?.showPrintPreview === false) showPreview = false;
      }
    } catch {}

    if (!showPreview) {
      silentPrintHTML(receiptHTML);
      return;
    }

    try {
      const printEvent = new CustomEvent('printPreview:show', {
        detail: {
          receiptHTML,
          companyName: settings?.companyDisplayName || '',
          transaction,
        },
      });
      window.dispatchEvent(printEvent);
      return;
    } catch (previewError) {
      console.warn('Branded preview failed, falling back to iframe print:', previewError);
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    iframe.contentDocument.write(receiptHTML);
    iframe.contentDocument.close();

    try {
      iframe.contentWindow.focus();

      let hasPrinted = false;
      let cleanupScheduled = false;

      const cleanupIframe = () => {
        if (cleanupScheduled) return;
        cleanupScheduled = true;

        setTimeout(() => {
          try {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          } catch {}
        }, 3000);
      };

      const doPrint = () => {
        if (hasPrinted) return;
        hasPrinted = true;

        try {
          iframe.contentWindow.print();
          cleanupIframe();
        } catch (error) {
          console.error('Print error:', error);
          cleanupIframe();
        }
      };

      const waitForImages = () => {
        const images = iframe.contentDocument.querySelectorAll('img');
        if (images.length === 0) {
          doPrint();
          return;
        }

        let loaded = 0;
        const onImageReady = () => {
          loaded += 1;
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

      iframe.contentWindow.addEventListener(
        'afterprint',
        () => {
          cleanupIframe();
        },
        { once: true }
      );

      iframe.contentWindow.addEventListener('load', waitForImages, { once: true });

      if (iframe.contentDocument.readyState === 'complete') {
        waitForImages();
      }

      setTimeout(doPrint, 1500);
      setTimeout(cleanupIframe, 8000);
    } catch (printError) {
      console.error('Print error:', printError);
      try {
        document.body.removeChild(iframe);
      } catch {}
    }
  } catch (error) {
    console.error('Error printing receipt:', error);
  }
}

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
    } catch (error) {
      console.error('Silent print error:', error);
    }

    setTimeout(() => {
      try {
        if (iframe.parentNode) document.body.removeChild(iframe);
      } catch {}
    }, 3000);
  };

  const waitForImages = () => {
    const images = iframe.contentDocument.querySelectorAll('img');
    if (images.length === 0) {
      doPrint();
      return;
    }

    let loaded = 0;
    const onReady = () => {
      loaded += 1;
      if (loaded >= images.length) doPrint();
    };

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
    locationAddress,
    createdAt = new Date().toISOString(),
    tenderPayments = [],
    _id = '',
    status = 'paid',
  } = transaction;

  const displayLocation = locationName || location || settings?.companyDisplayName || "St's Michael Hub";
  const displayAddress = locationAddress || settings?.businessAddress || '';

  const {
    companyDisplayName = "St's Michael Hub",
    companyLogo: rawLogo = '',
    storePhone = '',
    email = '',
    website = '',
    taxNumber = '',
    refundDays = 0,
    receiptMessage = '',
    qrUrl = '',
    qrDescription = '',
    fontSize = '10.0',
  } = settings;

  const fallbackLogo = getStoreLogo();
  const logoSrc = rawLogo || fallbackLogo;
  const companyLogo =
    logoSrc && logoSrc !== '/images/placeholder.jpg'
      ? logoSrc.startsWith('http') || logoSrc.startsWith('data:')
        ? logoSrc
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${logoSrc.startsWith('/') ? '' : '/'}${logoSrc}`
      : '';

  const safeCompanyLogo = sanitizeAssetUrl(companyLogo);
  const safeQrUrl = sanitizeAssetUrl(qrUrl);
  const normalizedStatus = String(status || 'paid').toUpperCase() === 'UNPAID' ? 'UNPAID' : 'PAID';
  const itemCount = items.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
  const baseFontSize = normalizeReceiptFontSize(fontSize, 10);
  const bodyFontSize = `${baseFontSize.toFixed(1)}pt`;
  const compactFontSize = `${Math.max(baseFontSize - 1.1, 7.1).toFixed(1)}pt`;
  const smallFontSize = `${Math.max(baseFontSize - 1.6, 6.7).toFixed(1)}pt`;
  const titleFontSize = `${Math.min(baseFontSize + 2.0, 13.0).toFixed(1)}pt`;
  const totalFontSize = `${Math.min(baseFontSize + 1.0, 11.5).toFixed(1)}pt`;

  const formatNaira = (amount) =>
    `\u20A6${Number(amount || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

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

  const itemsHTML = items
    .map((item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.price) || 0;
      const lineTotal = quantity * unitPrice;

      return `
      <div class="item-row">
        <div class="item-copy">
          <div class="item-name">${escapeHtml(item?.name || 'Item')}</div>
          <div class="item-meta">${escapeHtml(`${quantity} x ${formatNaira(unitPrice)}`)}</div>
        </div>
        <div class="item-total amount">${escapeHtml(formatNaira(lineTotal))}</div>
      </div>
    `;
    })
    .join('');

  const paymentItemsHTML =
    tenderPayments && tenderPayments.length > 0
      ? tenderPayments
          .map(
            (payment) => `
        <div class="data-row">
          <span>${escapeHtml(payment?.tenderName || 'Unknown')}</span>
          <strong class="amount">${escapeHtml(formatNaira(payment?.amount || 0))}</strong>
        </div>
      `
          )
          .join('')
      : `
        <div class="data-row">
          <span>CASH</span>
          <strong class="amount">${escapeHtml(formatNaira(total))}</strong>
        </div>
      `;

  const changeHTML =
    change > 0
      ? `
    <div class="change-card">
      <span>Change Due</span>
      <strong class="amount">${escapeHtml(formatNaira(change))}</strong>
    </div>
  `
      : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Transaction Receipt</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: white;
          }
          body {
            font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            font-size: ${bodyFontSize};
            line-height: 1.35;
            color: #111827;
            overflow-x: hidden;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-page {
            width: 58mm;
            min-width: 58mm;
            max-width: 58mm;
            margin: 0 auto;
            padding: 0;
            background: white;
          }
          .receipt {
            width: 100%;
            margin: 0;
            padding: 2.6mm 2.3mm 3.2mm;
            color: #111827;
          }
          .eyebrow {
            margin-bottom: 1.2mm;
            text-align: center;
            font-size: ${smallFontSize};
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #4b5563;
          }
          .header {
            text-align: center;
            border-bottom: 1px solid #111827;
            padding-bottom: 2.4mm;
            margin-bottom: 2.2mm;
          }
          .logo {
            max-width: 36mm;
            max-height: 18mm;
            width: auto;
            height: auto;
            display: block;
            margin: 0 auto 1.6mm auto;
            filter: grayscale(100%);
          }
          .company-name {
            margin-bottom: 1mm;
            font-family: 'Arial Narrow', 'Segoe UI', Arial, sans-serif;
            font-weight: 700;
            font-size: ${titleFontSize};
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .company-info {
            font-size: ${compactFontSize};
            line-height: 1.4;
            color: #374151;
          }
          .receipt-title {
            margin: 2mm 0 1.4mm;
            text-align: center;
            font-size: ${compactFontSize};
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          .info-card {
            border: 1px solid #111827;
            border-radius: 1.8mm;
            padding: 1.6mm 1.5mm;
            margin-bottom: 1.8mm;
          }
          .meta-row,
          .data-row,
          .total-row,
          .change-card {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 2mm;
          }
          .meta-row + .meta-row,
          .data-row + .data-row,
          .total-row + .total-row {
            margin-top: 1mm;
          }
          .meta-label,
          .section-kicker {
            font-size: ${smallFontSize};
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: #4b5563;
          }
          .meta-value,
          .amount {
            font-family: 'Consolas', 'SFMono-Regular', 'Courier New', monospace;
            font-variant-numeric: tabular-nums;
          }
          .meta-value {
            text-align: right;
            font-size: ${compactFontSize};
            color: #111827;
          }
          .section {
            margin-top: 2mm;
          }
          .section-heading {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 2mm;
            padding-bottom: 1mm;
            margin-bottom: 1.2mm;
            border-bottom: 1px dashed #6b7280;
          }
          .section-title {
            font-size: ${compactFontSize};
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .section-count {
            font-size: ${smallFontSize};
            color: #6b7280;
          }
          .item-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 2mm;
            padding: 1.1mm 0;
            border-bottom: 1px dashed #d1d5db;
          }
          .item-row:last-child {
            border-bottom: none;
          }
          .item-copy {
            min-width: 0;
          }
          .item-name {
            font-weight: 700;
            line-height: 1.3;
            word-break: break-word;
          }
          .item-meta {
            margin-top: 0.4mm;
            font-size: ${smallFontSize};
            color: #6b7280;
          }
          .item-total {
            white-space: nowrap;
            font-size: ${compactFontSize};
            font-weight: 700;
          }
          .totals-card {
            border-top: 1px solid #111827;
            border-bottom: 1px solid #111827;
            padding: 1.4mm 0;
            margin-top: 0.6mm;
          }
          .total-row {
            font-size: ${compactFontSize};
          }
          .grand-total {
            padding-top: 1.2mm;
            margin-top: 1.2mm;
            border-top: 1px dashed #6b7280;
            font-size: ${totalFontSize};
            font-weight: 700;
          }
          .change-card {
            margin-top: 1.8mm;
            border: 1px solid #111827;
            border-radius: 1.8mm;
            padding: 1.2mm 1.4mm;
            font-size: ${compactFontSize};
          }
          .thank-you {
            margin-top: 2.2mm;
            text-align: center;
            font-size: ${totalFontSize};
            font-weight: 700;
            letter-spacing: 0.04em;
          }
          .policy {
            margin-top: 1mm;
            text-align: center;
            font-size: ${smallFontSize};
            color: #4b5563;
          }
          .status-wrap {
            text-align: center;
          }
          .status-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin: 2mm auto 0;
            min-width: 20mm;
            padding: 1mm 2.4mm;
            border: 1px solid #111827;
            border-radius: 999px;
            font-size: ${smallFontSize};
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }
          .message,
          .qr-section,
          .footer {
            margin-top: 2mm;
            padding-top: 1.6mm;
            border-top: 1px dashed #9ca3af;
          }
          .message {
            text-align: center;
            font-size: ${compactFontSize};
            white-space: pre-wrap;
            color: #1f2937;
          }
          .qr-section {
            text-align: center;
          }
          .qr-image {
            width: 24mm;
            height: 24mm;
            object-fit: contain;
            display: block;
            margin: 1.2mm auto 0;
          }
          .footer {
            text-align: center;
            font-size: ${smallFontSize};
            color: #4b5563;
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
              padding: 2.6mm 2.3mm 3.2mm;
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
            <div class="eyebrow">Official Receipt</div>
            <div class="header">
              ${safeCompanyLogo ? `<div style="text-align: center;"><img src="${escapeHtml(safeCompanyLogo)}" class="logo" alt="Logo" onerror="this.style.display='none'"></div>` : ''}
              <div class="company-name">${escapeHtml(companyDisplayName)}</div>
              <div class="company-info">
                <div>${escapeHtml(displayLocation)}</div>
                ${displayAddress ? `<div>${escapeHtml(displayAddress)}</div>` : ''}
                ${storePhone ? `<div>Tel: ${escapeHtml(storePhone)}</div>` : ''}
                ${email ? `<div>${escapeHtml(email)}</div>` : ''}
                ${website ? `<div>${escapeHtml(website)}</div>` : ''}
                ${taxNumber ? `<div>Tax ID: ${escapeHtml(taxNumber)}</div>` : ''}
              </div>
            </div>

            <div class="receipt-title">Receipt of Purchase</div>

            <div class="info-card">
              <div class="meta-row">
                <span class="meta-label">Receipt No</span>
                <span class="meta-value">${escapeHtml((_id || '').toString().substring(0, 8).toUpperCase() || 'PENDING')}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Date</span>
                <span class="meta-value">${escapeHtml(formatDateTime(createdAt))}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Cashier</span>
                <span class="meta-value">${escapeHtml(staffName)}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Status</span>
                <span class="meta-value">${normalizedStatus}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-heading">
                <span class="section-title">Items Purchased</span>
                <span class="section-count">${escapeHtml(`${itemCount} item${itemCount === 1 ? '' : 's'}`)}</span>
              </div>
              ${itemsHTML || '<div class="item-row"><div class="item-copy"><div class="item-name">No items</div></div><div class="item-total amount">\u20A60.00</div></div>'}
            </div>

            <div class="section">
              <div class="section-heading">
                <span class="section-title">Order Summary</span>
                <span class="section-kicker">Amount</span>
              </div>
              <div class="totals-card">
                <div class="total-row">
                  <span>Subtotal:</span>
                  <span class="amount">${escapeHtml(formatNaira(subtotal))}</span>
                </div>
                ${tax > 0 ? `<div class="total-row"><span>Tax:</span><span class="amount">${escapeHtml(formatNaira(tax))}</span></div>` : ''}
                ${discount > 0 ? `<div class="total-row"><span>Discount:</span><span class="amount">-${escapeHtml(formatNaira(discount))}</span></div>` : ''}
                <div class="total-row grand-total">
                  <span>Total:</span>
                  <span class="amount">${escapeHtml(formatNaira(total))}</span>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-heading">
                <span class="section-title">Payment</span>
                <span class="section-kicker">Tender</span>
              </div>
              ${paymentItemsHTML}
            </div>

            ${changeHTML}

            <div class="thank-you">Thank you for your purchase</div>
            ${refundDays > 0 ? `<div class="policy">Returns accepted within ${escapeHtml(refundDays)} days with this receipt.</div>` : ''}

            <div class="status-wrap">
              <div class="status-chip">${normalizedStatus}</div>
            </div>

            ${receiptMessage ? `<div class="message">${escapeHtml(receiptMessage)}</div>` : ''}

            ${safeQrUrl ? `
              <div class="qr-section">
                ${qrDescription ? `<div class="section-kicker">${escapeHtml(qrDescription)}</div>` : ''}
                <img src="${escapeHtml(safeQrUrl)}" class="qr-image" alt="QR code" onerror="this.closest('.qr-section').style.display='none'">
              </div>
            ` : ''}

            <div class="footer">
              <div>Please keep this receipt for support and returns.</div>
              <div style="margin-top: 0.8mm;">Powered by ${escapeHtml(companyDisplayName)}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}
