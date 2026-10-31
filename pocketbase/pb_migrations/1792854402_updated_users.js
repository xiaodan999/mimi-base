/// <reference path="../pb_data/types.d.ts" />

// Profile fields added on top of PocketBase's built-in users collection.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId("_pb_users_auth_");

        users.fields.add(new TextField({ name: "user_name", required: true }));
        users.fields.add(
            new FileField({
                name: "tou_xiang",
                maxSelect: 1,
                maxSize: 10 * 1024 * 1024,
                thumbs: ["200x200"],
            }),
        );
        users.fields.add(
            new RelationField({
                name: "circle",
                collectionId:
                    app.findCollectionByNameOrId("tou_xiang_circle").id,
                maxSelect: 1,
            }),
        );
        users.fields.add(new TextField({ name: "legacy_id" }));

        users.indexes = [
            ...users.indexes,
            "CREATE UNIQUE INDEX idx_users_legacy_id ON `users` (`legacy_id`) WHERE legacy_id != ''",
        ];

        app.save(users);
    },
    (app) => {
        const users = app.findCollectionByNameOrId("_pb_users_auth_");

        users.fields.removeByName("user_name");
        users.fields.removeByName("tou_xiang");
        users.fields.removeByName("circle");
        users.fields.removeByName("legacy_id");
        users.indexes = users.indexes.filter(
            (index) => !index.includes("idx_users_legacy_id"),
        );

        app.save(users);
    },
);
