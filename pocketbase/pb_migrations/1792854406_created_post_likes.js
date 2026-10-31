/// <reference path="../pb_data/types.d.ts" />

// One row per user/post like.
migrate(
    (app) => {
        const collection = new Collection({
            name: "post_likes",
            type: "base",
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule:
                '@request.auth.id != "" && @request.body.user_id = @request.auth.id',
            updateRule: "user_id = @request.auth.id",
            deleteRule: "user_id = @request.auth.id",
            indexes: [
                "CREATE UNIQUE INDEX idx_post_likes_legacy_id ON `post_likes` (`legacy_id`) WHERE legacy_id != ''",
                "CREATE UNIQUE INDEX idx_post_likes_post_user ON `post_likes` (`post_id`, `user_id`)",
            ],
        });

        collection.fields.add(
            new RelationField({
                name: "post_id",
                collectionId: app.findCollectionByNameOrId("posts").id,
                required: true,
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        collection.fields.add(
            new RelationField({
                name: "user_id",
                collectionId: "_pb_users_auth_",
                required: true,
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
        app.delete(app.findCollectionByNameOrId("post_likes"));
    },
);
