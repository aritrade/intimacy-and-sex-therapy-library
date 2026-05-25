/* Minimal offline shell. No content caching for /chat or /companion: those are
 * intentionally network-only because we never want to serve a stale AI reply,
 * and we never want to put plaintext conversations into the SW cache.
 */

const CACHE = "istl-shell-v3";
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
  // Only intercept GETs. Anything else (POST/PUT/etc) must always go to the
  // network without SW involvement.
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests entirely. The shell only caches same-origin
  // assets; intercepting third-party requests (e.g. Vercel Blob media) just
  // creates CSP / range-request headaches with no benefit.
  if (url.origin !== self.location.origin) return;

  // Admin console is online-only; never cache, never intercept. Avoids
  // service-worker MITM'ing video <src> requests, draft mutations, etc.
  if (url.pathname.startsWith("/admin")) return;

  // Range requests (HTML5 video seeking) can't be served from Cache API
  // because the cache doesn't honour Range headers. Let them through.
  if (event.request.headers.has("range")) return;

  // Never serve cached /api or /chat or /companion. AI surfaces and APIs
  // must be live.
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
