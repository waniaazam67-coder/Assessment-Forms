const CACHE_VERSION = "shehersaaz-app-v3";
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/pages/index.html",
  "/pages/household-information.html",
  "/pages/engineering-assessment.html",
  "/pages/inventory.html",
  "/pages/socioeconomic-assessment.html",
  "/pages/admin-dashboard/index.html",
  "/pages/admin-dashboard/dashboard.html",
  "/assets/css/forms.css",
  "/assets/css/admin.css",
  "/assets/js/forms.js",
  "/assets/js/admin.js",
  "/assets/images/Adaptation Fund Logo Final Tr.png",
  "/assets/images/pakistan_skyline_final.png",
  "/assets/images/rainwater-harvesting-unit-hero.png",
  "/assets/images/Shehersaaz Logo Update 2025.png",
  "/assets/images/UN-Habitat Logo Vector.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("app-shell-") && key !== APP_SHELL_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (requestUrl.pathname === "/") {
    event.respondWith(Response.redirect("/pages/index.html", 302));
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  const isDocumentRequest = event.request.mode === "navigate";
  const isStaticAsset = [".html", ".css", ".js"].some((extension) => requestUrl.pathname.endsWith(extension));

  if (isDocumentRequest || isStaticAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || caches.match("/pages/index.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match("/pages/index.html"));
    })
  );
});
