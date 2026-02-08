/**
 * Thank You Note Modal
 * 
 * Displays a beautiful thank you message after payment completion
 * Shows company logo, thank you message, contact info, and welcoming design
 */

import React from 'react';
import Image from 'next/image';

export default function ThankYouNote({ 
  isOpen = false,
  onClose = () => {},
  receiptSettings = {},
  companyLogo = '/images/st-micheals-logo.png',
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
      {/* Main Container - Cyan/Teal color scheme consistent with login page */}
      <div className="bg-gradient-to-br from-cyan-500 via-cyan-600 to-cyan-700 text-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
        {/* Logo Container - Always displays with fallback */}
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg overflow-hidden">
            <Image 
              src={companyLogo} 
              alt="Company Logo"
              width={80}
              height={80}
              className="object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/images/placeholder.jpg';
              }}
            />
          </div>
        </div>

        {/* Thank You Title */}
        <h1 className="text-5xl font-bold mb-4 text-white drop-shadow-lg">THANK YOU!</h1>

        {/* Decorative Divider */}
        <div className="w-20 h-1.5 bg-white opacity-90 mx-auto mb-8 rounded-full shadow-md"></div>

        {/* Company Name */}
        <div className="text-3xl font-bold mb-8 text-white drop-shadow-md">
          {companyDisplayName}
        </div>

        {/* Custom Message */}
        {receiptMessage && (
          <p className="text-lg italic mb-8 leading-relaxed whitespace-pre-line opacity-95 font-medium">
            {receiptMessage}
          </p>
        )}

        {/* Contact Information - Clean layout */}
        <div className="my-8 text-base leading-relaxed opacity-90 space-y-3">
          {storePhone && (
            <div className="flex items-center justify-center gap-2">
              <span>📞</span>
              <span>{storePhone}</span>
            </div>
          )}
          {email && (
            <div className="flex items-center justify-center gap-2">
              <span>📧</span>
              <span>{email}</span>
            </div>
          )}
          {website && (
            <div className="flex items-center justify-center gap-2">
              <span>🌐</span>
              <span>{website}</span>
            </div>
          )}
        </div>

        {/* QR Code Section - if available */}
        {qrUrl && (
          <div className="mt-8 pt-8 border-t border-white border-opacity-40">
            <p className="text-sm opacity-90 mb-4 font-semibold">{qrDescription}</p>
            <div className="bg-white rounded-lg p-3 w-24 h-24 mx-auto flex items-center justify-center shadow-lg">
              <Image src={qrUrl} alt="QR Code" width={96} height={96} className="object-contain" />
            </div>
          </div>
        )}

        {/* Closing Message */}
        <div className="mt-8 text-base opacity-90 font-medium">
          <p>We look forward to seeing you again soon!</p>
        </div>

        {/* Continue Button - Welcoming style */}
        <button
          onClick={onClose}
          className="mt-8 px-10 py-3 bg-white text-cyan-700 rounded-full font-bold hover:bg-cyan-50 transition-all duration-300 w-full text-lg shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          CONTINUE
        </button>
      </div>
    </div>
  );
}
