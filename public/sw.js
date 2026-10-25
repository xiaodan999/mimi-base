const VERSION = "v7.0.0";
const CACHE_NAME = `mimi-base-${VERSION}`;

console.log(VERSION);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(["/"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("mimi-base-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  // let cross-origin requests (PocketBase API, CDN assets, ...) go straight to the network
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }

  // the manifest must always come fresh from the network, otherwise shortcut/icon
  // updates in it would never reach installed apps
  if (url.pathname === "/manifest.json") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached =
      (await cache.match(request)) ??
      (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
    return cached ?? Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkUpdate = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await networkUpdate) ?? Response.error();
}

self.addEventListener("notificationclick", (event) => {
  console.log("On notification click:", event.notification.tag);
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
      })
      .then((clientList) => {
        // if the user already opens a tab that matches the `data.pathname`, focus on that tab.
        // else open a new tab.
        for (const client of clientList) {
          const pathname = new URL(client.url).pathname;
          if (pathname === event.notification.data?.pathname && "focus" in client)
            return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(event.notification.data?.pathname ?? "/");
      }),
  );
});

self.addEventListener("push", async (e) => {
  const { type, data } = e.data.json();
  if (type === "notification") {
    if (Notification.permission === "granted") {
      const { title, options } = data;
      const focused = await isFocused(options.data.pathname);
      if (!focused) {
        registration.showNotification(title, options);
      } else {
        console.log(
          "got a notification, but user does not need to see. cuz the window is focused.",
        );
      }
    }
  }
});

async function isFocused(pathname) {
  const windowClients = await clients.matchAll({ type: "window" });
  for (const client of windowClients) {
    const clientPathname = new URL(client.url).pathname;
    if (pathname === clientPathname && client.focused) {
      return true;
    }
  }
  return false;
}
