/// <reference path="../pb_data/types.d.ts" />

// The couple's shared 晚餐抽奖机 menu.
//
// Scope: auth-only (list/view/create/update/delete all require a signed-in
// user), matching the shared feed and ledger. Both partners manage the same
// wheel from any device, which is the point of the feature. Sign-up stays
// locked, so only the two existing accounts can reach it. If a third account
// is ever introduced, decide and migrate this scope before that happens.
//
// Rows are seeded from the old hardcoded list by the client the first time
// the collection is empty; the unique name index keeps two phones opening the
// wheel at the same time from creating duplicates.
migrate(
    (app) => {
        const options = new Collection({
            name: "dinner_options",
            type: "base",
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule: '@request.auth.id != ""',
            updateRule: '@request.auth.id != ""',
            deleteRule: '@request.auth.id != ""',
            indexes: [
                "CREATE UNIQUE INDEX idx_dinner_options_name ON `dinner_options` (`name`)",
                "CREATE INDEX idx_dinner_options_created ON `dinner_options` (`created`)",
            ],
        });
        options.fields.add(
            new TextField({ name: "name", required: true, max: 24 }),
        );
        options.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        options.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );
        app.save(options);
    },
    (app) => {
        try {
            app.delete(app.findCollectionByNameOrId("dinner_options"));
        } catch {
            // already gone
        }
    },
);
