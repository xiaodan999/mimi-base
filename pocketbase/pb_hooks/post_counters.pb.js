/// <reference path="../pb_data/types.d.ts" />
onRecordAfterCreateSuccess((e) => {
    console.log("L1 handler entered, post_id =", e.record.getString("post_id"))
    try {
        e.app.runInTransaction((txApp) => {
            console.log("L2 in tx, txApp =", typeof txApp)
            const post = txApp.findRecordById("posts", e.record.getString("post_id"))
            console.log("L3 found post", post.id, "like_count =", post.getInt("like_count"))
            post.set("like_count", post.getInt("like_count") + 1)
            txApp.save(post)
            console.log("L4 saved")
        })
        console.log("L5 tx done")
    } catch (err) {
        console.error("LIKE BUMP FAILED:", err)
    }
}, "post_likes")

onRecordAfterDeleteSuccess((e) => {
    try {
        e.app.runInTransaction((txApp) => {
            const post = txApp.findRecordById("posts", e.record.getString("post_id"))
            post.set("like_count", post.getInt("like_count") - 1)
            txApp.save(post)
        })
    } catch (err) {
        console.error("post_counters: like delete bump failed:", err)
    }
}, "post_likes")

onRecordAfterCreateSuccess((e) => {
    try {
        e.app.runInTransaction((txApp) => {
            const post = txApp.findRecordById("posts", e.record.getString("post_id"))
            post.set("comment_count", post.getInt("comment_count") + 1)
            txApp.save(post)
        })
    } catch (err) {
        console.error("post_counters: comment create bump failed:", err)
    }
}, "comments")

onRecordAfterDeleteSuccess((e) => {
    try {
        e.app.runInTransaction((txApp) => {
            const post = txApp.findRecordById("posts", e.record.getString("post_id"))
            post.set("comment_count", post.getInt("comment_count") - 1)
            txApp.save(post)
        })
    } catch (err) {
        console.error("post_counters: comment delete bump failed:", err)
    }
}, "comments")
