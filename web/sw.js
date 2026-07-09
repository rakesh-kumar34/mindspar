// Mindspar service worker: installability + sensible caching.
//
// Strategy (chosen after the stale-build incident):
//  - The SHELL (index.html and the versioned app.js?v=N) is NETWORK-FIRST,
//    so deploys land immediately; cache is only a fallback when offline.
//  - Heavy same-origin assets (questions.js ~600KB, fonts, icons, sounds)
//    are STALE-WHILE-REVALIDATE: served instantly from cache, refreshed in
//    the background. This is what makes sign-in fast on repeat visits.
//  - Cross-origin (Firebase SDK/API) is untouched.
const CACHE = "mindspar-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  const shell = url.pathname.endsWith("/") || url.pathname.endsWith(".html")
    || url.searchParams.has("v");
  if (shell) {
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// Focus (or open) the app when a notification is tapped.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
