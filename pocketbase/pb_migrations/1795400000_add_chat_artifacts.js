/// <reference path="../pb_data/types.d.ts" />

// Binary artifacts the chat hands to the user (images produced or downloaded
// in the sandbox). The sandbox container is recreated for every request, so
// an image is returned once in the run response as base64; the client uploads
// it here immediately and the message part stores the record id + file name.
//
// Text/HTML/SVG artifacts stay in `chat_conversations.sandbox_files` — they
// cost no extra storage and are re-sent with each tool run. This collection is
// only for bytes the text snapshot cannot hold.
//
// Rows are owner-scoped (chat is personal); deleting a conversation cascades.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId("users");
        const conversations =
            app.findCollectionByNameOrId("chat_conversations");
        const messages = app.findCollectionByNameOrId("chat_messages");

        const artifacts = new Collection({
            name: "chat_artifacts",
            type: "base",
            listRule: "owner = @request.auth.id",
            viewRule: "owner = @request.auth.id",
            createRule:
                '@request.auth.id != "" && @request.body.owner = @request.auth.id',
            updateRule: "owner = @request.auth.id",
            deleteRule: "owner = @request.auth.id",
            indexes: [
                "CREATE INDEX idx_chat_artifacts_owner_conversation ON `chat_artifacts` (`owner`, `conversation`)",
            ],
        });
        artifacts.fields.add(
            new RelationField({
                name: "owner",
                required: true,
                maxSelect: 1,
                collectionId: users.id,
                cascadeDelete: true,
            }),
        );
        artifacts.fields.add(
            new RelationField({
                name: "conversation",
                required: true,
                maxSelect: 1,
                collectionId: conversations.id,
                cascadeDelete: true,
            }),
        );
        // The assistant message row exists before its tools run, so the upload
        // can link to it; regenerating/editing a message then takes its
        // images with it instead of leaving orphans.
        artifacts.fields.add(
            new RelationField({
                name: "message",
                maxSelect: 1,
                collectionId: messages.id,
                cascadeDelete: true,
            }),
        );
        artifacts.fields.add(
            new TextField({ name: "name", required: true, max: 200 }),
        );
        artifacts.fields.add(
            new TextField({ name: "mime", required: true, max: 80 }),
        );
        artifacts.fields.add(new NumberField({ name: "size", onlyInt: true }));
        artifacts.fields.add(new TextField({ name: "caption", max: 200 }));
        artifacts.fields.add(
            new FileField({
                name: "file",
                required: true,
                maxSelect: 1,
                // The protocol caps the decoded image at 1.5 MB; leave room
                // for PocketBase's upload handling.
                maxSize: 2 * 1024 * 1024,
                mimeTypes: [
                    "image/png",
                    "image/jpeg",
                    "image/webp",
                    "image/gif",
                ],
                thumbs: [],
                protected: true,
            }),
        );
        artifacts.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        app.save(artifacts);
    },
    (app) => {
        try {
            app.delete(app.findCollectionByNameOrId("chat_artifacts"));
        } catch {
            // already gone
        }
    },
);
