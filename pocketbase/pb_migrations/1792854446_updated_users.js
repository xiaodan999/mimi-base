/// <reference path="../pb_data/types.d.ts" />

// Let signed-in users list and view each other, but keep sign-up admin-only.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId("_pb_users_auth_");

        users.listRule = '@request.auth.id != ""';
        users.viewRule = '@request.auth.id != ""';
        users.createRule = null;
        users.deleteRule = null;

        app.save(users);
    },
    (app) => {
        const users = app.findCollectionByNameOrId("_pb_users_auth_");

        users.listRule = "id = @request.auth.id";
        users.viewRule = "id = @request.auth.id";
        users.createRule = "";
        users.deleteRule = "id = @request.auth.id";

        app.save(users);
    },
);
