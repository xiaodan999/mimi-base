/**
 * PocketBase report access and the bug-report transcript fetch.
 *
 * Rows are always read with the caller's token, so the collection rules stay
 * the visibility boundary; ownership is checked again in the service because
 * the shared feature-suggestion read rule lets the other account see a row.
 */

import type { PbClient } from "../http/pb";
import { buildTranscript, cleanText, messageText } from "./markdown";
import type { FeedbackReport, TranscriptMessage } from "./types";

const MAX_TRANSCRIPT_MESSAGES = 20;

export type ReportRead =
    { ok: true; report: FeedbackReport } | { ok: false; status: number };

export async function readReport(
    pb: PbClient,
    id: string,
    token: string,
): Promise<ReportRead> {
    const fetched = await pb.get<FeedbackReport>(
        `/api/collections/feedback_reports/records/${id}`,
        token,
    );
    if (!fetched.ok) return fetched;
    return { ok: true, report: fetched.data };
}

/** Title + Markdown transcript for a bug report's attached conversation. */
export async function withTranscript(
    pb: PbClient,
    report: FeedbackReport,
    token: string,
): Promise<{ transcript: string; title: string }> {
    if (!report.conversation) return { transcript: "", title: "" };
    const conversation = await pb.get<{ title?: unknown }>(
        `/api/collections/chat_conversations/records/${report.conversation}`,
        token,
    );
    // The relation is owner-scoped too; an unreadable conversation just
    // means the transcript is omitted, never a failed submission.
    if (!conversation.ok) return { transcript: "", title: "" };
    const title =
        typeof conversation.data.title === "string"
            ? conversation.data.title
            : "";
    // Only the newest messages are used. `sort=-seq` + a 20-row page
    // keeps a long conversation from pulling 200 x 5 MB JSON rows and
    // fixes the old ascending fetch, which returned the *first* page.
    const listing = await pb.get<{ items?: unknown[] }>(
        "/api/collections/chat_messages/records",
        token,
        {
            query: {
                perPage: String(MAX_TRANSCRIPT_MESSAGES),
                sort: "-seq",
                fields: "role,parts,content",
                filter: `conversation = "${report.conversation.replace(/[^a-z0-9]/gi, "")}"`,
            },
        },
    );
    if (!listing.ok) return { transcript: "", title };
    const messages: TranscriptMessage[] = [];
    // Newest first from PocketBase; the transcript builder expects
    // chronological order so the latest message wins truncation.
    for (const row of [...(listing.data.items ?? [])].reverse()) {
        if (!row || typeof row !== "object") continue;
        const record = row as {
            role?: unknown;
            parts?: unknown;
            content?: unknown;
        };
        const role = record.role === "assistant" ? "assistant" : "user";
        const text =
            messageText(record.parts) || cleanText(record.content, 4000) || "";
        if (text) messages.push({ role, text });
    }
    if (messages.length === 0) return { transcript: "", title };
    return { transcript: buildTranscript(title, messages), title };
}
