/// <reference path="../pb_data/types.d.ts" />

// Expense records for the "记账基地" page.
migrate(
    (app) => {
        const collection = new Collection({
            name: "ji_zhang_biao",
            type: "base",
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule:
                '@request.auth.id != "" && @request.body.user_id = @request.auth.id',
            deleteRule: "user_id = @request.auth.id",
            indexes: [
                "CREATE UNIQUE INDEX idx_ji_zhang_biao_legacy_id ON `ji_zhang_biao` (`legacy_id`) WHERE legacy_id != ''",
            ],
        });

        collection.fields.add(new TextField({ name: "item_name" }));
        collection.fields.add(new NumberField({ name: "price" }));
        collection.fields.add(
            new RelationField({
                name: "user_id",
                collectionId: "_pb_users_auth_",
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        collection.fields.add(new TextField({ name: "legacy_id" }));
        collection.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        collection.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );

        app.save(collection);
    },
    (app) => {
        app.delete(app.findCollectionByNameOrId("ji_zhang_biao"));
    },
);
