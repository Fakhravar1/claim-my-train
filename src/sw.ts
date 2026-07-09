/// <reference lib="webworker" />
// Qvitta service worker (built by vite-plugin-pwa, injectManifest strategy).
declare let self: ServiceWorkerGlobalScope;

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

// registerType: "prompt" — a new worker installs in the background but stays in
// the "waiting" state until the user taps "Uppdatera" (see src/main.tsx), which
// posts SKIP_WAITING here. That on-demand activation is what lets us reload onto
// the fresh bundle deliberately, instead of the old unconditional skipWaiting()
// that swapped the bundle mid-session and left phones on a stale cached shell
// until a full app restart.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", () => self.clients.claim());

// Hashed build assets: precached, served cache-first.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigations: network-first so a Lovable redeploy is picked up immediately;
// the precached index.html is only the offline fallback. Supabase requests are
// cross-origin and match no route here, so they always go straight to network.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: "qvitta-pages",
      networkTimeoutSeconds: 4,
      plugins: [
        {
          handlerDidError: async () => createHandlerBoundToURL("index.html")({ request: new Request("/") } as never),
        },
      ],
    })
  )
);

// ---- Web Push (Slice 3) ----

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  count?: number;
}

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? undefined };
  }
  const title = payload.title ?? "Qvitta";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: payload.body ?? "Ny försening på din pendlingsrutt.",
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        data: { url: payload.url ?? "/my-delays" },
        tag: "qvitta-delays", // collapse repeat pushes into one notification
      });
      if (typeof payload.count === "number" && "setAppBadge" in self.navigator) {
        try {
          await (self.navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(payload.count);
        } catch {
          /* best-effort */
        }
      }
    })()
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/my-delays";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await (client as WindowClient).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
