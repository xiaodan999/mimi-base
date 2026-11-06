// 独立测试：这不是 PocketBase hook（引擎只加载 *.pb.js），本文件 *.test.js
// 不会被 PocketBase 自动加载；即便被误加载，下面的 typeof Bun 判断也会让
// require 全部跳过，保持无害。
//
// 用 bun:sqlite 建最小库，直接执行 post_counters.pb.js 与重算迁移里用的 SQL，
// 验证：原子 +1、重算幂等、级联删除后重算能一次算全。
//
// 注意：bun run test = `bun test app lib`，只包含 app/ 与 lib/，不会跑到
// pocketbase/。本文件需手动执行：
//     bun test pocketbase/pb_hooks/post_counters.test.js
// 真正「并发下不丢 +1」与「级联删除是否触发 record 钩子」必须跑起来的
// PocketBase + 真实集合才能验证，纯 SQL 测试只能证明语句本身正确。

if (typeof Bun !== "undefined") {
    const { test, expect } = require("bun:test");
    const { Database } = require("bun:sqlite");

    const schema = (db) => {
        db.exec(
            "CREATE TABLE posts (id TEXT PRIMARY KEY, like_count INTEGER DEFAULT 0, comment_count INTEGER DEFAULT 0)",
        );
        db.exec(
            "CREATE TABLE post_likes (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT)",
        );
        db.exec(
            "CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT)",
        );
        db.exec("INSERT INTO posts (id) VALUES ('p1')");
    };

    const counts = (db) =>
        db
            .query(
                "SELECT like_count, comment_count FROM posts WHERE id = 'p1'",
            )
            .get();

    // 1795000000_reconcile_post_counters.js 里的全量重算 SQL。
    const reconcile = (db) =>
        db.exec(
            "UPDATE posts SET " +
                "like_count = (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id), " +
                "comment_count = (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id)",
        );

    test("原子 +1 自增 200 次不丢增量", () => {
        const db = new Database(":memory:");
        schema(db);
        const bump = db.prepare(
            "UPDATE posts SET like_count = like_count + 1 WHERE id = ?",
        );
        for (let i = 0; i < 200; i++) bump.run("p1");
        expect(counts(db).like_count).toBe(200);
        db.close();
    });

    test("重算迁移：修掉漂移且重复执行幂等", () => {
        const db = new Database(":memory:");
        schema(db);
        for (let i = 0; i < 3; i++)
            db.exec("INSERT INTO post_likes (post_id) VALUES ('p1')");
        for (let i = 0; i < 5; i++)
            db.exec("INSERT INTO comments (post_id) VALUES ('p1')");
        // 模拟历史漂移：客户端曾能 PATCH 成任意值
        db.exec(
            "UPDATE posts SET like_count = 999, comment_count = -7 WHERE id = 'p1'",
        );
        reconcile(db);
        expect(counts(db)).toEqual({ like_count: 3, comment_count: 5 });
        reconcile(db); // 再跑一次，结果不变
        expect(counts(db)).toEqual({ like_count: 3, comment_count: 5 });
        db.close();
    });

    test("级联删除后按来源表重算，一次算全被批量删掉的回复", () => {
        const db = new Database(":memory:");
        schema(db);
        // 顶层评论 + 3 条回复，旧 hook 会把 comment_count 累计到 4
        for (let i = 0; i < 4; i++)
            db.exec("INSERT INTO comments (post_id) VALUES ('p1')");
        db.exec("UPDATE posts SET comment_count = 4 WHERE id = 'p1'");
        // 批量删除模拟 PocketBase 级联删除（bulk SQL，不逐条触发 record 钩子）
        db.exec("DELETE FROM comments WHERE post_id = 'p1'");
        // post_counters.pb.js 删除钩子里的重算 SQL（-1 会少减，重算才对）
        db.exec(
            "UPDATE posts SET comment_count = " +
                "(SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) " +
                "WHERE id = 'p1'",
        );
        expect(counts(db).comment_count).toBe(0);
        db.close();
    });
}
