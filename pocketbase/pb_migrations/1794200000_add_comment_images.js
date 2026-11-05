/// <reference path="../pb_data/types.d.ts" />

// Comments may carry images. Text becomes optional so an image-only comment
// works ("看看这个"), while the UI still requires text or at least one image.
migrate(
    (app) => {
        const comments = app.findCollectionByNameOrId("comments");
        comments.fields.getByName("text").required = false;
        comments.fields.add(
            new FileField({
                name: "images",
                maxSelect: 4,
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
                thumbs: ["400x400"],
                protected: true,
            }),
        );
        app.save(comments);
    },
    (app) => {
        const comments = app.findCollectionByNameOrId("comments");
        comments.fields.removeByName("images");
        comments.fields.getByName("text").required = true;
        app.save(comments);
    },
);
