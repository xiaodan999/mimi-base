/// <reference path="../pb_data/types.d.ts" />

// Per-conversation thinking level: "" (provider default), "low", "high" or
// "max". Kept on the conversation so the next message keeps the same effort;
// the relay validates it against the model's capability list.
migrate(
    (app) => {
        const conversations =
            app.findCollectionByNameOrId("chat_conversations");
        conversations.fields.add(new TextField({ name: "thinking", max: 8 }));
        app.save(conversations);
    },
    (app) => {
        const conversations =
            app.findCollectionByNameOrId("chat_conversations");
        conversations.fields.removeByName("thinking");
        app.save(conversations);
    },
);
