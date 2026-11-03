/// <reference path="../pb_data/types.d.ts" />

// Indexes for the filters used by the app's hottest queries:
// - feed likes: post_likes already has (post_id, user_id), added on creation
// - comments sheet: comments by post, in chronological order
// - expense list: one user's rows in a date range
// - feed page: global sort by created desc
migrate(
    (app) => {
        const addIndexes = (name, indexes) => {
            const collection = app.findCollectionByNameOrId(name);
            for (const index of indexes) {
                if (collection.indexes.indexOf(index) === -1) {
                    collection.indexes.push(index);
                }
            }
            app.save(collection);
        };

        addIndexes("comments", [
            "CREATE INDEX idx_comments_post_created ON `comments` (`post_id`, `created`)",
        ]);
        addIndexes("ji_zhang_biao", [
            "CREATE INDEX idx_ji_zhang_biao_user_created ON `ji_zhang_biao` (`user_id`, `created`)",
        ]);
        addIndexes("posts", [
            "CREATE INDEX idx_posts_created ON `posts` (`created` DESC)",
        ]);
    },
    (app) => {
        const removeIndexes = (name, prefix) => {
            const collection = app.findCollectionByNameOrId(name);
            collection.indexes = collection.indexes.filter(
                (index) => index.indexOf(prefix) !== 0,
            );
            app.save(collection);
        };

        removeIndexes("comments", "CREATE INDEX idx_comments_post_created");
        removeIndexes(
            "ji_zhang_biao",
            "CREATE INDEX idx_ji_zhang_biao_user_created",
        );
        removeIndexes("posts", "CREATE INDEX idx_posts_created");
    },
);
