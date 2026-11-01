/// <reference path="../pb_data/types.d.ts" />

// 学习基地：每个用户、每个科目一条进度记录。
// data 是一个 JSON 快照（掌握卡片 / 错题 / 模考记录 / 学习天数），
// 结构见 app/study/types.ts 的 Progress。
migrate(
    (app) => {
        const collection = new Collection({
            name: "study_progress",
            type: "base",
            listRule: "user_id = @request.auth.id",
            viewRule: "user_id = @request.auth.id",
            createRule:
                '@request.auth.id != "" && @request.body.user_id = @request.auth.id',
            updateRule: "user_id = @request.auth.id",
            deleteRule: "user_id = @request.auth.id",
            indexes: [
                "CREATE UNIQUE INDEX idx_study_progress_user_subject ON `study_progress` (`user_id`, `subject_id`)",
            ],
        });

        collection.fields.add(
            new TextField({ name: "subject_id", required: true }),
        );
        collection.fields.add(
            new JSONField({ name: "data", maxSize: 2000000 }),
        );
        collection.fields.add(
            new RelationField({
                name: "user_id",
                collectionId: "_pb_users_auth_",
                maxSelect: 1,
                required: true,
                cascadeDelete: true,
            }),
        );
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
        app.delete(app.findCollectionByNameOrId("study_progress"));
    },
);
