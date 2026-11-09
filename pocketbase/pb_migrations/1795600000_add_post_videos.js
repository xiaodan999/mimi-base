/// <reference path="../pb_data/types.d.ts" />

// 动态可以带一段视频（#47）。和照片一样，文件是 protected：只有带短期
// `?token=` 的请求能读取，未登录访问 `/api/files/...` 返回 404。
//
// 一条动态最多一个视频，且与照片二选一（朋友圈 / X / Instagram 的媒体
// 语义）。maxSelect 固定为 1；体积和类型在服务端再兜一层，客户端也会
// 先校验，避免选完 200MB 的文件才失败。
migrate(
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        posts.fields.add(
            new FileField({
                name: "videos",
                maxSelect: 1,
                maxSize: 50 * 1024 * 1024,
                mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
                // PocketBase 的图片缩略图不适用于视频；首帧由 <video> 在
                // 客户端按需解码，服务端不额外生成文件。
                thumbs: [],
                protected: true,
            }),
        );
        app.save(posts);
    },
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        posts.fields.removeByName("videos");
        app.save(posts);
    },
);
