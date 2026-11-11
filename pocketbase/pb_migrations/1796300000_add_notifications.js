/// <reference path="../pb_data/types.d.ts" />

// In-app interaction notifications.
//
// Rows are created only by the server hooks in `pb_hooks/notifications.pb.js`
// (createRule stays null), and the recipient is the only account that can read
// or mark them. Relations cascade so deleting a post, comment, or account does
// not leave orphaned inbox rows behind.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId("users");
        const posts = app.findCollectionByNameOrId("posts");
        const comments = app.findCollectionByNameOrId("comments");

        const notifications = new Collection({
            name: "notifications",
            type: "base",
            listRule: "recipient = @request.auth.id",
            viewRule: "recipient = @request.auth.id",
            // Server hooks use the app context, not a request token, so no
            // client create rule is needed.
            createRule: null,
            updateRule: "recipient = @request.auth.id",
            deleteRule: null,
            indexes: [
                "CREATE INDEX idx_notifications_recipient_created ON `notifications` (`recipient`, `created`)",
                "CREATE INDEX idx_notifications_recipient_read ON `notifications` (`recipient`, `read`)",
                "CREATE INDEX idx_notifications_event ON `notifications` (`recipient`, `actor`, `type`, `post`, `comment`)",
            ],
        });

        notifications.fields.add(
            new RelationField({
                name: "recipient",
                collectionId: users.id,
                required: true,
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        notifications.fields.add(
            new RelationField({
                name: "actor",
                collectionId: users.id,
                required: true,
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        notifications.fields.add(
            new SelectField({
                name: "type",
                required: true,
                maxSelect: 1,
                values: [
                    "post_like",
                    "comment_like",
                    "post_comment",
                    "comment_reply",
                ],
            }),
        );
        notifications.fields.add(
            new RelationField({
                name: "post",
                collectionId: posts.id,
                required: true,
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        notifications.fields.add(
            new RelationField({
                name: "comment",
                collectionId: comments.id,
                maxSelect: 1,
                cascadeDelete: true,
            }),
        );
        notifications.fields.add(new BoolField({ name: "read" }));
        notifications.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        notifications.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );

        app.save(notifications);
    },
    (app) => {
        try {
            app.delete(app.findCollectionByNameOrId("notifications"));
        } catch {
            // already gone
        }
    },
);
