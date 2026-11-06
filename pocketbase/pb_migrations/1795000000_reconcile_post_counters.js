/// <reference path="../pb_data/types.d.ts" />

// 把帖子的两个冗余计数按来源表全量重算一次，修掉历史漂移：
//  - 旧版 post_counters.pb.js 用读改写 + 吞异常，并发下丢过 +1；
//  - 级联删除（删评论带回复、删用户级联清掉赞/评论）走批量 SQL，
//    不触发 record 钩子，留下的计数偏高；
//  - 客户端以前能 PATCH like_count / comment_count 成任意值。
//
// 一条 UPDATE + 相关子查询完成，天然幂等：重复执行得到的结果完全一样，
// 没有 DDL、不删数据，随时重跑都安全。迁移本身由 PocketBase 包在事务里，
// 这里不要再开 runInTransaction，避免嵌套事务。
migrate(
    (app) => {
        app.db()
            .newQuery(
                "UPDATE posts SET " +
                    "like_count = (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id), " +
                    "comment_count = (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id)",
            )
            .execute();
        console.log(
            "reconcile_post_counters: 已按 post_likes / comments 重算 posts 计数",
        );
    },
    (app) => {
        // 纯数据校正，没有需要撤销的 schema；回滚不做破坏性操作。
        // up 幂等，需要时重新执行迁移即可再次重算。
    },
);
