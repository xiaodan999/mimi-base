/// <reference path="../pb_data/types.d.ts" />

/**
 * 帖子里的 like_count / comment_count 是冗余计数，只由本文件维护：
 *
 *  - 客户端不能直接写这两个字段（下面的 Request 钩子会强制覆盖输入）。
 *  - 新增点赞 / 评论用「一条原子 SQL」自增，取代旧的
 *    findRecordById -> getInt()+1 -> save 读改写，避免并发下丢 +1。
 *  - 删除时按来源表重新统计，而不是 -1：PocketBase 的级联删除走批量 SQL，
 *    不会为每一条被级联删掉的记录触发 record 钩子（删掉一条带回复的评论时，
 *    回复是一起被删的，只做 -1 会少减；删用户时级联到别人帖子上的赞/评论
 *    甚至一个钩子都不触发，只能靠下面的迁移兜底）。
 *  - 全量兜底：pocketbase/pb_migrations/1795000000_reconcile_post_counters.js。
 *
 * 注意：JSVM 的处理器里拿不到本文件顶层的辅助函数/常量，所以逻辑都写在
 * 各个 handler 内部。App.db() 会把非 SELECT 语句路由到串行连接池，单条
 * UPDATE 本身就是原子的，runInTransaction 把它绑在同一事务里。
 */

// ---------------------------------------------------------------------------
// 强制字段：拒绝客户端夹带的 like_count / comment_count。
// 0.40.6 的 hook 名是 onRecordCreateRequest / onRecordUpdateRequest
// （没有 onRecordBefore*Request 这一组），它们在保存前触发，改 e.record
// 即可覆盖请求体里的值。
//
// 这两个是「中间件」钩子：处理函数必须调用 e.next()，PocketBase 才会继续
// 真正的保存并写出响应。漏掉 e.next() 时请求会被直接结束成 200 + 空响应体
// ——客户端 SDK 把空体当成成功（于是弹出「发布成功」），但一行都没写进库。
// 2026-11-06 的「发布成功后动态不出现」就是漏了这一个调用。
// ---------------------------------------------------------------------------

// 新建帖子：计数一律从 0 开始，忽略请求体里可能夹带的值。
onRecordCreateRequest((e) => {
    e.record.set("like_count", 0);
    e.record.set("comment_count", 0);
    return e.next();
}, "posts");

// 编辑帖子：把两个计数恢复成数据库里的原值。作者即便 PATCH 成任意值，
// 保存时也会被这里的原值覆盖。findRecordById 读的是尚未保存的库内记录，
// 对一次更新请求而言它一定存在；万一读失败就让请求直接失败（不吞异常），
// 绝不把请求体里的假计数写进库，剩下的漂移由重算迁移兜底。
onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("posts", e.record.id);
    e.record.set("like_count", original.getInt("like_count"));
    e.record.set("comment_count", original.getInt("comment_count"));
    return e.next();
}, "posts");

// ---------------------------------------------------------------------------
// 新增点赞 / 评论：原子自增。{:id} 占位符用 bind 绑定，杜绝拼接注入。
// ---------------------------------------------------------------------------

onRecordAfterCreateSuccess((e) => {
    const postId = e.record.getString("post_id");
    e.app.runInTransaction((txApp) => {
        txApp
            .db()
            .newQuery(
                "UPDATE posts SET like_count = like_count + 1 WHERE id = {:id}",
            )
            .bind({ id: postId })
            .execute();
    });
}, "post_likes");

onRecordAfterCreateSuccess((e) => {
    const postId = e.record.getString("post_id");
    e.app.runInTransaction((txApp) => {
        txApp
            .db()
            .newQuery(
                "UPDATE posts SET comment_count = comment_count + 1 WHERE id = {:id}",
            )
            .bind({ id: postId })
            .execute();
    });
}, "comments");

// ---------------------------------------------------------------------------
// 删除点赞 / 评论：按来源表重算，而不是 -1。
// 级联删除（删评论带出回复、删帖子/删用户级联清掉赞与评论）常用批量 SQL，
// 不会逐条触发 record 钩子；只要顶层删除触发了本钩子，重算就能一次把被
// 级联删掉的所有行都算进去。完全不触发钩子的批量删除，则由重算迁移兜底。
// ---------------------------------------------------------------------------

onRecordAfterDeleteSuccess((e) => {
    const postId = e.record.getString("post_id");
    e.app.runInTransaction((txApp) => {
        txApp
            .db()
            .newQuery(
                "UPDATE posts SET like_count = " +
                    "(SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) " +
                    "WHERE id = {:id}",
            )
            .bind({ id: postId })
            .execute();
    });
}, "post_likes");

onRecordAfterDeleteSuccess((e) => {
    const postId = e.record.getString("post_id");
    e.app.runInTransaction((txApp) => {
        txApp
            .db()
            .newQuery(
                "UPDATE posts SET comment_count = " +
                    "(SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) " +
                    "WHERE id = {:id}",
            )
            .bind({ id: postId })
            .execute();
    });
}, "comments");
