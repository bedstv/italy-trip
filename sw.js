const CACHE = "italy-trip-v24-v241";

const ASSETS = [
  "./",
  "./index.html",
  "./overview.html",
  "./places.html",
  "./transport.html",
  "./memo.html",
  "./style.css",
  "./app.js",
  "./overview.js",
  "./lib.js",
  "./api.js",
  "./places.js",
  "./transport.js",
  "./memo.js",
  // config.js 刻意不預先快取，方便你改設定後馬上生效
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

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const host = url.hostname;

  // ✅ 外部資料永遠走網路（避免看到舊行程）
  if (host.includes("google.com") || host.includes("gstatic.com")) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});