/// <reference path="../pb_data/types.d.ts" />

// 反馈附件改为直接上传到 GitHub（#54）。
//
// 旧流程把截图存进 `feedback_reports.screenshots`（protected FileField），
// GitHub Issue 正文里只有文件名，开发者还得登录后台才能看图。现在客户端先
// 把附件传到 GitHub Release（`feedback-assets`，prerelease），再把
// `{ name, url, size, type }` 元数据存进新的 `attachments` JSONField，Issue
// 正文直接内嵌图片 / 链接文件。重新同步时读的也是这份元数据，不需要再碰
// 原始文件。
//
// 旧的截图文件没有其它读取入口，这里在删字段前清空每一行，让 PocketBase
// 把 storage 里的文件一并删掉；`attachments` 只存元数据，maxSize 100k 足够
// 三条 10MB 附件（名字 + URL + 类型）。
migrate(
    (app) => {
        const reports = app.findCollectionByNameOrId("feedback_reports");

        // Clearing the file field saves the record, which is what makes
        // PocketBase delete the stored files. Best effort per row: a single
        // unreadable row must not abort the schema change.
        const rows = app.findRecordsByFilter(
            "feedback_reports",
            "id != ''",
            "created",
            0,
            0,
        );
        for (const row of rows) {
            try {
                const files = row.get("screenshots");
                // A multi-file field is normally an array; tolerate a single
                // string too so old rows still release their stored files.
                const hasFiles = Array.isArray(files)
                    ? files.length > 0
                    : typeof files === "string" && files !== "";
                if (hasFiles) {
                    row.set("screenshots", []);
                    app.save(row);
                }
            } catch {
                // keep going; the field is removed below either way
            }
        }

        reports.fields.removeByName("screenshots");
        reports.fields.add(
            new JSONField({ name: "attachments", maxSize: 100000 }),
        );
        app.save(reports);
    },
    (app) => {
        const reports = app.findCollectionByNameOrId("feedback_reports");
        reports.fields.removeByName("attachments");
        reports.fields.add(
            new FileField({
                name: "screenshots",
                maxSelect: 3,
                maxSize: 5 * 1024 * 1024,
                mimeTypes: ["image/png", "image/jpeg", "image/webp"],
                protected: true,
            }),
        );
        app.save(reports);
    },
);
