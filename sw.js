const CACHE = "italy-trip-v3"; // ← 你之後若再改動核心檔案，改 v4、v5…

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 不快取 Google / Apps Script 回應，避免更新卡住
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const host = url.hostname;

  if (host.includes("google.com") || host.includes("gstatic.com")) {
    return; // 直接走網路
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});