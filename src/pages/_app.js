import "../styles/globals.css";
import Head from "next/head";
import { useEffect } from "react";
import Layout from "@/src/components/layout/Layout";
import { StaffProvider } from "@/src/context/StaffContext";
import POSErrorBoundary from "@/src/components/common/POSErrorBoundary";
import { getUiSettings } from "@/src/lib/uiSettings";

export default function App({ Component, pageProps }) {
  // Register service worker for offline support
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration.scope);
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
        });
    }
  }, []);

  useEffect(() => {
    const applySystemZoom = (settings) => {
      const rawZoom = Number(settings?.system?.zoom || 100);
      const clampedZoom = Math.min(125, Math.max(80, rawZoom));
      const zoomScale = clampedZoom / 100;

      if (document?.documentElement) {
        document.documentElement.style.zoom = String(zoomScale);
      }
    };

    const applyFromStoredSettings = () => {
      try {
        applySystemZoom(getUiSettings());
      } catch (err) {
        applySystemZoom({ system: { zoom: 100 } });
      }
    };

    const handleUiSettingsUpdate = (event) => {
      applySystemZoom(event?.detail || getUiSettings());
    };

    applyFromStoredSettings();
    window.addEventListener("uiSettings:updated", handleUiSettingsUpdate);

    return () => {
      window.removeEventListener("uiSettings:updated", handleUiSettingsUpdate);
      if (document?.documentElement) {
        document.documentElement.style.zoom = "1";
      }
    };
  }, []);

  return (
    <StaffProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <meta name="googlebot" content="noindex" />
        <meta name="google" content="notranslate" />
        <meta name="theme-color" content="#0891b2" />
        
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="POS" />

        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="msapplication-config" content="/browserconfig.xml" />

        <title>St Michael’s Sales Point App</title>
        <meta name="description" content="Best products at the best prices!" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <POSErrorBoundary>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </POSErrorBoundary>
    </StaffProvider>
  );
}
