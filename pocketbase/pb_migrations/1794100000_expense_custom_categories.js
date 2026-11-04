/// <reference path="../pb_data/types.d.ts" />

// Expenses used to be limited to the seven categories baked into the select
// field. Users can now define their own, so `category` becomes free text: it
// stores either a built-in key ("food", …) or the id of a `ji_zhang_category`
// row. `ji_zhang_category.name` is the label and `icon` a frontend icon key.
//
// PocketBase refuses field type changes, and removing the select drops its
// column, so the up migration stashes the values first and restores them after
// the column is recreated. Verified against a copy of history: values survive.
migrate(
    (app) => {
        app.db()
            .newQuery(
                "CREATE TABLE _expense_category_backup AS SELECT id, category FROM ji_zhang_biao",
            )
            .execute();

        const expenses = app.findCollectionByNameOrId("ji_zhang_biao");
        expenses.fields.removeByName("category");
        expenses.fields.add(new TextField({ name: "category" }));
        app.save(expenses);

        app.db()
            .newQuery(
                "UPDATE ji_zhang_biao SET category = COALESCE((SELECT category FROM _expense_category_backup WHERE _expense_category_backup.id = ji_zhang_biao.id), '')",
            )
            .execute();
        app.db().newQuery("DROP TABLE _expense_category_backup").execute();

        const categories = new Collection({
            name: "ji_zhang_category",
            type: "base",
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule:
                '@request.auth.id != "" && @request.body.user_id = @request.auth.id',
            updateRule: "user_id = @request.auth.id",
            deleteRule: "user_id = @request.auth.id",
            indexes: [
                "CREATE UNIQUE INDEX idx_ji_zhang_category_user_name ON `ji_zhang_category` (`user_id`, `name`)",
            ],
        });
        categories.fields.add(
            new TextField({ name: "name", required: true, max: 16 }),
        );
        categories.fields.add(new TextField({ name: "icon", max: 32 }));
        categories.fields.add(
            new RelationField({
                name: "user_id",
                collectionId: "_pb_users_auth_",
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        categories.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        categories.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );

        app.save(categories);
    },
    (app) => {
        app.delete(app.findCollectionByNameOrId("ji_zhang_category"));

        // Custom categories can't be represented by the select; their rows
        // fall back to 未分类 so 补全分类 can pick them up again.
        app.db()
            .newQuery(
                "CREATE TABLE _expense_category_backup AS SELECT id, category FROM ji_zhang_biao",
            )
            .execute();

        const expenses = app.findCollectionByNameOrId("ji_zhang_biao");
        expenses.fields.removeByName("category");
        expenses.fields.add(
            new SelectField({
                name: "category",
                maxSelect: 1,
                values: [
                    "food",
                    "transport",
                    "shopping",
                    "home",
                    "fun",
                    "health",
                    "other",
                ],
            }),
        );
        app.save(expenses);

        app.db()
            .newQuery(
                "UPDATE ji_zhang_biao SET category = COALESCE((SELECT CASE WHEN category IN ('food', 'transport', 'shopping', 'home', 'fun', 'health', 'other') THEN category ELSE '' END FROM _expense_category_backup WHERE _expense_category_backup.id = ji_zhang_biao.id), '')",
            )
            .execute();
        app.db().newQuery("DROP TABLE _expense_category_backup").execute();
    },
);
