/// <reference path="../pb_data/types.d.ts" />

// Optional category for expense rows, used by the jizhang summary and list.
// Existing rows stay empty ("其他" in the UI); new rows pick a chip in the
// add form, which sends one of these values.
migrate(
    (app) => {
        const collection = app.findCollectionByNameOrId("ji_zhang_biao");
        if (!collection.fields.getByName("category")) {
            collection.fields.add(
                new SelectField({
                    name: "category",
                    maxSelect: 1,
                    values: [
                        "food",
                        "transport",
                        "shopping",
                        "home",
                        "fun",
                        "health",
                        "other",
                    ],
                }),
            );
        }
        app.save(collection);
    },
    (app) => {
        const collection = app.findCollectionByNameOrId("ji_zhang_biao");
        collection.fields.removeByName("category");
        app.save(collection);
    },
);
