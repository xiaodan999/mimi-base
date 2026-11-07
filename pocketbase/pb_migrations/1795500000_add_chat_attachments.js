/// <reference path="../pb_data/types.d.ts" />

// Original files the user attaches to a chat message (PDF, text, code). The
// bytes are stored once here; the relay (`/ai/files`) reads them back for
// extraction and the `read_attachment` tool re-reads them when the model needs
// more detail than the inline excerpt carried — so follow-up questions no
// longer depend on a one-shot lossy text dump.
//
// Rows are owner-scoped (chat is personal); deleting a conversation cascades,
// which also cleans up attachments that were picked but never sent.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId("users");
        const conversations =
            app.findCollectionByNameOrId("chat_conversations");
        const messages = app.findCollectionByNameOrId("chat_messages");

        const attachments = new Collection({
            name: "chat_attachments",
            type: "base",
            listRule: "owner = @request.auth.id",
            viewRule: "owner = @request.auth.id",
            createRule:
                '@request.auth.id != "" && @request.body.owner = @request.auth.id',
            updateRule: "owner = @request.auth.id",
            deleteRule: "owner = @request.auth.id",
            indexes: [
                "CREATE INDEX idx_chat_attachments_owner_conversation ON `chat_attachments` (`owner`, `conversation`)",
            ],
        });
        attachments.fields.add(
            new RelationField({
                name: "owner",
                required: true,
                maxSelect: 1,
                collectionId: users.id,
                cascadeDelete: true,
            }),
        );
        attachments.fields.add(
            new RelationField({
                name: "conversation",
                required: true,
                maxSelect: 1,
                collectionId: conversations.id,
                cascadeDelete: true,
            }),
        );
        // Filled when the message is actually sent; lets cascade deletes take
        // unsent picks with the conversation.
        attachments.fields.add(
            new RelationField({
                name: "message",
                maxSelect: 1,
                collectionId: messages.id,
                cascadeDelete: true,
            }),
        );
        attachments.fields.add(
            new TextField({ name: "name", required: true, max: 200 }),
        );
        attachments.fields.add(
            new TextField({ name: "mime", required: true, max: 80 }),
        );
        attachments.fields.add(
            new NumberField({ name: "size", onlyInt: true }),
        );
        attachments.fields.add(
            new SelectField({
                name: "kind",
                required: true,
                maxSelect: 1,
                values: ["pdf", "text"],
            }),
        );
        attachments.fields.add(
            new FileField({
                name: "file",
                required: true,
                maxSelect: 1,
                // Mirrors MAX_FILE_BYTES (the relay's upload cap).
                maxSize: 30 * 1024 * 1024,
                // No mime whitelist: browsers label the text extensions
                // inconsistently (octet-stream, video/mp2t for .ts, ...); the
                // allowlist is enforced in `lib/chat-files.ts` before create.
                thumbs: [],
                protected: true,
            }),
        );
        attachments.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        app.save(attachments);
    },
    (app) => {
        try {
            app.delete(app.findCollectionByNameOrId("chat_attachments"));
        } catch {
            // already gone
        }
    },
);
