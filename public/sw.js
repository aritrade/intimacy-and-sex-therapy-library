/* Minimal offline shell. No content caching for /chat or /companion: those are
 * intentionally network-only because we never want to serve a stale AI reply,
 * and we never want to put plaintext conversations into the SW cache.
 */

const CACHE = "istl-shell-v2";
const SHELL = ["/", "/glossary", "/myths", "/about/privacy", "/about/model", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never serve cached /api or /chat or /companion. AI surfaces and APIs must
  // be live.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/chat") ||
    url.pathname.startsWith("/companion")
  ) {
    return;
  }
  // Network-first for HTML; cache-first for static.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match("/"))),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
