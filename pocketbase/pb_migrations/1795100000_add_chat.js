/// <reference path="../pb_data/types.d.ts" />

// General chat (`/chat`): private, synced conversation history.
//
// Every row is owner-scoped. Unlike the shared feed and ledger, chat is
// personal: a second account must never read another user's conversations,
// even though today the app has exactly two accounts.
//
// - `chat_conversations` holds the per-conversation settings. The persona is
//   *snapshotted* (`persona_name` / `persona_prompt`), so editing or deleting
//   a custom persona later never rewrites past chats. `sandbox_files` is the
//   conversation's virtual sandbox filesystem (path -> text), written by the
//   client after tool runs.
// - `chat_messages` stores assistant-ui content parts as JSON. `seq` gives a
//   deterministic order inside a conversation (`created` can tie), and the
//   plain `content` copy is there for previews/search.
// - `chat_personas` holds the user's custom personas; the built-ins live in
//   `app/chat/personas.ts`.
migrate(
    (app) => {
        const users = app.findCollectionByNameOrId("users");
        const owner = () =>
            new RelationField({
                name: "owner",
                required: true,
                maxSelect: 1,
                collectionId: users.id,
                cascadeDelete: true,
            });

        const conversations = new Collection({
            name: "chat_conversations",
            type: "base",
            listRule: "owner = @request.auth.id",
            viewRule: "owner = @request.auth.id",
            createRule:
                '@request.auth.id != "" && @request.body.owner = @request.auth.id',
            updateRule: "owner = @request.auth.id",
            deleteRule: "owner = @request.auth.id",
            indexes: [
                "CREATE INDEX idx_chat_conversations_owner_updated ON `chat_conversations` (`owner`, `updated`)",
            ],
        });
        conversations.fields.add(owner());
        conversations.fields.add(
            new TextField({ name: "title", required: true, max: 120 }),
        );
        conversations.fields.add(
            new TextField({ name: "model", required: true, max: 64 }),
        );
        conversations.fields.add(
            new TextField({ name: "persona_id", max: 80 }),
        );
        conversations.fields.add(
            new TextField({ name: "persona_name", max: 60 }),
        );
        conversations.fields.add(new TextField({ name: "persona_prompt" }));
        conversations.fields.add(
            new TextField({ name: "last_message", max: 200 }),
        );
        conversations.fields.add(
            new JSONField({ name: "sandbox_files", maxSize: 1000000 }),
        );
        conversations.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        conversations.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );
        app.save(conversations);

        const conversationCollection =
            app.findCollectionByNameOrId("chat_conversations");
        const messages = new Collection({
            name: "chat_messages",
            type: "base",
            listRule: "owner = @request.auth.id",
            viewRule: "owner = @request.auth.id",
            createRule:
                '@request.auth.id != "" && @request.body.owner = @request.auth.id',
            updateRule: "owner = @request.auth.id",
            deleteRule: "owner = @request.auth.id",
            indexes: [
                "CREATE INDEX idx_chat_messages_conversation_seq ON `chat_messages` (`conversation`, `seq`)",
                "CREATE INDEX idx_chat_messages_owner ON `chat_messages` (`owner`)",
            ],
        });
        messages.fields.add(owner());
        messages.fields.add(
            new RelationField({
                name: "conversation",
                required: true,
                maxSelect: 1,
                collectionId: conversationCollection.id,
                cascadeDelete: true,
            }),
        );
        messages.fields.add(
            new SelectField({
                name: "role",
                required: true,
                maxSelect: 1,
                values: ["user", "assistant"],
            }),
        );
        messages.fields.add(
            new SelectField({
                name: "status",
                maxSelect: 1,
                values: ["complete", "stopped", "error"],
            }),
        );
        messages.fields.add(new JSONField({ name: "parts", maxSize: 5000000 }));
        messages.fields.add(new TextField({ name: "content" }));
        messages.fields.add(new TextField({ name: "error", max: 300 }));
        messages.fields.add(new TextField({ name: "model", max: 64 }));
        messages.fields.add(new NumberField({ name: "seq", onlyInt: true }));
        messages.fields.add(new JSONField({ name: "usage", maxSize: 2000 }));
        messages.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        messages.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );
        app.save(messages);

        const personas = new Collection({
            name: "chat_personas",
            type: "base",
            listRule: "owner = @request.auth.id",
            viewRule: "owner = @request.auth.id",
            createRule:
                '@request.auth.id != "" && @request.body.owner = @request.auth.id',
            updateRule: "owner = @request.auth.id",
            deleteRule: "owner = @request.auth.id",
            indexes: [
                "CREATE INDEX idx_chat_personas_owner_updated ON `chat_personas` (`owner`, `updated`)",
            ],
        });
        personas.fields.add(owner());
        personas.fields.add(
            new TextField({ name: "name", required: true, max: 40 }),
        );
        personas.fields.add(new TextField({ name: "prompt", required: true }));
        personas.fields.add(new TextField({ name: "icon", max: 16 }));
        personas.fields.add(new TextField({ name: "description", max: 120 }));
        personas.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        personas.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );
        app.save(personas);
    },
    (app) => {
        for (const name of [
            "chat_messages",
            "chat_conversations",
            "chat_personas",
        ]) {
            try {
                app.delete(app.findCollectionByNameOrId(name));
            } catch {
                // already gone
            }
        }
    },
);
