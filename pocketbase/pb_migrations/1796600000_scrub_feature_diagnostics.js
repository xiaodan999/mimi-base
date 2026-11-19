/// <reference path="../pb_data/types.d.ts" />

// Feature suggestions are shared with the other account (see
// 1795800000_share_feature_feedback.js). Rows created before the ownership
// hook may still carry one person's chat id, console ring buffer or user
// agent; those diagnostics belong to owner-only bug reports.
migrate(
    (app) => {
        app.db()
            .newQuery(
                "UPDATE feedback_reports SET route = '', user_agent = '', console = '[]', conversation = '' WHERE kind = 'feature'",
            )
            .execute();
    },
    (_app) => {
        // Not reversible: the diagnostics were intentionally removed.
    },
);
