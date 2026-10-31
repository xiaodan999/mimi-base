/// <reference path="../pb_data/types.d.ts" />

// Uploaded photos for the "照片基地" page.
migrate(
    (app) => {
        const collection = new Collection({
            name: "tu_pian_xin_xi",
            type: "base",
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule:
                '@request.auth.id != "" && @request.body.user_id = @request.auth.id',
            deleteRule: "user_id = @request.auth.id",
            indexes: [
                "CREATE UNIQUE INDEX idx_tu_pian_xin_xi_legacy_id ON `tu_pian_xin_xi` (`legacy_id`) WHERE legacy_id != ''",
            ],
        });

        collection.fields.add(
            new RelationField({
                name: "user_id",
                collectionId: "_pb_users_auth_",
                required: true,
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        collection.fields.add(
            new FileField({
                name: "photo",
                required: true,
                maxSelect: 1,
                maxSize: 20 * 1024 * 1024,
                thumbs: ["200x200"],
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
        app.delete(app.findCollectionByNameOrId("tu_pian_xin_xi"));
    },
);
