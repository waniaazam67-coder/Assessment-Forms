const APP_VERSION = "2026-04-28-02";
const CACHE_NAME = `assessment-forms-v${APP_VERSION}`;
const LEGACY_CACHE_PREFIXES = ["assessment-forms-v", "app-shell-", "shehersaaz-app-", "shehersaaz-"];
const PRECACHE_URLS = [
  "/",
  `/index.html?v=${APP_VERSION}`,
  `/pages/index.html?v=${APP_VERSION}`,
  `/pages/admin-dashboard/index.html?v=${APP_VERSION}`,
  `/assets/js/app-config.js?v=${APP_VERSION}`,
  `/assets/js/forms.js?v=${APP_VERSION}`,
  `/assets/js/admin.js?v=${APP_VERSION}`,
  `/assets/css/forms.css?v=${APP_VERSION}`,
  `/assets/css/admin.css?v=${APP_VERSION}`,
  `/assets/images/Adaptation Fund Logo Final Tr.png?v=${APP_VERSION}`,
  `/assets/images/pakistan_skyline_final.png?v=${APP_VERSION}`,
  `/assets/images/rainwater-harvesting-unit-hero.png?v=${APP_VERSION}`,
  `/assets/images/Shehersaaz Logo Update 2025.png?v=${APP_VERSION}`,
  `/assets/images/UN-Habitat Logo Vector.png?v=${APP_VERSION}`,
];

const isCacheableResponse = (response) => Boolean(response && response.ok);

const deleteOldCaches = async () => {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key !== CACHE_NAME && LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key))
  );
};

const cacheResponse = async (request, response) => {
  if (!isCacheableResponse(response)) {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await deleteOldCaches();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const networkOnlyApi = async (request) => {
  try {
    return await fetch(request, { cache: "no-store" });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Unable to reach the backend API." }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
};

const networkFirstHtml = async (request) => {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: "no-store" });
    await cacheResponse(request, response);
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request, { ignoreSearch: true });
    if (cachedResponse) {
      return cachedResponse;
    }

    const fallbackResponse = await cache.match(`/pages/admin-dashboard/index.html?v=${APP_VERSION}`, { ignoreSearch: true });
    if (fallbackResponse) {
      return fallbackResponse;
    }

    throw error;
  }
};

const cacheStaticAsset = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request, { ignoreSearch: false });
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request, { cache: "no-store" });
  return cacheResponse(request, response);
};

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith(networkOnlyApi(event.request));
    return;
  }

  const isHtmlRequest =
    event.request.mode === "navigate" ||
    requestUrl.pathname === "/" ||
    requestUrl.pathname.endsWith(".html");
  const isStaticAsset =
    ["style", "script", "worker", "font", "image"].includes(event.request.destination) ||
    /\.(?:css|js|png|jpg|jpeg|svg|webp|gif|woff2?)$/i.test(requestUrl.pathname);

  if (isHtmlRequest) {
    event.respondWith(networkFirstHtml(event.request));
    return;
  }

  if (isStaticAsset) {
    event.respondWith(cacheStaticAsset(event.request));
  }
});
