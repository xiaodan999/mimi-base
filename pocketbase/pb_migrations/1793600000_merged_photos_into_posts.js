/// <reference path="../pb_data/types.d.ts" />

// Merge the standalone photo feed (`tu_pian_xin_xi`) into `posts`.
//
// A post now carries 0-9 images and picks its own feed layout, so the old
// "照片基地" page can go away without losing the uploaded photos.
migrate(
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");

        // Posts may be text-only, image-only, or both.
        posts.fields.getByName("text").required = false;

        posts.fields.add(
            new FileField({
                name: "images",
                maxSelect: 9,
                maxSize: 20 * 1024 * 1024,
                mimeTypes: [
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                    "image/gif",
                    "image/avif",
                    "image/heic",
                    "image/heif",
                ],
                thumbs: ["600x600", "1200x1200"],
            }),
        );
        posts.fields.add(
            new SelectField({
                name: "layout",
                maxSelect: 1,
                values: ["moments", "instagram"],
            }),
        );
        // Internal marker so the rollback can remove only migrated rows.
        posts.fields.add(new TextField({ name: "photo_migrated_from" }));

        app.save(posts);

        // Copy every legacy photo into its own post, preserving timestamps.
        const photos = app.findCollectionByNameOrId("tu_pian_xin_xi");
        const rows = app.findRecordsByFilter(
            "tu_pian_xin_xi",
            "id != ''",
            "created",
            0,
            0,
        );

        let migrated = 0;
        for (const row of rows) {
            const filename = row.getString("photo");
            if (!filename) continue;

            // PocketBase stores files at storage/<collectionId>/<recordId>/.
            const source = $filepath.join(
                app.dataDir(),
                "storage",
                photos.id,
                row.id,
                filename,
            );

            try {
                const post = new Record(posts, {
                    text: "",
                    author_id: row.getString("user_id"),
                    layout: "moments",
                    photo_migrated_from: row.id,
                });
                post.set("images", [$filesystem.fileFromPath(source)]);
                app.save(post);

                // Autodate fields may overwrite the value on create, so pin
                // the original timestamp with raw SQL afterwards.
                const created = row.getString("created");
                app.db()
                    .newQuery(
                        "UPDATE posts SET created = {:created}, updated = {:created} WHERE id = {:id}",
                    )
                    .bind({ created, id: post.id })
                    .execute();
                migrated += 1;
            } catch (error) {
                console.log("Failed to migrate photo " + row.id + ": " + error);
            }
        }

        console.log("Merged " + migrated + " photo(s) into posts.");
    },
    (app) => {
        // Remove only the posts created by this migration.
        app.db()
            .newQuery("DELETE FROM posts WHERE photo_migrated_from != ''")
            .execute();

        const posts = app.findCollectionByNameOrId("posts");
        posts.fields.removeByName("images");
        posts.fields.removeByName("layout");
        posts.fields.removeByName("photo_migrated_from");
        posts.fields.getByName("text").required = true;
        app.save(posts);
    },
);
