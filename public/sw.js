const CACHE_NAME = "shehersaaz-v3";
const STATIC_CACHE = `${CACHE_NAME}-static`;
const IMAGE_CACHE = `${CACHE_NAME}-images`;
const LEGACY_CACHE_PREFIXES = ["app-shell-", "shehersaaz-app-", "shehersaaz-"];
const ASSET_VERSION = "v3";

const PRECACHE_URLS = [
  "/",
  `/assets/images/Adaptation Fund Logo Final Tr.png?v=${ASSET_VERSION}`,
  `/assets/images/pakistan_skyline_final.png?v=${ASSET_VERSION}`,
  `/assets/images/rainwater-harvesting-unit-hero.png?v=${ASSET_VERSION}`,
  `/assets/images/Shehersaaz Logo Update 2025.png?v=${ASSET_VERSION}`,
  `/assets/images/UN-Habitat Logo Vector.png?v=${ASSET_VERSION}`,
];

const isCacheableResponse = (response) => Boolean(response && response.ok);

const deleteLegacyCaches = async () => {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => {
        if (key === STATIC_CACHE || key === IMAGE_CACHE) {
          return false;
        }

        return LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
      })
      .map((key) => caches.delete(key))
  );
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await deleteLegacyCaches();
    await self.clients.claim();
  })());
});

const networkFirst = async (request, cacheName, options = {}) => {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request, {
      cache: options.requestCache || "no-store",
    });

    if (isCacheableResponse(networkResponse) && options.cacheResponse !== false) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request, { ignoreSearch: options.ignoreSearch === true });
    if (cachedResponse) {
      return cachedResponse;
    }

    if (options.fallbackUrl) {
      const fallbackResponse = await cache.match(options.fallbackUrl, { ignoreSearch: true });
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }

    throw error;
  }
};

const staleWhileRevalidateImage = async (request) => {
  const cache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await cache.match(request, { ignoreSearch: true });

  const networkPromise = fetch(request).then(async (response) => {
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  });

  return cachedResponse || networkPromise;
};

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (requestUrl.pathname === "/") {
    event.respondWith(fetch("/pages/index.html", { cache: "no-store" }));
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: "Unable to reach the backend API." }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
        },
      }))
    );
    return;
  }

  const isHtmlRequest =
    event.request.mode === "navigate" ||
    requestUrl.pathname.endsWith(".html");
  const isScriptRequest = requestUrl.pathname.endsWith(".js");
  const isStyleRequest = requestUrl.pathname.endsWith(".css");
  const isImageRequest = event.request.destination === "image";

  if (isHtmlRequest) {
    event.respondWith(
      networkFirst(event.request, STATIC_CACHE, {
        requestCache: "no-store",
        cacheResponse: false,
        fallbackUrl: "/pages/index.html",
      })
    );
    return;
  }

  if (isScriptRequest || isStyleRequest) {
    event.respondWith(
      networkFirst(event.request, STATIC_CACHE, {
        requestCache: "no-store",
        ignoreSearch: false,
      })
    );
    return;
  }

  if (isImageRequest) {
    event.respondWith(staleWhileRevalidateImage(event.request));
    return;
  }
});
