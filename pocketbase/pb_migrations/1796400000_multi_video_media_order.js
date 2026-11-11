/// <reference path="../pb_data/types.d.ts" />

// 图片和视频合并成一个可排序的媒体集合（#80）。
//
// 1. `posts.videos` 从 maxSelect 1 放宽到 9：一条动态最多 9 个媒体（图片 +
//    视频合计），每个视频仍是 50MB、MP4 / WebM / MOV。体积上限是单文件
//    的，9 个视频的总量由客户端先压缩、再逐个上传。
// 2. 新增 `posts.media_order`，按显示顺序列出最终存下的文件：
//      [{ "type": "image", "index": 0 },
//       { "type": "video", "index": 0 },
//       { "type": "image", "index": 1 }]
//    index 指向最终 `posts.images` / `posts.videos` 数组里的位置。旧数据没有
//    这个字段，读取时回退成「视频在前、照片在后」，渲染结果和以前一致。
//
// 迁移保持只增不改：不重命名、不删除旧字段，旧版本客户端仍能读写。
migrate(
    (app) => {
        const posts = app.findCollectionByNameOrId("posts");
        const videos = posts.fields.getByName("videos");
        if (videos) videos.maxSelect = 9;
        posts.fields.add(
            new JSONField({ name: "media_order", maxSize: 20000 }),
        );
        app.save(posts);
    },
    (app) => {
        // 回滚尽力而为：先删掉顺序字段，再把 videos 收回单文件。已经存了
        // 多个视频的行会让 maxSelect 的收紧在保存时被拒绝，这是预期的
        // 数据保护；回滚前应先处理这些行。
        const posts = app.findCollectionByNameOrId("posts");
        posts.fields.removeByName("media_order");
        const videos = posts.fields.getByName("videos");
        if (videos) videos.maxSelect = 1;
        app.save(posts);
    },
);
