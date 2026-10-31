/// <reference path="../pb_data/types.d.ts" />

// Comments on posts.
migrate(
    (app) => {
        const collection = new Collection({
            name: "comments",
            type: "base",
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule:
                '@request.auth.id != "" && @request.body.author_id = @request.auth.id',
            updateRule: "author_id = @request.auth.id",
            deleteRule: "author_id = @request.auth.id",
            indexes: [
                "CREATE UNIQUE INDEX idx_comments_legacy_id ON `comments` (`legacy_id`) WHERE legacy_id != ''",
            ],
        });

        collection.fields.add(new TextField({ name: "text", required: true }));
        collection.fields.add(
            new RelationField({
                name: "author_id",
                collectionId: "_pb_users_auth_",
                required: true,
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        collection.fields.add(
            new RelationField({
                name: "post_id",
                collectionId: app.findCollectionByNameOrId("posts").id,
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
        app.delete(app.findCollectionByNameOrId("comments"));
    },
);
