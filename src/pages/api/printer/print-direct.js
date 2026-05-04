/**
 * API Endpoint: POST /api/printer/print-direct
 * 
 * Sends ESC/POS commands directly to Xprinter XP-D200N thermal printer
 * Supports both USB and Network connection modes
 * 
 * Request body:
 * {
 *   "type": "receipt" | "thank-you",
 *   "transaction": { ...transaction data },
 *   "receiptSettings": { ...receipt settings },
 *   "printerIp": "192.168.1.100", // For network printer
 *   "printerPort": 9100 // For network printer
 * }
 */

import ESCPOSPrinter from '@/src/lib/escpos';

const RECEIPT_WIDTH = 32;

// Format Nigerian Naira
function formatNaira(amount) {
  return `₦${(amount || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Format date
function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-NG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function sanitizeText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateText(value, width) {
  const normalized = sanitizeText(value);
  if (normalized.length <= width) return normalized;
  if (width <= 1) return normalized.slice(0, width);
  return `${normalized.slice(0, width - 1)}...`;
}

function wrapText(value, width = RECEIPT_WIDTH) {
  const normalized = sanitizeText(value);
  if (!normalized) return [];

  const words = normalized.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }

      let remaining = word;
      while (remaining.length > width) {
        lines.push(`${remaining.slice(0, width - 1)}-`);
        remaining = remaining.slice(width - 1);
      }
      current = remaining;
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function alignLine(left, right, width = RECEIPT_WIDTH) {
  const safeRight = truncateText(right, Math.min(width - 1, sanitizeText(right).length || width - 1));
  const maxLeft = Math.max(0, width - safeRight.length - 1);
  const safeLeft = truncateText(left, maxLeft);
  const spaces = Math.max(1, width - safeLeft.length - safeRight.length);
  return `${safeLeft}${' '.repeat(spaces)}${safeRight}`;
}

function printWrapped(printer, text, alignment = 0, bold = false) {
  printer.setAlignment(alignment).setBold(bold);
  const lines = wrapText(text, RECEIPT_WIDTH);

  if (lines.length === 0) {
    printer.text('');
  } else {
    lines.forEach((line) => printer.text(line));
  }

  printer.setBold(false);
}

// Generate receipt ESC/POS commands
function generateReceiptCommands(transaction, settings) {
  const printer = new ESCPOSPrinter();
  printer.init();

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
    location = 'Default Location',
    locationName,
    locationAddress = '',
    createdAt = new Date().toISOString(),
    tenderPayments = [],
    _id = '',
    status = 'paid',
  } = transaction;

  const {
    companyDisplayName = "St's Michael Hub",
    storePhone = '',
    email = '',
    website = '',
    businessAddress = '',
    taxNumber = '',
    refundDays = 0,
    receiptMessage = '',
    qrUrl = '',
    qrDescription = 'Scan and leave feedback',
    paymentStatus = 'paid',
  } = settings;

  const displayLocation = locationName || location || companyDisplayName;
  const displayAddress = locationAddress || businessAddress;
  const contactLine = [storePhone ? `Tel: ${storePhone}` : '', website, email].filter(Boolean).join(' | ');
  const shortReceiptId = String(_id || '').substring(0, 8).toUpperCase() || 'RECEIPT';
  const totalItems = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const incrementLabel = incrementAmount > 0 || promotionValueType === 'INCREMENT'
    ? (customerType || 'Service Fee')
    : '';
  const incrementValue = incrementAmount || (promotionValueType === 'INCREMENT' ? discount : 0);
  const receiptStatus = String(status || paymentStatus || 'paid').trim().toUpperCase() || 'PAID';

  // Header
  printer.setAlignment(1).setSize(1, 1).setBold(true);
  wrapText(companyDisplayName.toUpperCase(), RECEIPT_WIDTH).forEach((line) => printer.text(line));
  printer.setBold(false);
  if (displayLocation) printWrapped(printer, displayLocation, 1);
  if (displayAddress) printWrapped(printer, displayAddress, 1);
  if (contactLine) printWrapped(printer, contactLine, 1);
  if (taxNumber) printWrapped(printer, `Tax ID: ${taxNumber}`, 1);

  printer.setAlignment(0).separator('-', RECEIPT_WIDTH);

  // Receipt Details
  printer.setBold(true);
  printer.text(tax > 0 ? 'SALES RECEIPT (INC TAX)' : 'SALES RECEIPT');
  printer.setBold(false);
  printer.text(alignLine(formatDateTime(createdAt), shortReceiptId));
  printer.text(truncateText(`STAFF: ${staffName}`, RECEIPT_WIDTH));
  if (customerType) {
    printer.text(truncateText(`CUSTOMER: ${customerType}`, RECEIPT_WIDTH));
  }

  printer.separator('-', RECEIPT_WIDTH);

  // Items
  printer.setBold(true);
  printer.text(alignLine('ITEM xQTY', 'AMT'));
  printer.setBold(false);
  items.forEach((item) => {
    const quantity = Number(item.quantity || 0);
    const lineTotal = formatNaira(Number(item.price || 0) * quantity);
    const descriptor = `${sanitizeText(item.name || 'Item')} x${quantity}`;
    printer.text(alignLine(descriptor, lineTotal));
  });
  printer.text(alignLine('Total Qty', String(totalItems)));

  printer.separator('-', RECEIPT_WIDTH);

  // Totals
  printer.text(alignLine('Subtotal', formatNaira(subtotal)));
  if (tax > 0) {
    printer.text(alignLine('Tax', formatNaira(tax)));
  }
  if (discount > 0 && promotionValueType !== 'INCREMENT') {
    printer.text(alignLine('Discount', `-${formatNaira(discount)}`));
  }
  if (incrementLabel) {
    printer.text(alignLine(incrementLabel, formatNaira(incrementValue)));
  }

  printer.setBold(true);
  printer.text(alignLine('TOTAL', formatNaira(total)));
  if (change > 0) {
    printer.text(alignLine('CHANGE', formatNaira(change)));
  }
  printer.setBold(false);

  printer.separator('-', RECEIPT_WIDTH);

  // Payment
  printer.setBold(true);
  printer.text('PAYMENT');
  printer.setBold(false);

  if (tenderPayments && tenderPayments.length > 0) {
    tenderPayments.forEach((payment) => {
      printer.text(alignLine(payment.tenderName || 'Unknown', formatNaira(payment.amount)));
    });
  } else {
    printer.text(alignLine('Cash', formatNaira(total)));
  }

  if (refundDays > 0 || receiptMessage) {
    printer.separator('-', RECEIPT_WIDTH);
  }

  if (refundDays > 0) {
    printWrapped(printer, `Refund within ${refundDays} days with receipt`, 1);
  }

  if (receiptMessage) {
    String(receiptMessage).split(/\r?\n/).forEach((line) => {
      printWrapped(printer, line, 1);
    });
  }

  if (qrUrl) {
    printer.newLine();
    if (qrDescription) {
      printWrapped(printer, qrDescription, 1);
    }
    printer.setAlignment(1);
    printer.qrcode(qrUrl, 3);
  }

  // Footer
  printer.setAlignment(1).newLine();
  printer.setBold(true);
  printer.text('THANK YOU');
  printer.text(receiptStatus);
  printer.setBold(false);

  // Cut paper
  printer.partialCut();

  return printer.getByteArray();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { type = 'receipt', transaction, receiptSettings, printerIp, printerPort = 9100, connectionMode = 'network' } = req.body;

    if (!transaction) {
      return res.status(400).json({ success: false, message: 'Transaction data required' });
    }

    // Generate ESC/POS commands
    const receiptData = generateReceiptCommands(transaction, receiptSettings || {});

    // If printer IP provided, send to network printer
    if (printerIp && connectionMode === 'network') {
      try {
        const net = require('net');
        const client = new net.Socket();

        return new Promise((resolve) => {
          client.connect(printerPort, printerIp, () => {
            // Send data
            const buffer = Buffer.from(receiptData);
            client.write(buffer);
            client.end();

            resolve(
              res.status(200).json({
                success: true,
                message: 'Receipt sent to network printer',
                printer: {
                  ip: printerIp,
                  port: printerPort,
                },
              })
            );
          });

          client.on('error', (error) => {
            console.error('❌ Network printer connection error:', error);
            resolve(
              res.status(500).json({
                success: false,
                message: 'Failed to connect to network printer',
                error: error.message,
              })
            );
          });

          client.setTimeout(5000, () => {
            client.destroy();
            resolve(
              res.status(500).json({
                success: false,
                message: 'Network printer connection timeout',
              })
            );
          });
        });
      } catch (error) {
        console.error('❌ Error sending to network printer:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to send to network printer',
          error: error.message,
        });
      }
    }

    // USB printer handling - Try thermal printer, return result
    if (connectionMode === 'usb') {
      try {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const { execSync } = require('child_process');
        
        // Create temporary file with ESC/POS data
        const tempDir = os.tmpdir();
        const fileName = `receipt_${Date.now()}.prn`;
        const filePath = path.join(tempDir, fileName);
        
        // Write binary data
        fs.writeFileSync(filePath, Buffer.from(receiptData));
        
        // Try print.exe in background
        let printed = false;
        try {
          execSync(`print /d:XP-80C "${filePath}"`, {
            timeout: 3000,
            stdio: 'ignore'
          });
          printed = true;
        } catch (error) {
          console.warn('âš ï¸ USB direct print command failed:', error.message);
        }
        
        // Clean up temp file after delay
        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            // Ignore
          }
        }, 2000);
        
        if (printed) {
          return res.status(200).json({
            success: true,
            message: 'Receipt sent to USB printer',
          });
        }

        return res.status(200).json({
          success: false,
          message: 'USB print command failed, browser fallback required',
        });
        
      } catch (error) {
        return res.status(200).json({
          success: false,
          message: 'USB print failed, will display print dialog',
        });
      }
    }

    // Fallback: Return ESC/POS data for client-side printing or debugging
    console.log('⚠️ No connection mode specified, returning ESC/POS data');
    return res.status(200).json({
      success: true,
      message: 'Receipt commands generated (not sent to printer)',
      data: Buffer.from(receiptData).toString('base64'),
      type: 'escpos',
    });
  } catch (error) {
    console.error('❌ Error generating receipt:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate receipt',
      error: error.message,
    });
  }
}
