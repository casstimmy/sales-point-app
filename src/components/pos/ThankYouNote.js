/**
 * Thank You Note Modal
 * 
 * Displays a beautiful thank you message after payment completion
 * Shows company logo, thank you message, contact info, and QR code
 */

import React from 'react';

export default function ThankYouNote({ 
  isOpen = false,
  onClose = () => {},
  receiptSettings = {},
  companyLogo = '/images/logo.png',
}) {
  const {
    companyDisplayName = "St's Michael Hub",
    storePhone = '',
    email = '',
    website = '',
    qrUrl = '',
    qrDescription = 'Visit us online',
    receiptMessage = 'Thank you for shopping with us!',
  } = receiptSettings;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        {/* Logo */}
        {companyLogo && (
          <div className="mb-6">
            <img 
              src={companyLogo} 
              alt="Company Logo"
              className="w-20 h-20 mx-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>
        )}

        {/* Thank You Title */}
        <h1 className="text-5xl font-bold mb-4">THANK YOU!</h1>

        {/* Divider */}
        <div className="w-16 h-1 bg-white opacity-80 mx-auto mb-6"></div>

        {/* Company Name */}
        <div className="text-3xl font-bold my-6">
          {companyDisplayName}
        </div>

        {/* Custom Message */}
        {receiptMessage && (
          <p className="text-lg italic mb-8 leading-relaxed whitespace-pre-line opacity-95">
            "{receiptMessage}"
          </p>
        )}

        {/* Contact Information */}
        <div className="my-6 text-sm leading-relaxed opacity-90 space-y-2">
          {storePhone && <div>📞 {storePhone}</div>}
          {email && <div>📧 {email}</div>}
          {website && <div>🌐 {website}</div>}
        </div>

        {/* QR Code Section */}
        {qrUrl && (
          <div className="mt-6 pt-6 border-t border-white border-opacity-50">
            <p className="text-xs opacity-90 mb-3">{qrDescription}</p>
            <div className="bg-white rounded p-2 w-20 h-20 mx-auto flex items-center justify-center text-gray-400 text-xs">
              [QR]
            </div>
          </div>
        )}

        {/* Closing Message */}
        <div className="mt-8 text-sm opacity-90">
          <p>We look forward to seeing you again!</p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="mt-8 px-8 py-3 bg-white text-purple-700 rounded-lg font-bold hover:bg-gray-100 transition w-full"
        >
          CONTINUE
        </button>
      </div>
    </div>
  );
}
