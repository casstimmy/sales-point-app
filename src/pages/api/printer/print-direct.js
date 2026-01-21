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
    second: '2-digit',
    hour12: false,
  });
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
    change = 0,
    staffName = 'Unknown Staff',
    location = 'Default Location',
    createdAt = new Date().toISOString(),
    tenderPayments = [],
    _id = '',
  } = transaction;

  const {
    companyDisplayName = "St's Michael Hub",
    storePhone = '',
    email = '',
    website = '',
    taxNumber = '',
    refundDays = 0,
    qrUrl = '',
    qrDescription = 'Scan and leave feedback',
    paymentStatus = 'paid',
  } = settings;

  // Header
  printer.setSize(1, 2).setAlignment(1).setBold(true);
  printer.text(companyDisplayName);

  // Store Info
  printer.setAlignment(1);
  printer.text(location);
  if (storePhone) printer.text(`Tel: ${storePhone}`);
  if (email) printer.text(email);
  if (website) printer.text(website);
  if (taxNumber) printer.text(`Tax ID: ${taxNumber}`);

  // Separator
  printer.setAlignment(0);

  // Receipt Details
  printer.setAlignment(0).setBold(false);
  printer.text('Receipt of Purchase (Inc Tax)');
  printer.text(`${formatDateTime(createdAt)} ${_id.substring(0, 8)}`);
  printer.text(`Staff: ${staffName}                 Till #1`);

  // Items Header
  printer.setBold(true);
  printer.text('PRODUCT              QTY    PRICE');
  printer.setBold(false);

  // Items
  items.forEach((item) => {
    const itemName = item.name.substring(0, 20).padEnd(20);
    const qty = String(item.quantity).padStart(3);
    const price = formatNaira(item.price * item.quantity).padStart(8);
    printer.text(`${itemName}${qty}${price}`);
  });

  // Total items
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  printer.text(`Total Items: ${totalItems}`.padStart(32));

  // Totals
  printer.text(`Subtotal:${formatNaira(subtotal).padStart(24)}`);
  if (tax > 0) {
    printer.text(`Tax:${formatNaira(tax).padStart(28)}`);
  }
  if (discount > 0) {
    printer.text(`Discount:${formatNaira(discount).padStart(23)}`);
  }

  printer.setBold(true);
  printer.text(`TOTAL:${formatNaira(total).padStart(26)}`);
  printer.setBold(false);

  // Payment
  printer.setBold(true);
  printer.text('PAYMENT BY TENDER');
  printer.setBold(false);

  if (tenderPayments && tenderPayments.length > 0) {
    tenderPayments.forEach((payment) => {
      const name = (payment.tenderName || 'Unknown').padEnd(20);
      const amount = formatNaira(payment.amount).padStart(12);
      printer.text(`${name}${amount}`);
    });
  } else {
    const name = 'CASH'.padEnd(20);
    const amount = formatNaira(total).padStart(12);
    printer.text(`${name}${amount}`);
  }

  // Change
  if (change > 0) {

    const name = 'CHANGE'.padEnd(20);
    const amount = formatNaira(change).padStart(12);
    printer.setBold(true);
    printer.text(`${name}${amount}`);
    printer.setBold(false);
  }



  // Thank you
  printer.setAlignment(1).setBold(true);
  printer.text('THANK YOU!');
  printer.setBold(false);

  // Refund policy
  if (refundDays > 0) {
    printer.setAlignment(1);
    printer.text(`Refund within ${refundDays} days with receipt`);
  }

  // Status
  printer.setAlignment(1).setBold(true);
  printer.text(`   ${paymentStatus.toUpperCase()}   `);
  printer.setBold(false);

  // QR Code
  if (qrUrl) {
    printer.setAlignment(1);
    printer.newLine();
    printer.text(qrDescription);
    printer.qrcode(qrUrl, 3);
  }

  // Footer
  printer.setAlignment(1);
  printer.newLine();
  printer.text('Thank you for shopping with us!');
 ;

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
        try {
          execSync(`print /d:XP-80C "${filePath}"`, {
            timeout: 3000,
            stdio: 'ignore'
          });
        } catch (error) {
          // Silently fail
        }
        
        // Clean up temp file after delay
        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            // Ignore
          }
        }, 2000);
        
        // Always return false to show browser dialog
        return res.status(200).json({
          success: false,
          message: 'Will display print dialog for user',
        });
        
      } catch (error) {
        return res.status(200).json({
          success: false,
          message: 'Will display print dialog',
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
