/// <reference path="../pb_data/types.d.ts" />

// Chat upgrades for the tool batch:
//
// - `chat_conversations.pinned` pins a conversation above the list.
// - `chat_memories` stores durable facts the chat model saved about the user
//   ("不吃香菜"). Rows are strictly owner-scoped — stricter than the shared
//   ledger/feed — and get injected into the system prompt on every run. The
//   server tool endpoint (`/ai/tools/memory`) also filters by owner; the rules
//   here are the backstop.
migrate(
    (app) => {
        const conversations =
            app.findCollectionByNameOrId("chat_conversations");
        conversations.fields.add(new BoolField({ name: "pinned" }));
        app.save(conversations);

        const users = app.findCollectionByNameOrId("users");
        const chat = app.findCollectionByNameOrId("chat_conversations");
        const memories = new Collection({
            name: "chat_memories",
            type: "base",
            listRule: "owner = @request.auth.id",
            viewRule: "owner = @request.auth.id",
            createRule:
                '@request.auth.id != "" && @request.body.owner = @request.auth.id',
            updateRule: "owner = @request.auth.id",
            deleteRule: "owner = @request.auth.id",
            indexes: [
                "CREATE INDEX idx_chat_memories_owner_updated ON `chat_memories` (`owner`, `updated`)",
            ],
        });
        memories.fields.add(
            new RelationField({
                name: "owner",
                required: true,
                maxSelect: 1,
                collectionId: users.id,
                cascadeDelete: true,
            }),
        );
        memories.fields.add(
            new TextField({ name: "content", required: true, max: 500 }),
        );
        memories.fields.add(
            new RelationField({
                name: "source_conversation",
                maxSelect: 1,
                collectionId: chat.id,
            }),
        );
        memories.fields.add(
            new AutodateField({ name: "created", onCreate: true }),
        );
        memories.fields.add(
            new AutodateField({
                name: "updated",
                onCreate: true,
                onUpdate: true,
            }),
        );
        app.save(memories);
    },
    (app) => {
        try {
            app.delete(app.findCollectionByNameOrId("chat_memories"));
        } catch {
            // already gone
        }
        const conversations =
            app.findCollectionByNameOrId("chat_conversations");
        conversations.fields.removeByName("pinned");
        app.save(conversations);
    },
);
