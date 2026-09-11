/* KUCHI'S Logistics: network-only worker. Operational data is never cached. */
self.addEventListener("install", () => {
  // The update waits for existing app windows to close; no forced mid-operation reload.
});

self.addEventListener("activate", () => {
  // Browser lifecycle activates the new worker without claiming open clients.
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isApplicationRoute = !requestUrl.pathname.startsWith("/api/");

  if (event.request.method !== "GET" || !isSameOrigin || !isApplicationRoute) return;

  event.respondWith(fetch(event.request));
});
