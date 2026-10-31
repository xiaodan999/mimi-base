/// <reference path="../pb_data/types.d.ts" />

// Avatar rings that users can pick for their profile picture.
migrate(
    (app) => {
        const collection = new Collection({
            name: "tou_xiang_circle",
            type: "base",
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            indexes: [
                "CREATE UNIQUE INDEX idx_tou_xiang_circle_legacy_id ON `tou_xiang_circle` (`legacy_id`) WHERE legacy_id != ''",
            ],
        });

        collection.fields.add(new TextField({ name: "name", required: true }));
        collection.fields.add(new TextField({ name: "description" }));
        collection.fields.add(
            new FileField({
                name: "image",
                required: true,
                maxSelect: 1,
                maxSize: 10 * 1024 * 1024,
                thumbs: ["200x200"],
            }),
        );
        collection.fields.add(new TextField({ name: "legacy_id" }));
        collection.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        collection.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );

        app.save(collection);
    },
    (app) => {
        app.delete(app.findCollectionByNameOrId("tou_xiang_circle"));
    },
);
