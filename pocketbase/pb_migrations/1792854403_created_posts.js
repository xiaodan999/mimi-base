/// <reference path="../pb_data/types.d.ts" />

// Text posts shown on the "说说基地" feed.
migrate(
    (app) => {
        const collection = new Collection({
            name: "posts",
            type: "base",
            listRule: "",
            viewRule: "",
            createRule:
                '@request.auth.id != "" && @request.body.author_id = @request.auth.id',
            updateRule: "author_id = @request.auth.id",
            deleteRule: "author_id = @request.auth.id",
            indexes: [
                "CREATE UNIQUE INDEX idx_posts_legacy_id ON `posts` (`legacy_id`) WHERE legacy_id != ''",
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
            new NumberField({ name: "like_count", onlyInt: true }),
        );
        collection.fields.add(
            new NumberField({ name: "comment_count", onlyInt: true }),
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
        app.delete(app.findCollectionByNameOrId("posts"));
    },
);
