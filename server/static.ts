/**
 * Static serving for the built SPA.
 *
 * Caddy routes `/api/*` and `/db/*`; everything else lands here. Hashed
 * Vite assets are immutable, the shell files must revalidate, and unknown
 * extension-less paths fall back to index.html for client-side routing.
 */

import { statSync } from "node:fs";
import path from "node:path";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

function cacheControl(pathname: string): string {
    if (pathname.startsWith("/assets/")) return IMMUTABLE;
    if (pathname.startsWith("/images/")) return "public, max-age=604800";
    if (
        pathname === "/" ||
        pathname === "/index.html" ||
        pathname === "/sw.js" ||
        pathname === "/manifest.json" ||
        pathname === "/version.json"
    ) {
        return REVALIDATE;
    }
    return "public, max-age=86400";
}

function isFile(target: string): boolean {
    try {
        return statSync(target).isFile();
    } catch {
        return false;
    }
}

export function createStaticHandler(root: string) {
    const indexPath = path.join(root, "index.html");

    return async (req: Request, url: URL): Promise<Response> => {
        if (req.method !== "GET" && req.method !== "HEAD") {
            return new Response("method not allowed", { status: 405 });
        }

        let pathname: string;
        try {
            pathname = decodeURIComponent(url.pathname);
        } catch {
            return new Response("bad request", { status: 400 });
        }
        if (pathname.includes("\0")) {
            return new Response("bad request", { status: 400 });
        }

        // Never serve dotfiles (.env, .git) even if they end up in the image.
        if (
            pathname
                .split("/")
                .some((part) => part.startsWith(".") && part !== "..")
        ) {
            return new Response("not found", { status: 404 });
        }

        const target = path.resolve(root, `.${pathname}`);
        const relative = path.relative(root, target);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            return new Response("not found", { status: 404 });
        }

        const hasExtension = path.extname(pathname) !== "";
        let filePath = target;
        if (pathname.endsWith("/") || !isFile(filePath)) {
            if (hasExtension) {
                return new Response("not found", { status: 404 });
            }
            filePath = indexPath;
        }

        const file = Bun.file(filePath);
        if (!(await file.exists())) {
            return new Response("not found", { status: 404 });
        }

        const headers = new Headers({
            "Cache-Control": cacheControl(pathname),
            "X-Content-Type-Options": "nosniff",
        });
        if (req.method === "HEAD") {
            headers.set("Content-Type", file.type);
            return new Response(null, { headers });
        }
        return new Response(file, { headers });
    };
}
