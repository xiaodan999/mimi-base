/// <reference path="../pb_data/types.d.ts" />

// Post thumbnails are now generated in the browser and uploaded next to the
// original, because PocketBase can only write JPEG/PNG thumbnails and its PNG
// thumbnail of a WebP upload is several times larger than the source.
//
// The two files are paired by name: "<token>_main.webp" and
// "<token>_thumbnail.webp". PocketBase keeps the base name and appends a
// random suffix, so the token survives the rename.
migrate(
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");

        // The server-side thumbs these fields used to generate are no longer
        // requested by the app, and generating them on every upload only costs
        // disk and CPU.
        posts.fields.getByName("images").thumbs = [];

        posts.fields.add(
            new FileField({
                name: "thumbs",
                maxSelect: 9,
                maxSize: 20 * 1024 * 1024,
                // Browsers always hand us WebP; JPEG covers the fallback for
                // browsers that cannot encode WebP.
                mimeTypes: ["image/webp", "image/jpeg"],
                thumbs: [],
                protected: true,
            }),
        );
        app.save(posts);
    },
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        posts.fields.removeByName("thumbs");
        posts.fields.getByName("images").thumbs = ["600x600", "1200x1200"];
        app.save(posts);
    },
);
