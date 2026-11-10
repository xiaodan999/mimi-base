/// <reference path="../pb_data/types.d.ts" />

// Remember the GitHub issue state on the report row.
//
// `status = issue_created` only says an issue exists; GitHub owns the
// open/closed state. The supervisor used to read it live on every visit and
// never persisted it, so the badge needed an extra round trip and forgot
// everything after a restart or a GitHub outage. Now the last known state is
// written back here, which lets the list paint「已关闭」immediately.
//
// Closed is terminal: once the supervisor has seen an issue closed it stops
// asking GitHub for that report (see `handleIssueStates`). Reopening an issue
// on GitHub therefore does not flip the badge back. `issue_state_checked` is
// kept for ops/debugging (when GitHub last confirmed the value).
migrate(
    (app) => {
        const reports = app.findCollectionByNameOrId("feedback_reports");
        reports.fields.add(
            new SelectField({
                name: "issue_state",
                maxSelect: 1,
                values: ["open", "closed"],
            }),
        );
        reports.fields.add(new DateField({ name: "issue_state_checked" }));
        app.save(reports);
    },
    (app) => {
        try {
            const reports = app.findCollectionByNameOrId("feedback_reports");
            reports.fields.removeByName("issue_state");
            reports.fields.removeByName("issue_state_checked");
            app.save(reports);
        } catch {
            // collection already gone
        }
    },
);
