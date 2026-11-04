/// <reference path="../pb_data/types.d.ts" />

// `ji_zhang_biao` never had an updateRule, and PocketBase treats a null rule as
// "superusers only". So 补历史分类（PATCH category）always failed with
// "Only superusers can perform this action." Scope updates to the row owner,
// same as deleteRule.
migrate(
    (app) => {
        const collection = app.findCollectionByNameOrId("ji_zhang_biao");
        collection.updateRule = "user_id = @request.auth.id";
        app.save(collection);
    },
    (app) => {
        const collection = app.findCollectionByNameOrId("ji_zhang_biao");
        collection.updateRule = null;
        app.save(collection);
    },
);
