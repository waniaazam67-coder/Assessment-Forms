(() => {
  const APP_VERSION = "2026-05-field-01";
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

  const showVersionMarker = () => {
    if (document.getElementById("app-version-marker")) {
      return;
    }

    const marker = document.createElement("div");
    marker.id = "app-version-marker";
    marker.setAttribute("aria-label", `Assessment Forms version ${APP_VERSION}`);
    marker.style.position = "fixed";
    marker.style.left = "12px";
    marker.style.bottom = "12px";
    marker.style.zIndex = "9998";
    marker.style.padding = "6px 10px";
    marker.style.borderRadius = "999px";
    marker.style.background = "rgba(255, 255, 255, 0.92)";
    marker.style.border = "1px solid rgba(20, 30, 43, 0.12)";
    marker.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.08)";
    marker.style.color = "#1f2937";
    marker.style.font = "600 12px/1.2 Manrope, system-ui, sans-serif";
    marker.textContent = `Version ${APP_VERSION}`;
    document.body.append(marker);
  };

  const showFormsBootError = () => {
    if (document.getElementById("forms-boot-error")) {
      return;
    }

    const errorCard = document.createElement("div");
    errorCard.id = "forms-boot-error";
    errorCard.setAttribute("role", "alert");
    errorCard.style.margin = "16px auto";
    errorCard.style.maxWidth = "960px";
    errorCard.style.padding = "14px 16px";
    errorCard.style.borderRadius = "16px";
    errorCard.style.background = "#fff4e5";
    errorCard.style.border = "1px solid #f4b266";
    errorCard.style.color = "#7c2d12";
    errorCard.style.font = "600 14px/1.5 Manrope, system-ui, sans-serif";
    errorCard.textContent = `This form did not load completely. Please refresh once. If the problem continues, clear old site data/service worker for this device. Assessment Forms version: ${APP_VERSION}`;

    const target = document.querySelector("[data-form-page]") || document.body;
    target.prepend(errorCard);
  };

  const monitorFormsBoot = () => {
    if (!document.querySelector("[data-form-page]")) {
      return;
    }

    window.setTimeout(() => {
      if (!window.__SHEHERSAAZ_FORMS_BOOTED__) {
        showFormsBootError();
      }
    }, 3000);
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
    showFormsBootError,
  };

  console.info(`Assessment Forms version: ${APP_VERSION}`);

  window.addEventListener("DOMContentLoaded", () => {
    showVersionMarker();
    monitorFormsBoot();
  });
})();
