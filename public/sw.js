const VERSION = "v6.2.0";
console.log(VERSION);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

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
  for (client of windowClients) {
    const clientPathname = new URL(client.url).pathname;
    if (pathname === clientPathname && client.focused) {
      return true;
    }
  }
  return false;
}
