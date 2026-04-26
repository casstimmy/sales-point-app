/**
 * PrintPreview - Branded print preview overlay
 *
 * Shows a styled preview of the receipt before printing.
 */

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faTimes, faCheck } from '@fortawesome/free-solid-svg-icons';
import { getStoreLogo } from '@/src/lib/logoCache';

let resolvePromise = null;

export function showPrintPreview(receiptHTML, options = {}) {
  return new Promise((resolve) => {
    resolvePromise = resolve;
    window.dispatchEvent(
      new CustomEvent('printPreview:show', {
        detail: { receiptHTML, ...options },
      })
    );
  });
}

export default function PrintPreview() {
  const [visible, setVisible] = useState(false);
  const [receiptHTML, setReceiptHTML] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [transaction, setTransaction] = useState(null);
  const [printing, setPrinting] = useState(false);
  const iframeRef = useRef(null);
  const queueRef = useRef([]);

  const showNext = () => {
    if (queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      setReceiptHTML(next.receiptHTML || '');
      setCompanyName(next.companyName || '');
      setTransaction(next.transaction || null);
      setVisible(true);
      setPrinting(false);
    }
  };

  useEffect(() => {
    const handleShow = (event) => {
      const { receiptHTML: html, companyName: name, transaction: tx } = event.detail || {};
      const entry = { receiptHTML: html, companyName: name, transaction: tx };

      if (visible || printing) {
        queueRef.current.push(entry);
        return;
      }

      setReceiptHTML(html || '');
      setCompanyName(name || '');
      setTransaction(tx || null);
      setVisible(true);
      setPrinting(false);
    };

    window.addEventListener('printPreview:show', handleShow);
    return () => window.removeEventListener('printPreview:show', handleShow);
  }, [visible, printing]);

  const handlePrint = () => {
    setPrinting(true);
    setVisible(false);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    iframe.contentDocument.write(receiptHTML);
    iframe.contentDocument.close();

    let hasPrinted = false;

    const doPrint = () => {
      if (hasPrinted) return;
      hasPrinted = true;

      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (error) {
        console.error('Print error:', error);
      }

      setTimeout(() => {
        try {
          if (iframe.parentNode) document.body.removeChild(iframe);
        } catch {}
        setPrinting(false);
        resolvePromise?.(true);
        resolvePromise = null;
        showNext();
      }, 2000);
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
  };

  const handleCancel = () => {
    setVisible(false);
    resolvePromise?.(false);
    resolvePromise = null;
    setTimeout(showNext, 150);
  };

  if (!visible) return null;

  const formatNaira = (amount) =>
    `\u20A6${Number(amount || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/70 bg-slate-50 shadow-[0_28px_80px_rgba(15,23,42,0.4)]">
        <div className="bg-[linear-gradient(135deg,#0f172a_0%,#155e75_55%,#0f766e_100%)] px-6 py-5 text-white">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white shadow">
              <Image
                src={getStoreLogo()}
                alt="Logo"
                width={32}
                height={32}
                className="object-contain"
                unoptimized
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>

            <div className="flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100">
                Print Preview
              </div>
              <h2
                className="mt-1 text-2xl font-semibold tracking-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {companyName || 'Receipt Preview'}
              </h2>
              <p className="mt-1 text-sm text-cyan-100/90">
                Review the receipt layout before sending it to the printer.
              </p>
            </div>

            <button
              onClick={handleCancel}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 transition hover:bg-white/20"
            >
              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
            </button>
          </div>

          {queueRef.current.length > 0 && (
            <div className="mt-4 inline-flex rounded-full bg-white/12 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-50">
              {queueRef.current.length} more receipt{queueRef.current.length === 1 ? '' : 's'} queued
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="border-b border-slate-200 bg-[#f1eee7] p-5 lg:border-b-0 lg:border-r">
            <div className="rounded-[24px] border border-stone-300/80 bg-[linear-gradient(180deg,#f8f5ee_0%,#efe7d8_100%)] p-4 shadow-inner">
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-stone-300/80 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-600">
                <span>Thermal Paper</span>
                <span>58mm</span>
              </div>

              <div className="mx-auto max-w-[360px] overflow-hidden rounded-[22px] border border-stone-300 bg-white shadow-[0_18px_40px_rgba(71,85,105,0.18)]">
                <iframe
                  ref={iframeRef}
                  srcDoc={receiptHTML}
                  className="h-[620px] w-full border-0 bg-white"
                  title="Receipt Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col bg-white">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Print Summary
              </div>
              <div className="mt-3 space-y-3 text-sm text-slate-700">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-slate-500">Items</span>
                  <span className="font-semibold text-slate-900">{transaction?.items?.length || 0}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold text-slate-900">{formatNaira(transaction?.total)}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-slate-500">Status</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {transaction?.status || 'paid'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 px-6 py-5 text-sm leading-6 text-slate-600">
              The preview uses the same HTML that will be printed, so spacing, type size, and section order should match the final receipt.
            </div>

            <div className="border-t border-slate-200 px-6 py-5">
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  disabled={printing}
                  className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePrint}
                  disabled={printing}
                  className="flex flex-[1.25] items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#155e75_70%,#0f766e_100%)] px-4 py-3 font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-70"
                >
                  {printing ? (
                    <>
                      <FontAwesomeIcon icon={faCheck} className="w-4 h-4 animate-pulse" />
                      Printing...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faPrint} className="w-4 h-4" />
                      Print Receipt
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
