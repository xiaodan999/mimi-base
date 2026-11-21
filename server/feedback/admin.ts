/**
 * Server-owned report fields.
 *
 * `ownership.pb.js` restores `status` / `issue_*` / `error` / `issue_state`
 * from the old row on every non-superuser update, so a caller-token PATCH
 * succeeds while saving nothing. The PB client mints a cached superuser token
 * and falls back to the caller token when no credentials are configured.
 */

import type { PbClient } from "../http/pb";

export function reportRecordPath(id: string): string {
    return `/api/collections/feedback_reports/records/${id}`;
}

export function createReportAdmin(pb: PbClient) {
    return {
        patchFields(
            id: string,
            body: Record<string, unknown>,
            callerToken: string,
        ): Promise<boolean> {
            return pb.patchReport(reportRecordPath(id), body, callerToken);
        },
    };
}

export type ReportAdmin = ReturnType<typeof createReportAdmin>;
