/// <reference path="../pb_data/types.d.ts" />

// Feature suggestions are shared between the two accounts (#40): the
// 「大家的建议」 list on `/feedback` shows every suggestion, while bug reports
// (which can contain screenshots, console output and a chat transcript from
// one person's session) stay owner-only.
//
// The auth guard is part of the rule on purpose: without it a list request
// with no token would still match `kind = "feature"` and expose suggestions
// (and their expanded authors) to anonymous callers. Create/update/delete
// remain owner-only, so only the author can edit or remove a suggestion.
migrate(
    (app) => {
        const reports = app.findCollectionByNameOrId("feedback_reports");
        reports.listRule =
            '@request.auth.id != "" && (kind = "feature" || owner = @request.auth.id)';
        reports.viewRule =
            '@request.auth.id != "" && (kind = "feature" || owner = @request.auth.id)';
        app.save(reports);
    },
    (app) => {
        try {
            const reports = app.findCollectionByNameOrId("feedback_reports");
            reports.listRule = "owner = @request.auth.id";
            reports.viewRule = "owner = @request.auth.id";
            app.save(reports);
        } catch {
            // collection already gone
        }
    },
);
