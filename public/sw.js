const VERSION = "v9.0.0";
const CACHE_NAME = `mimi-base-${VERSION}`;

console.log(VERSION);

// Shown when a navigation fails and neither the request nor the app shell is
// cached. Kept inline so it works even if no static asset was ever fetched.
const OFFLINE_HTML = `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>离线 · 秘密基地</title>
<style>
    :root { color-scheme: light dark; }
    body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: #fbfaf6; color: #17352c;
        font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    main { max-width: 20rem; padding: 2rem; text-align: center; }
    .badge {
        display: inline-grid; place-items: center; width: 4rem; height: 4rem;
        border-radius: 999px; background: rgba(28, 105, 80, 0.1); color: #2b6b54;
    }
    h1 { font-size: 1.25rem; margin: 1rem 0 0.5rem; }
    p { font-size: 0.875rem; line-height: 1.7; color: #5b6b64; margin: 0; }
    button {
        margin-top: 1.5rem; border: 0; border-radius: 999px;
        padding: 0.75rem 1.5rem; background: #2b6b54; color: #fbfaf6;
        font-size: 0.875rem; font-weight: 600; font-family: inherit;
    }
    @media (prefers-color-scheme: dark) {
        body { background: #0e1512; color: #f3efe3; }
        .badge { background: rgba(111, 195, 162, 0.14); color: #6fc3a2; }
        p { color: #9fb0a8; }
        button { background: #6fc3a2; color: #0e1512; }
    }
</style>
</head>
<body>
<main>
    <div class="badge">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M2 2l20 20"></path>
            <path d="M8.5 16.5a5 5 0 0 1 7 0"></path>
            <path d="M5 12.5a10 10 0 0 1 14 0"></path>
            <path d="M1.5 8.5a15 15 0 0 1 21 0"></path>
        </svg>
    </div>
    <h1>当前没有网络</h1>
    <p>秘密基地暂时连不上服务器。已缓存的页面还能打开，网络恢复后点下面按钮继续。</p>
    <button onclick="location.reload()">重新连接</button>
</main>
</body>
</html>`;

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(["/"])),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(
                names
                    .filter(
                        (name) =>
                            name.startsWith("mimi-base-") &&
                            name !== CACHE_NAME,
                    )
                    .map((name) => caches.delete(name)),
            );
            await self.clients.claim();
        })(),
    );
});

// A new worker waits until the page asks it to take over, so an open tab is
// never handed new code without a chance to reload.
self.addEventListener("message", (event) => {
    const data = event.data;
    if (data === "SKIP_WAITING" || data?.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
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
        return cached ?? offlineResponse();
    }
}

function offlineResponse() {
    return new Response(OFFLINE_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
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
                    if (
                        pathname === event.notification.data?.pathname &&
                        "focus" in client
                    )
                        return client.focus();
                }
                if (clients.openWindow)
                    return clients.openWindow(
                        event.notification.data?.pathname ?? "/",
                    );
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
