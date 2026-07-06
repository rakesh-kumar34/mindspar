// Mindspar service worker. Its job today is to make the app installable to the
// home screen (a registered SW with a fetch handler is required for that) and
// to handle notification taps. We deliberately DON'T cache app.js/questions —
// the app needs the network for Firebase anyway, and caching versioned assets
// caused stale-build headaches before. (A push handler can be added later for
// closed-app notifications.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Pass-through fetch handler — present so the app qualifies as installable.
self.addEventListener("fetch", () => {});

// Focus (or open) the app when a notification is tapped.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
