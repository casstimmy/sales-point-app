/**
 * Settings Page
 *
 * Configure sidebar visibility, till controls, and layout sizing.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faChevronDown,
  faChevronRight,
  faPrint,
  faBoxes,
  faGripHorizontal,
  faClock,
  faCoins,
  faRulerCombined,
  faSlidersH,
} from '@fortawesome/free-solid-svg-icons';
import {
  getUiSettings,
  saveUiSettings,
  resetUiSettings,
  defaultUiSettings,
} from '@/src/lib/uiSettings';

const DENSITY_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
];

const WIDTH_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'wide', label: 'Wide' },
];

const PAYMENT_SCALE_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(getUiSettings());
  const [expanded, setExpanded] = useState({
    sidebar: true,
    till: true,
    layout: true,
    payment: true,
    summary: true,
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSettings(getUiSettings());
  }, []);

  const toggleSection = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateSidebarSection = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      sidebarSections: {
        ...prev.sidebarSections,
        [key]: value,
      },
    }));
  };

  const updateAdminControl = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      adminControls: {
        ...prev.adminControls,
        [key]: value,
      },
    }));
  };

  const updateLayoutSetting = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        [key]: value,
      },
    }));
  };

  const updatePaymentSetting = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      payment: {
        ...prev.payment,
        [key]: value,
      },
    }));
  };

  const updateQuickAmount = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      payment: {
        ...prev.payment,
        quickAmounts: {
          ...(prev.payment?.quickAmounts || {}),
          [key]: value,
        },
      },
    }));
  };

  const handleSave = () => {
    setSaving(true);
    setError('');
    try {
      saveUiSettings(settings);
      setSuccess('✅ Settings saved');
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset settings to defaults?')) {
      const defaults = resetUiSettings();
      setSettings(defaults);
      setSuccess('✅ Settings reset to defaults');
      setTimeout(() => setSuccess(''), 2500);
    }
  };

  const summary = {
    sidebar: [
      settings.sidebarSections?.print ? 'Print' : null,
      settings.sidebarSections?.stock ? 'Stock' : null,
      settings.sidebarSections?.apps ? 'Apps' : null,
    ].filter(Boolean),
    till: [
      settings.adminControls?.openTillCashEntry ? 'Open Till cash entry enabled' : 'Open Till cash entry disabled',
      settings.adminControls?.adjustFloat ? 'Adjust Float enabled' : 'Adjust Float disabled',
    ],
    layout: [
      `Sidebar width: ${settings.layout?.sidebarWidth || defaultUiSettings.layout.sidebarWidth}`,
      `Cart panel width: ${settings.layout?.cartPanelWidth || defaultUiSettings.layout.cartPanelWidth}`,
      `Content density: ${settings.layout?.contentDensity || defaultUiSettings.layout.contentDensity}`,
    ],
    payment: [
      `Payment scale: ${settings.payment?.scale || defaultUiSettings.payment.scale}`,
      `Payment content size: ${settings.payment?.contentSize || defaultUiSettings.payment.contentSize}`,
      `Keypad size: ${settings.payment?.keypadSize || defaultUiSettings.payment.keypadSize}`,
      `Quick amounts: ${Object.entries(settings.payment?.quickAmounts || defaultUiSettings.payment.quickAmounts)
        .filter(([, enabled]) => enabled)
        .map(([label]) => (label === 'exact' ? 'Exact' : `₦${label}`))
        .join(', ') || 'None'}`,
    ],
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      {/* Back Button */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          onClick={() => router.push('/printer-settings')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-semibold"
        >
          Open Printer Settings
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-6">
          <h1 className="text-3xl font-bold">⚙️ System Settings</h1>
          <p className="text-slate-200 mt-2">
            Configure sidebar menus, till controls, and layout spacing
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center justify-between">
              <span>{success}</span>
              <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full border border-green-200">
                Saved
              </span>
            </div>
          )}

          {/* Sidebar Sections */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('sidebar')}
              className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 text-left font-semibold text-gray-800"
            >
              <FontAwesomeIcon icon={faSlidersH} className="text-blue-600 w-5 h-5" />
              Sidebar Sections
              <span className="ml-auto">
                <FontAwesomeIcon icon={expanded.sidebar ? faChevronDown : faChevronRight} />
              </span>
            </button>
            {expanded.sidebar && (
              <div className="p-5 space-y-4 bg-white">
                <p className="text-sm text-gray-600">
                  Show or hide sidebar sections like Print, Stock, and Apps.
                </p>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.sidebarSections?.print !== false}
                    onChange={(e) => updateSidebarSection('print', e.target.checked)}
                  />
                  <FontAwesomeIcon icon={faPrint} className="text-purple-600 w-4 h-4" />
                  <span className="font-semibold text-gray-700">Print</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.sidebarSections?.stock !== false}
                    onChange={(e) => updateSidebarSection('stock', e.target.checked)}
                  />
                  <FontAwesomeIcon icon={faBoxes} className="text-orange-600 w-4 h-4" />
                  <span className="font-semibold text-gray-700">Stock</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.sidebarSections?.apps !== false}
                    onChange={(e) => updateSidebarSection('apps', e.target.checked)}
                  />
                  <FontAwesomeIcon icon={faGripHorizontal} className="text-green-600 w-4 h-4" />
                  <span className="font-semibold text-gray-700">Apps</span>
                </label>
              </div>
            )}
          </div>

          {/* Till Controls */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('till')}
              className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 text-left font-semibold text-gray-800"
            >
              <FontAwesomeIcon icon={faCoins} className="text-amber-600 w-5 h-5" />
              Till Cash & Float
              <span className="ml-auto">
                <FontAwesomeIcon icon={expanded.till ? faChevronDown : faChevronRight} />
              </span>
            </button>
            {expanded.till && (
              <div className="p-5 space-y-4 bg-white">
                <p className="text-sm text-gray-600">
                  Control the Open Till cash entry and Adjust Float access.
                </p>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.adminControls?.openTillCashEntry !== false}
                    onChange={(e) => updateAdminControl('openTillCashEntry', e.target.checked)}
                  />
                  <FontAwesomeIcon icon={faClock} className="text-blue-600 w-4 h-4" />
                  <span className="font-semibold text-gray-700">Open Till Cash Entry</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.adminControls?.adjustFloat !== false}
                    onChange={(e) => updateAdminControl('adjustFloat', e.target.checked)}
                  />
                  <FontAwesomeIcon icon={faCoins} className="text-emerald-600 w-4 h-4" />
                  <span className="font-semibold text-gray-700">Adjust Float (Add/Remove Cash)</span>
                </label>
              </div>
            )}
          </div>

          {/* Layout & Spacing */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('layout')}
              className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 text-left font-semibold text-gray-800"
            >
              <FontAwesomeIcon icon={faRulerCombined} className="text-indigo-600 w-5 h-5" />
              Layout & Spacing
              <span className="ml-auto">
                <FontAwesomeIcon icon={expanded.layout ? faChevronDown : faChevronRight} />
              </span>
            </button>
            {expanded.layout && (
              <div className="p-5 space-y-4 bg-white">
                <p className="text-sm text-gray-600">
                  Adjust the visual spacing and sizing of the entire POS layout.
                </p>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Content Density
                  </label>
                  <select
                    value={settings.layout?.contentDensity || 'comfortable'}
                    onChange={(e) => updateLayoutSetting('contentDensity', e.target.value)}
                    className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                  >
                    {DENSITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Sidebar Width
                    </label>
                    <select
                      value={settings.layout?.sidebarWidth || 'standard'}
                      onChange={(e) => updateLayoutSetting('sidebarWidth', e.target.value)}
                      className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                    >
                      {WIDTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Cart Panel Width
                    </label>
                    <select
                      value={settings.layout?.cartPanelWidth || 'standard'}
                      onChange={(e) => updateLayoutSetting('cartPanelWidth', e.target.value)}
                      className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                    >
                      {WIDTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Complete Payment Styling */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('payment')}
              className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 text-left font-semibold text-gray-800"
            >
              <FontAwesomeIcon icon={faRulerCombined} className="text-emerald-600 w-5 h-5" />
              Complete Payment Styling
              <span className="ml-auto">
                <FontAwesomeIcon icon={expanded.payment ? faChevronDown : faChevronRight} />
              </span>
            </button>
            {expanded.payment && (
              <div className="p-5 space-y-4 bg-white">
                <p className="text-sm text-gray-600">
                  Control the payment screen scale, text size, and quick amount buttons.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Payment Scale
                    </label>
                    <select
                      value={settings.payment?.scale || 'standard'}
                      onChange={(e) => updatePaymentSetting('scale', e.target.value)}
                      className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                    >
                      {PAYMENT_SCALE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Payment Content Size
                    </label>
                    <select
                      value={settings.payment?.contentSize || 'standard'}
                      onChange={(e) => updatePaymentSetting('contentSize', e.target.value)}
                      className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                    >
                      {PAYMENT_SCALE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Keypad Size
                    </label>
                    <select
                      value={settings.payment?.keypadSize || 'standard'}
                      onChange={(e) => updatePaymentSetting('keypadSize', e.target.value)}
                      className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                    >
                      {PAYMENT_SCALE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Quick Amount Buttons
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[500, 1000, 2000, 5000, 10000, 20000, 50000].map((amount) => (
                      <label key={amount} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={settings.payment?.quickAmounts?.[amount] !== false}
                          onChange={(e) => updateQuickAmount(amount, e.target.checked)}
                        />
                        <span className="text-sm font-semibold text-gray-700">₦{amount >= 1000 ? `${amount / 1000}K` : amount}</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.payment?.quickAmounts?.exact !== false}
                        onChange={(e) => updateQuickAmount('exact', e.target.checked)}
                      />
                      <span className="text-sm font-semibold text-gray-700">Exact</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('summary')}
              className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 text-left font-semibold text-gray-800"
            >
              <FontAwesomeIcon icon={faSlidersH} className="text-slate-600 w-5 h-5" />
              Full Summary
              <span className="ml-auto">
                <FontAwesomeIcon icon={expanded.summary ? faChevronDown : faChevronRight} />
              </span>
            </button>
            {expanded.summary && (
              <div className="p-5 space-y-4 bg-white text-sm text-gray-700">
                <div>
                  <div className="font-semibold text-gray-900 mb-1">Sidebar Sections</div>
                  <div>
                    {summary.sidebar.length > 0 ? summary.sidebar.join(', ') : 'None'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 mb-1">Till Controls</div>
                  <div>{summary.till.join(' • ')}</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 mb-1">Layout</div>
                  <div>{summary.layout.join(' • ')}</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 mb-1">Complete Payment</div>
                  <div>{summary.payment.join(' • ')}</div>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 font-semibold"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition"
            >
              Reset Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
