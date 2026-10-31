/// <reference path="../pb_data/types.d.ts" />

// Threaded replies: a comment can point at another comment.
migrate(
    (app) => {
        const comments = app.findCollectionByNameOrId("comments");

        comments.fields.add(
            new RelationField({
                name: "parent_id",
                collectionId: comments.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );

        app.save(comments);
    },
    (app) => {
        const comments = app.findCollectionByNameOrId("comments");

        comments.fields.removeByName("parent_id");

        app.save(comments);
    },
);
