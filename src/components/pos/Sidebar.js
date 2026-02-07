/**
 * Sidebar Component
 * 
 * Persistent left navigation with accordion menus.
 * - Logo at top
 * - Expandable accordion sections (Admin, Print, Stock, Apps)
 * - Cloud sync status with timestamp
 * - Settings, Support at bottom
 * 
 * Touch-first design: Large buttons, no hover dependency
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBars,
  faTimes,
  faGear,
  faQuestionCircle,
  faCloud,
  faChevronDown,
  faChevronRight,
  faClock,
  faUndo,
  faFileAlt,
  faTimesCircle,
  faPiggyBank,
  faExchangeAlt,
  faPrint,
  faImage,
  faBox,
  faSyncAlt,
} from '@fortawesome/free-solid-svg-icons';
import { useCart } from '../../context/CartContext';
import { useStaff } from '../../context/StaffContext';
import { checkPrinterAvailable } from '@/src/lib/printerConfig';
import { getUiSettings } from '@/src/lib/uiSettings';
import CloseTillModal from './CloseTillModal';
import AdjustFloatModal from './AdjustFloatModal';

const baseMenuSections = [
  {
    id: 'admin',
    label: 'Admin',
    icon: faGear,
    items: [
      { id: 'adjustFloat', label: 'Adjust Float', icon: faClock },
      { id: 'closeTill', label: 'Close Till', icon: faTimesCircle },
      // Hidden for now - showing only core till operations
      // { label: 'Back Office', icon: faFileAlt, hidden: true },
      // { label: 'No Sale', icon: faPiggyBank, hidden: true },
      // { label: 'Petty Cash', icon: faPiggyBank, hidden: true },
      // { label: 'Change Till Location', icon: faExchangeAlt, hidden: true },
    ],
  },
  {
    id: 'print',
    label: 'Print',
    icon: faPrint,
    items: [
      { label: 'Print Current', icon: faPrint },
      { label: 'Print Previous', icon: faPrint },
      { label: 'Print Gift Receipt', icon: faPrint },
      { label: 'Print Historic', icon: faPrint },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    icon: faImage,
    items: [
      { label: 'Stock Count', icon: faImage },
      { label: 'Stock Movement', icon: faImage },
    ],
  },
  {
    id: 'apps',
    label: 'Apps',
    icon: faBox,
    items: [
      { label: 'App Store', icon: faBox },
      { label: 'Manage Apps', icon: faBox },
    ],
  },
];

export default function Sidebar({ isOpen, onToggle, widthClass = 'w-56', mobileWidthClass = 'w-48' }) {
  const router = useRouter();
  const [expandedSections, setExpandedSections] = useState({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCloseTillModal, setShowCloseTillModal] = useState(false);
  const [showAdjustFloatModal, setShowAdjustFloatModal] = useState(false);
  const [printerAvailable, setPrinterAvailable] = useState(null);
  const [checkingPrinter, setCheckingPrinter] = useState(false);
  const [uiSettings, setUiSettings] = useState(getUiSettings());
  const { lastSyncTime, isOnline, pendingSyncCount, manualSync } = useCart();
  const { till, setCurrentTill } = useStaff();
  const [effectiveTill, setEffectiveTill] = useState(till || null);

  // Check printer availability on mount only (not periodically)
  useEffect(() => {
    const checkPrinter = async () => {
      try {
        setCheckingPrinter(true);
        const available = await checkPrinterAvailable();
        setPrinterAvailable(available);
      } catch (error) {
        console.warn('Failed to check printer:', error);
        setPrinterAvailable(false);
      } finally {
        setCheckingPrinter(false);
      }
    };

    // Check on mount only - NO periodic checking
    checkPrinter();
    
    return () => {
      // No interval to clear
    };
  }, []);

  useEffect(() => {
    const handleSettingsUpdate = (event) => {
      if (event?.detail) {
        setUiSettings(event.detail);
      } else {
        setUiSettings(getUiSettings());
      }
    };

    handleSettingsUpdate();
    window.addEventListener('uiSettings:updated', handleSettingsUpdate);
    return () => window.removeEventListener('uiSettings:updated', handleSettingsUpdate);
  }, []);

  useEffect(() => {
    if (till) {
      setEffectiveTill(till);
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const persistedTill = localStorage.getItem('till');
      if (persistedTill) {
        const parsedTill = JSON.parse(persistedTill);
        setEffectiveTill(parsedTill);
        if (!till) {
          setCurrentTill(parsedTill);
        }
        return;
      }
    } catch (error) {
      console.warn('Failed to load persisted till:', error);
    }
    setEffectiveTill(null);
  }, [till, setCurrentTill]);

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const result = await manualSync();
      console.log('Manual sync result:', result);
    } catch (err) {
      console.error('Manual sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatSyncTime = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const menuSections = baseMenuSections
    .filter((section) => {
      if (section.id === 'print') return uiSettings.sidebarSections?.print !== false;
      if (section.id === 'stock') return uiSettings.sidebarSections?.stock !== false;
      if (section.id === 'apps') return uiSettings.sidebarSections?.apps !== false;
      return true;
    })
    .map((section) => {
      if (section.id !== 'admin') return section;
      const allowAdjustFloat = uiSettings.adminControls?.adjustFloat !== false;
      return {
        ...section,
        items: section.items.filter((item) => {
          if (item.id === 'adjustFloat') return allowAdjustFloat;
          return true;
        }),
      };
    });

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-neutral-50 to-neutral-100">
      {/* Logo Section */}
      <div className="p-4 bg-white border-b-2 border-primary-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Image 
            src="/images/st-micheals-logo.png" 
            alt="Store Logo" 
            width={40}
            height={40}
            className="object-contain rounded-lg"
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
            unoptimized
          />
          <div className="w-10 h-10 bg-primary-600 rounded-lg items-center justify-center hidden text-white font-bold text-lg">
            SP
          </div>
          <div className="hidden md:block flex-1">
            <div className="text-base font-bold text-neutral-900">SalesPOS</div>
            <div className="text-sm text-primary-600 font-semibold">Point of Sale</div>
          </div>
        </div>
      </div>

      {/* Scrollable Menu Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {menuSections.map(section => (
          <div key={section.id} className="rounded-lg bg-white border border-neutral-200 overflow-hidden shadow-sm">
            {/* Section Header */}
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-primary-50 transition-colors duration-base text-left font-semibold text-neutral-800 hover:text-primary-700 text-lg"
            >
              <FontAwesomeIcon icon={section.icon} className="w-6 h-6 text-primary-600" />
              <span className="hidden md:inline text-base font-semibold text-neutral-800 flex-1">
                {section.label}
              </span>
              <FontAwesomeIcon
                icon={expandedSections[section.id] ? faChevronDown : faChevronRight}
                className="w-5 h-5 text-primary-600 hidden md:inline"
              />
            </button>

            {/* Section Items */}
            {expandedSections[section.id] && (
              <div className="bg-neutral-50 border-t border-neutral-200">
                {section.items.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (item.label === 'Close Till') {
                        setShowCloseTillModal(true);
                      } else if (item.label === 'Adjust Float') {
                        setShowAdjustFloatModal(true);
                      }
                    }}
                    disabled={(item.label === 'Close Till' || item.label === 'Adjust Float') && !effectiveTill}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-primary-100 border-l-4 border-transparent hover:border-primary-500 text-left text-base font-semibold text-neutral-700 hover:text-primary-700 transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FontAwesomeIcon icon={item.icon} className="w-5 h-5 text-primary-500" />
                    <span className="hidden md:inline text-base">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="border-t-2 border-neutral-200 bg-white p-4 space-y-4 shadow-lg">
        {/* Cloud Sync Status */}
        <div className="text-sm text-neutral-700 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <FontAwesomeIcon
              icon={faCloud}
              className={`w-5 h-5 ${isOnline ? 'text-green-600' : 'text-red-600'}`}
            />
            <span className={`text-sm font-bold ${isOnline ? 'text-green-700' : 'text-red-700'}`}>
              {isOnline ? '● Online' : '● Offline'}
            </span>
          </div>
          <div className="text-neutral-600 mb-2 text-sm font-medium">
            Last sync: {formatSyncTime(lastSyncTime)}
          </div>
          {pendingSyncCount > 0 && (
            <div className="text-red-700 font-bold text-sm mb-2">
              ⚠️ {pendingSyncCount} pending transaction{pendingSyncCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Manual Sync Button */}
        <button
          onClick={handleManualSync}
          disabled={isSyncing || !isOnline}
          className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors duration-base text-base font-bold shadow-md hover:shadow-lg"
        >
          <FontAwesomeIcon icon={faSyncAlt} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing...' : 'Sync Transactions'}
        </button>

        {/* Settings & Support */}
        <div className="space-y-2 pt-2">
          {/* Settings with Printer Status */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => router.push('/settings')}
              className={`flex-1 flex items-center gap-3 px-4 py-4 rounded-lg text-left text-base font-semibold transition-colors duration-base ${
                router.pathname === '/settings' || router.pathname === '/printer-settings'
                  ? 'bg-primary-100 text-primary-700 shadow-md'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-primary-600'
              }`}
            >
              <FontAwesomeIcon icon={faGear} className="w-5 h-5" />
              <span className="hidden md:inline text-base">Settings</span>
            </button>
            {/* Printer Status Badge */}
            {printerAvailable !== null && (
              <div
                title={printerAvailable ? 'Printer Connected' : 'Printer Offline'}
                className={`px-3 py-3 rounded-lg text-base font-bold shadow-sm ${
                  printerAvailable
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}
              >
                {printerAvailable ? '🖨️ ✓' : '🖨️ ✕'}
              </div>
            )}
          </div>
          <button className="w-full flex items-center gap-3 px-4 py-4 hover:bg-neutral-100 rounded-lg text-left text-base font-semibold text-neutral-700 hover:text-primary-600 transition-colors duration-base">
            <FontAwesomeIcon icon={faQuestionCircle} className="w-5 h-5" />
            <span className="hidden md:inline text-base">Support</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar - Toggle with hamburger */}
      {isOpen && (
        <aside className={`hidden md:flex flex-col ${widthClass} bg-neutral-100 border-r border-neutral-300 h-screen overflow-y-auto`}>
          {sidebarContent}
        </aside>
      )}

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={onToggle}
          />
          <aside className={`fixed left-0 top-0 ${mobileWidthClass} h-screen bg-neutral-100 z-40 overflow-y-auto md:hidden`}>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Close Till Modal */}
      <CloseTillModal
        isOpen={showCloseTillModal}
        onClose={() => setShowCloseTillModal(false)}
        onTillClosed={() => {
          setShowCloseTillModal(false);
          // Optionally redirect or refresh
        }}
      />

      {/* Adjust Float Modal */}
      <AdjustFloatModal
        isOpen={showAdjustFloatModal}
        onClose={() => setShowAdjustFloatModal(false)}
      />
    </>
  );
}
