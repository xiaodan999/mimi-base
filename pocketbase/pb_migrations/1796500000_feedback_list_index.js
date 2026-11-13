/// <reference path="../pb_data/types.d.ts" />

// Index for the paged feedback lists.
//
// `/feedback` no longer loads every report in one `getFullList`: both lists
// page 20 rows at a time and need `totalItems` for their counters. The owner
// list keeps using `(owner, created)` from the original migration (the filter
// is `owner = X && kind = "bug"`, so the owner index still drives it), while
// 「大家的建议」 filters on `kind` alone. Without this index that query sorts
// the whole collection for every page.
migrate(
    (app) => {
        const reports = app.findCollectionByNameOrId("feedback_reports");
        reports.indexes = [
            ...reports.indexes,
            "CREATE INDEX idx_feedback_reports_kind_created ON `feedback_reports` (`kind`, `created`)",
        ];
        app.save(reports);
    },
    (app) => {
        try {
            const reports = app.findCollectionByNameOrId("feedback_reports");
            reports.indexes = reports.indexes.filter(
                (index) => !index.includes("idx_feedback_reports_kind_created"),
            );
            app.save(reports);
        } catch {
            // collection already gone
        }
    },
);
