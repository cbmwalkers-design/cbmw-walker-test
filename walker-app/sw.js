// Service worker for the Walker App (scope: /cbmw/walker-app/).
// Keeps the app's own files and the Firebase library on the device, so the app opens with no signal.
// Walk data is kept separately by app.js (see the offline copy there).
const CACHE = "cbmw-walker-v4";

// Our own files, cached at install
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./walker.css",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "../apps/firebase-config.js",
  "../shared/cbmw-common.js",
  "../shared/cbmw-popup.css",
];

// The Firebase library is loaded from Google's servers, so it is cached too
const FIREBASE = [
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js",
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js",
];

// Caches one URL. A failure is logged and does not stop the others from being cached.
async function precache(cache, url) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (response.ok) await cache.put(url, response);
  } catch (err) {
    console.warn("Not cached:", url, err);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all([...SHELL, ...FIREBASE].map((url) => precache(cache, url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Our files and the Firebase library: answer from the cache at once, and refresh the cache from the network when it can.
// Anything else (the database connection, map tiles, downloads) is left to the network.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const ours = url.origin === self.location.origin;
  const library = url.origin === "https://www.gstatic.com";
  if (!ours && !library) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
