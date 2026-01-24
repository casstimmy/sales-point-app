// Service Worker for POS Offline Support
const CACHE_NAME = 'pos-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/_next/static/css/',
  '/_next/static/js/',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API requests - let them go through normally (handled by IndexedDB)
  if (url.pathname.startsWith('/api/')) return;

  // Skip websocket and dev server requests
  if (url.pathname.includes('_next/webpack') || 
      url.pathname.includes('__nextjs') ||
      url.protocol === 'ws:' ||
      url.protocol === 'wss:') return;

  event.respondWith(
    // Network-first strategy
    fetch(request)
      .then((response) => {
        // Clone the response for caching
        const responseClone = response.clone();
        
        // Cache successful responses
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        
        return response;
      })
      .catch(async () => {
        // Network failed, try cache
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
          console.log('📦 Serving from cache:', request.url);
          return cachedResponse;
        }
        
        // For navigation requests, return the cached index page
        if (request.mode === 'navigate') {
          const indexCache = await caches.match('/');
          if (indexCache) {
            console.log('📦 Serving cached index for navigation');
            return indexCache;
          }
        }
        
        // Return offline page or error
        return new Response('Offline - Please reconnect', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('🚀 POS Service Worker loaded');
