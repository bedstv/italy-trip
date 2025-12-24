// Simple Service Worker (offline shell)
// - Does NOT precache config.js (so settings changes take effect)
// - Uses cache-first for app assets
const CACHE = "italy-trip-v26-2";

const ASSETS = [
  "./",
  "./index.html",
  "./overview.html",
  "./places.html",
  "./transport.html",
  "./memo.html",
  "./debug.html",
  "./style.css",
  "./manifest.json",
  "./app.js",
  "./overview.js",
  "./lib.js",
  "./api.js",
  "./xlsx_loader.js",
  "./places.js",
  "./transport.js",
  "./memo.js",
  "./config.example.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache dynamic config
  if (url.pathname.endsWith("/config.js")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // External requests: network first
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // Same-origin: cache first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
