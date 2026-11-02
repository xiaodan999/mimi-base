/// <reference path="../pb_data/types.d.ts" />

// Posts are private to signed-in users, and every uploaded file is served only
// with the short-lived `?token=` query (an <img> cannot send the auth header).
migrate(
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        posts.listRule = '@request.auth.id != ""';
        posts.viewRule = '@request.auth.id != ""';
        posts.fields.getByName("images").protected = true;
        app.save(posts);

        const users = app.findCollectionByNameOrId("_pb_users_auth_");
        users.fields.getByName("avatar").protected = true;
        users.fields.getByName("tou_xiang").protected = true;
        app.save(users);

        const circles = app.findCollectionByNameOrId("tou_xiang_circle");
        circles.fields.getByName("image").protected = true;
        app.save(circles);

        const photos = app.findCollectionByNameOrId("tu_pian_xin_xi");
        photos.fields.getByName("photo").protected = true;
        app.save(photos);
    },
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        posts.listRule = "";
        posts.viewRule = "";
        posts.fields.getByName("images").protected = false;
        app.save(posts);

        const users = app.findCollectionByNameOrId("_pb_users_auth_");
        users.fields.getByName("avatar").protected = false;
        users.fields.getByName("tou_xiang").protected = false;
        app.save(users);

        const circles = app.findCollectionByNameOrId("tou_xiang_circle");
        circles.fields.getByName("image").protected = false;
        app.save(circles);

        const photos = app.findCollectionByNameOrId("tu_pian_xin_xi");
        photos.fields.getByName("photo").protected = false;
        app.save(photos);
    },
);
