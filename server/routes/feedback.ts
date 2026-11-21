/**
 * `/api/feedback/*` routes.
 *
 * The id-list and report payloads are small and owned by us, so TypeBox
 * schemas document their shape; the service still filters ids defensively to
 * preserve the old "skip what you cannot read" behavior.
 */

import { Elysia, t } from "elysia";

import type { FeedbackService } from "../feedback/service";
import { getRequestAuth, requireAuth } from "../http/auth";
import { HttpError } from "../http/errors";

const REPORT_BODY = t.Object({
    reportId: t.Optional(t.String()),
});

const ISSUE_STATE_BODY = t.Object({
    reportIds: t.Optional(t.Array(t.Unknown())),
});

export function feedbackRoutes(service: FeedbackService) {
    return new Elysia({ name: "feedback" })
        .post(
            "/api/feedback/report",
            ({ request, body }) => {
                const auth = requireAuth(getRequestAuth(request));
                return service.report(request, auth, body);
            },
            { body: REPORT_BODY },
        )
        .post("/api/feedback/upload", ({ request, body }) => {
            const auth = requireAuth(getRequestAuth(request));
            if (!(body instanceof FormData)) {
                throw new HttpError(400, "请求内容不是合法的表单", {
                    code: "invalid_body",
                });
            }
            return service.upload(request, auth, body);
        })
        .post(
            "/api/feedback/issue-state",
            ({ request, body }) => {
                const auth = requireAuth(getRequestAuth(request));
                return service.issueStates(request, auth, body);
            },
            { body: ISSUE_STATE_BODY },
        );
}
