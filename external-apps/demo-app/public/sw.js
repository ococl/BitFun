/**
 * BitFun Demo App — Service Worker
 * Provides offline caching for all static assets.
 */

const CACHE_NAME = 'bitfun-demo-app-v1';

/**
 * Determine if a request/response pair should be cached.
 */
function isCacheable(request, response) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  // Only cache same-origin resources
  if (url.origin !== self.location.origin) return false;
  // Do not cache opaque responses or errors
  if (!response || response.status !== 200 || response.type === 'opaque') {
    return false;
  }
  return true;
}

/**
 * Install: claim clients immediately so the SW controls pages right away.
 */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

/**
 * Activate: clean up old caches and claim clients.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch:
 * - Navigation requests (HTML pages) → Network first, fallback to cache.
 * - Static assets (JS/CSS/images/fonts) → Cache first, fallback to network, then cache.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  const isNavigation = request.mode === 'navigate';

  if (isNavigation) {
    // Network-first for HTML: try network, fallback to cache
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(request, response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // If both network and cache fail, return a simple offline page
            return new Response(
              '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Offline</title><style>body{background:#0f0f11;color:#e6e6e6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;}</style></head><body><div><h1>You are offline</h1><p>Please connect to the internet and try again.</p></div></body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        })
    );
  } else {
    // Cache-first for static assets
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Revalidate in background (stale-while-revalidate)
          fetch(request).then((response) => {
            if (isCacheable(request, response)) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
            }
          }).catch(() => {});
          return cached;
        }

        return fetch(request).then((response) => {
          if (isCacheable(request, response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
