/**
 * `/api/video/compress` route.
 */

import { Elysia } from "elysia";

import { getRequestAuth, requireAuth } from "../http/auth";
import { HttpError } from "../http/errors";
import type { VideoService } from "../video";

export function videoRoutes(service: VideoService) {
    return new Elysia({ name: "video" }).post(
        "/api/video/compress",
        ({ request, body }) => {
            const auth = requireAuth(getRequestAuth(request));
            if (!(body instanceof FormData)) {
                throw new HttpError(400, "请求内容不是合法的表单", {
                    code: "invalid_body",
                });
            }
            return service.compress(request, auth, body);
        },
    );
}
