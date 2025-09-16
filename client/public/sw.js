// Taska Service Worker - iOS Optimized  
const CACHE_NAME = 'taska-v3-' + Date.now();
const STATIC_CACHE = 'taska-static-v3';
const urlsToCache = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install event - cache only essential static resources
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activation immediately
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        return cache.addAll(urlsToCache).catch(err => {
          console.log('Cache failed for some resources:', err);
          return Promise.resolve(); // Don't fail the entire install
        });
      })
  );
});

// Fetch event - network first for HTML/JS/CSS, cache only for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // For API calls and development, always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.includes('vite') || url.pathname.includes('@')) {
    return;
  }
  
  // For static images, icons, manifest - cache first
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request).then((fetchResponse) => {
            const responseClone = fetchResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
            return fetchResponse;
          });
        })
    );
    return;
  }
  
  // For everything else (HTML, JS, CSS) - network first, no aggressive caching
  event.respondWith(
    fetch(event.request)
      .then(response => response)
      .catch((error) => {
        // Only fallback to cache for critical navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/') || new Response('App offline', { status: 503 });
        }
        return new Response('Network error', { status: 503 });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  self.clients.claim(); // Take control immediately
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep only the current static cache, delete everything else
          if (cacheName !== STATIC_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// iOS-specific optimizations
self.addEventListener('beforeinstallprompt', (event) => {
  // Prevent the mini-infobar from appearing on mobile
  event.preventDefault();
  // Stash the event so it can be triggered later
  window.deferredPrompt = event;
});

// Handle background sync for offline functionality
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Sync offline data when connection is restored
  return fetch('/api/sync')
    .then(response => response.json())
    .catch(err => console.log('Background sync failed:', err));
}