/* webosu service worker: installable PWA + offline shell. Does NOT cache the
   /api backend or catboy.best requests. */
const CACHE = "webosu-v1";
const SHELL = [
  "/", "/index.html", "/index-v2.html",
  "/browse-v2.html", "/search-v2.html", "/hot-v2.html", "/new-v2.html",
  "/liked-v2.html", "/history-v2.html", "/leaderboard-v2.html",
  "/profile-v2.html", "/skins-v2.html", "/settings-v2.html",
  "/css/main.css", "/css/picnic.min.css", "/css/font.css",
  "/sprites.json",
  "/src/game/main.js", "/src/game/pixi.js", "/src/game/sound.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // never cache the webosu API or catboy.best
  if (url.pathname.startsWith("/api") || url.hostname.indexOf("catboy.best") !== -1) {
    e.respondWith(fetch(req));
    return;
  }

  // navigations: network-first, fall back to cached shell
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // same-origin static assets: cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
      })
    );
  }
});
