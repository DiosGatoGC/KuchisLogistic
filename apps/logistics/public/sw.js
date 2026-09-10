/* KUCHI'S Logistics: network-only worker. Operational data is never cached. */
self.addEventListener("install", () => {
  // The update waits for existing app windows to close; no forced mid-operation reload.
});

self.addEventListener("activate", () => {
  // Browser lifecycle activates the new worker without claiming open clients.
});

self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") {
    event.respondWith(fetch(event.request));
  }
});
