/// <reference path="../pb_data/types.d.ts" />

// Add the compact "twitter" post layout. Existing rows keep their current
// layout; the rollback folds any twitter rows back to moments before the
// select value is removed.
migrate(
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        const layout = posts.fields.getByName("layout");
        if (!layout) {
            throw new Error("posts.layout is missing");
        }
        layout.values = ["moments", "instagram", "twitter"];
        app.save(posts);
    },
    (app) => {
        app.db()
            .newQuery(
                "UPDATE posts SET layout = 'moments' WHERE layout = 'twitter'",
            )
            .execute();
        const posts = app.findCollectionByNameOrId("posts");
        const layout = posts.fields.getByName("layout");
        if (layout) {
            layout.values = ["moments", "instagram"];
            app.save(posts);
        }
    },
);
