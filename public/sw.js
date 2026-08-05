// Minimal PWA service worker — app-shell caching only.
//
// This is a live inventory/order-management app: stock counts, order
// status, and dashboard numbers change constantly. Caching /api/* responses
// would mean showing stale stock/order data as if it were current, which is
// actively misleading for an inventory system — so API requests are always
// network-only here, never intercepted or cached. Only the static app shell
// (icons, manifest, the offline fallback page) is cached, purely so the app
// can show something (and the offline page) instead of a bare browser error
// when there's no connection.
const CACHE_NAME = "apds-ims-shell-v1";
const SHELL_ASSETS = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch API calls or any cross-origin request — those must always
  // hit the network live, not be served from (or written to) the cache.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Full-page navigations: try the network first (so users always get the
  // latest app build while online), fall back to the offline page only when
  // the network request actually fails.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // Static shell assets: cache-first, populating the cache on first fetch.
  if (SHELL_ASSETS.some((asset) => url.pathname === asset)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return res;
      }))
    );
  }
});
