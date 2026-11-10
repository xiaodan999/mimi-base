/// <reference path="../pb_data/types.d.ts" />

// Store the intrinsic media size so the feed can reserve the real box before
// the protected file loads. Without it the tweet layout starts at a 4:3 (or
// 16:9 video) placeholder and jumps when the image/video reports its natural
// size, which is the layout shift seen on first load.
//
// The JSON is positional:
//   { "images": [{ "width": 1600, "height": 900 }, null, ...],
//     "video": { "width": 1280, "height": 720 } }
// `images` follows the stored `images` order (kept files first, then new
// uploads, matching how the composer builds the multipart payload). `null`
// keeps the position of an old photo whose size was never recorded.
migrate(
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        posts.fields.add(new JSONField({ name: "media_meta", maxSize: 20000 }));
        app.save(posts);
    },
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        posts.fields.removeByName("media_meta");
        app.save(posts);
    },
);
