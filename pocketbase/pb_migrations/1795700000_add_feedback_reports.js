/// <reference path="../pb_data/types.d.ts" />

// Bug reports submitted from `/feedback`.
//
// A report is written by the client first (screenshots upload in the same
// request), then the Bun supervisor reads it back with the caller's token and
// opens a GitHub issue. Keeping the record here means a report is never lost
// when GitHub is unreachable or `GITHUB_TOKEN` is not configured: `status`
// stays `stored` and the UI says 已收到反馈，暂未同步 GitHub.
//
// Rows are owner-scoped: reports may contain screenshots and console output
// from the user's own session, so a second account must never read them.
// `kind` already allows "feature" for the follow-up feature-request flow
// (issue #40); this migration only wires the bug flow.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId("users");
        const conversations =
            app.findCollectionByNameOrId("chat_conversations");

        const reports = new Collection({
            name: "feedback_reports",
            type: "base",
            // Only the owner can read their reports; the server fetches with
            // the caller's token, so these rules are the server-side boundary
            // too (a report id from another owner answers 404).
            listRule: "owner = @request.auth.id",
            viewRule: "owner = @request.auth.id",
            createRule:
                '@request.auth.id != "" && @request.body.owner = @request.auth.id',
            updateRule: "owner = @request.auth.id",
            deleteRule: "owner = @request.auth.id",
            indexes: [
                "CREATE INDEX idx_feedback_reports_owner_created ON `feedback_reports` (`owner`, `created`)",
            ],
        });
        reports.fields.add(
            new RelationField({
                name: "owner",
                required: true,
                maxSelect: 1,
                collectionId: users.id,
                cascadeDelete: true,
            }),
        );
        // "feature" is reserved for the feature-request flow (#40).
        reports.fields.add(
            new SelectField({
                name: "kind",
                required: true,
                maxSelect: 1,
                values: ["bug", "feature"],
            }),
        );
        reports.fields.add(
            new TextField({ name: "title", required: true, max: 120 }),
        );
        reports.fields.add(
            new TextField({ name: "description", required: true, max: 5000 }),
        );
        // The page the user was looking at when the problem happened.
        reports.fields.add(new TextField({ name: "route", max: 200 }));
        reports.fields.add(new TextField({ name: "app_version", max: 40 }));
        reports.fields.add(new TextField({ name: "app_sha", max: 64 }));
        reports.fields.add(new TextField({ name: "user_agent", max: 500 }));
        // Ring buffer captured client-side (last ~20 errors), capped so a
        // noisy session cannot bloat the record.
        reports.fields.add(new JSONField({ name: "console", maxSize: 100000 }));
        reports.fields.add(
            new SelectField({
                name: "status",
                required: true,
                maxSelect: 1,
                values: ["stored", "issue_created", "failed"],
            }),
        );
        reports.fields.add(new TextField({ name: "issue_url", max: 300 }));
        reports.fields.add(
            new NumberField({ name: "issue_number", onlyInt: true }),
        );
        reports.fields.add(new TextField({ name: "error", max: 500 }));
        reports.fields.add(
            new FileField({
                name: "screenshots",
                maxSelect: 3,
                maxSize: 5 * 1024 * 1024,
                mimeTypes: ["image/png", "image/jpeg", "image/webp"],
                // Same treatment as post images: protected files are only
                // reachable with a short-lived file token.
                protected: true,
            }),
        );
        reports.fields.add(
            new RelationField({
                name: "conversation",
                maxSelect: 1,
                collectionId: conversations.id,
                // Optional attachment; deleting the chat must not delete the
                // report, so no cascade.
                cascadeDelete: false,
            }),
        );
        reports.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        reports.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );
        app.save(reports);
    },
    (app) => {
        try {
            app.delete(app.findCollectionByNameOrId("feedback_reports"));
        } catch {
            // already gone
        }
    },
);
