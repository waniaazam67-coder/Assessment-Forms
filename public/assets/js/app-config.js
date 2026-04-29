(() => {
  const APP_VERSION = "2026-04-29-03";
  const SW_URL = `/sw.js?v=${encodeURIComponent(APP_VERSION)}`;
  let hasRegisteredServiceWorker = false;
  let isReloadingForUpdate = false;

  const versionedPath = (path) => {
    const normalizedPath = String(path || "").trim();
    if (!normalizedPath) {
      return normalizedPath;
    }

    const separator = normalizedPath.includes("?") ? "&" : "?";
    return `${normalizedPath}${separator}v=${encodeURIComponent(APP_VERSION)}`;
  };

  const showUpdateBanner = () => {
    if (document.getElementById("app-update-banner")) {
      return;
    }

    const banner = document.createElement("div");
    banner.id = "app-update-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.style.position = "fixed";
    banner.style.right = "16px";
    banner.style.bottom = "16px";
    banner.style.zIndex = "9999";
    banner.style.maxWidth = "320px";
    banner.style.padding = "14px 16px";
    banner.style.borderRadius = "16px";
    banner.style.background = "rgba(20, 30, 43, 0.96)";
    banner.style.color = "#ffffff";
    banner.style.boxShadow = "0 20px 45px rgba(0, 0, 0, 0.22)";
    banner.innerHTML = `
      <div style="display:grid; gap:10px;">
        <strong style="font-size:0.95rem;">Update available</strong>
        <span style="font-size:0.92rem; line-height:1.5;">A newer version of the app is ready. Refresh when you are done with your current task.</span>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" data-app-update-refresh style="border:0; border-radius:999px; padding:10px 14px; font:inherit; font-weight:700; background:#5fb36f; color:#10211a; cursor:pointer;">Refresh</button>
          <button type="button" data-app-update-dismiss style="border:1px solid rgba(255,255,255,0.24); border-radius:999px; padding:10px 14px; font:inherit; font-weight:700; background:transparent; color:#ffffff; cursor:pointer;">Later</button>
        </div>
      </div>
    `;

    banner.querySelector("[data-app-update-refresh]")?.addEventListener("click", () => {
      if (isReloadingForUpdate) {
        return;
      }

      isReloadingForUpdate = true;
      window.location.reload();
    });

    banner.querySelector("[data-app-update-dismiss]")?.addEventListener("click", () => {
      banner.remove();
    });

    document.body.append(banner);
  };

  const registerServiceWorker = () => {
    if (
      hasRegisteredServiceWorker ||
      !("serviceWorker" in navigator) ||
      window.location.protocol === "file:" ||
      (["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "5173")
    ) {
      return;
    }

    hasRegisteredServiceWorker = true;

    window.addEventListener("load", () => {
      void (async () => {
        try {
          const registration = await navigator.serviceWorker.register(SW_URL, {
            updateViaCache: "none",
          });

          if (registration.waiting && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }

          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;
            if (!installingWorker) {
              return;
            }

            installingWorker.addEventListener("statechange", () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateBanner();
              }
            });
          });

          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (isReloadingForUpdate) {
              return;
            }

            isReloadingForUpdate = true;
            window.location.reload();
          });
        } catch (error) {
          console.warn("Service worker registration failed:", error);
        }
      })();
    });
  };

  window.__SHEHERSAAZ_APP__ = {
    APP_VERSION,
    SW_URL,
    versionedPath,
    registerServiceWorker,
  };
})();
