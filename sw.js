const CACHE_NAME = 'travel-hub-cache-v2';
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap'
];

// Install event: precache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        self.skipWaiting();
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        return self.clients.claim();
    })
  );
});

// Fetch event: serve from cache first, then network
self.addEventListener('fetch', event => {
    // We only want to cache GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // For Google Fonts, use a stale-while-revalidate strategy
    if (event.request.url.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(response => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                    // Serve from cache if available, while updating it in the background
                    return response || fetchPromise;
                });
            })
        );
        return;
    }

    // For API calls (like our /api/proxy), always go to the network
    if (event.request.url.includes('/api/proxy')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // For all other requests (app shell, assets), use cache-first
    event.respondWith(
        caches.match(event.request)
        .then(response => {
            // Cache hit - return response
            if (response) {
                return response;
            }

            // Not in cache - fetch from network, cache it, and return
            return fetch(event.request).then(
                networkResponse => {
                    // Check if we received a valid response
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                         if (!networkResponse.url.startsWith('chrome-extension://')) {
                            return networkResponse;
                         }
                    }

                    // Clone the response because it's a stream
                    const responseToCache = networkResponse.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                    return networkResponse;
                }
            ).catch(error => {
                console.error('Service Worker: Fetch failed', error);
                // You could return a fallback offline page here if you had one
            });
        })
    );
});