/// <reference path="../pb_data/types.d.ts" />

// Avatar rings: built-in presets live in the frontend, custom uploads live in
// `tou_xiang_circle`. `circle_preset` stores the preset key ("none" hides the
// ring), while `users.circle` keeps pointing at an uploaded ring record.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId("users");
        users.fields.add(new TextField({ name: "circle_preset", max: 32 }));
        app.save(users);

        const circles = app.findCollectionByNameOrId("tou_xiang_circle");
        circles.fields.add(
            new RelationField({
                name: "owner",
                required: false,
                maxSelect: 1,
                collectionId: users.id,
                cascadeDelete: false,
            }),
        );
        // Users may upload rings for themselves only; existing admin-made
        // rings stay readable for everyone.
        circles.createRule =
            '@request.auth.id != "" && @request.body.owner = @request.auth.id';
        circles.updateRule = "owner = @request.auth.id";
        circles.deleteRule = "owner = @request.auth.id";
        app.save(circles);
    },
    (app) => {
        const circles = app.findCollectionByNameOrId("tou_xiang_circle");
        circles.createRule = null;
        circles.updateRule = null;
        circles.deleteRule = null;
        circles.fields.removeByName("owner");
        app.save(circles);

        const users = app.findCollectionByNameOrId("users");
        users.fields.removeByName("circle_preset");
        app.save(users);
    },
);
