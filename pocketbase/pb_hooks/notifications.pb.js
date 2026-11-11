/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates in-app interaction notifications after likes and comments.
 *
 * Everything is inline in the handlers: the PocketBase JSVM does not expose
 * this file's top-level helpers/constants to hook callbacks. Notification
 * writes are best-effort: a failure here must never fail the like/comment that
 * triggered it, so each handler catches and logs errors.
 *
 * Types:
 *  - post_like       actor liked my post
 *  - comment_like    actor liked my comment
 *  - post_comment    actor commented on my post (top-level, or a reply when the
 *                    post author is not the parent comment's author)
 *  - comment_reply   actor replied to my comment
 */

// A like on a post notifies its author (never the liker themselves).
//
// `return e.next()` on every path: all record hooks run in one chain, so a
// handler that returns without it silently skips every later handler for the
// same event (here: the like_count update in post_counters.pb.js).
onRecordAfterCreateSuccess((e) => {
    try {
        const post = e.app.findRecordById(
            "posts",
            e.record.getString("post_id"),
        );
        const recipient = post.getString("author_id");
        const actor = e.record.getString("user_id");
        if (!recipient || recipient === actor) return e.next();

        let existing = null;
        try {
            existing = e.app.findFirstRecordByFilter(
                "notifications",
                "recipient = {:recipient} && actor = {:actor} && type = {:type} && post = {:post} && comment = {:comment}",
                {
                    recipient,
                    actor,
                    type: "post_like",
                    post: post.id,
                    comment: "",
                },
            );
        } catch {
            // not found
        }
        if (existing) return e.next();

        const collection = e.app.findCollectionByNameOrId("notifications");
        const notification = new Record(collection);
        notification.set("recipient", recipient);
        notification.set("actor", actor);
        notification.set("type", "post_like");
        notification.set("post", post.id);
        notification.set("read", false);
        e.app.save(notification);
    } catch (error) {
        console.error("notifications: post_like failed", error);
    }
    return e.next();
}, "post_likes");

// A like on a comment notifies the comment's author.
onRecordAfterCreateSuccess((e) => {
    try {
        const comment = e.app.findRecordById(
            "comments",
            e.record.getString("comment_id"),
        );
        const recipient = comment.getString("author_id");
        const actor = e.record.getString("user_id");
        if (!recipient || recipient === actor) return e.next();

        let existing = null;
        try {
            existing = e.app.findFirstRecordByFilter(
                "notifications",
                "recipient = {:recipient} && actor = {:actor} && type = {:type} && post = {:post} && comment = {:comment}",
                {
                    recipient,
                    actor,
                    type: "comment_like",
                    post: comment.getString("post_id"),
                    comment: comment.id,
                },
            );
        } catch {
            // not found
        }
        if (existing) return e.next();

        const collection = e.app.findCollectionByNameOrId("notifications");
        const notification = new Record(collection);
        notification.set("recipient", recipient);
        notification.set("actor", actor);
        notification.set("type", "comment_like");
        notification.set("post", comment.getString("post_id"));
        notification.set("comment", comment.id);
        notification.set("read", false);
        e.app.save(notification);
    } catch (error) {
        console.error("notifications: comment_like failed", error);
    }
    return e.next();
}, "comment_likes");

// A new comment notifies the post author; a reply also notifies the parent
// comment's author. When both are the same person, only the more specific
// reply notification is created.
onRecordAfterCreateSuccess((e) => {
    try {
        const actor = e.record.getString("author_id");
        const postId = e.record.getString("post_id");
        const commentId = e.record.id;
        const post = e.app.findRecordById("posts", postId);
        const postAuthor = post.getString("author_id");
        const parentId = e.record.getString("parent_id");

        let parentAuthor = "";
        if (parentId) {
            try {
                const parent = e.app.findRecordById("comments", parentId);
                parentAuthor = parent.getString("author_id");
            } catch {
                // The parent disappeared; treat this as a top-level comment.
            }
        }

        const targets = [];
        if (parentAuthor) {
            if (parentAuthor !== actor) {
                targets.push({
                    recipient: parentAuthor,
                    type: "comment_reply",
                });
            }
            if (
                postAuthor &&
                postAuthor !== actor &&
                postAuthor !== parentAuthor
            ) {
                targets.push({
                    recipient: postAuthor,
                    type: "post_comment",
                });
            }
        } else if (postAuthor && postAuthor !== actor) {
            targets.push({ recipient: postAuthor, type: "post_comment" });
        }

        for (const target of targets) {
            let existing = null;
            try {
                existing = e.app.findFirstRecordByFilter(
                    "notifications",
                    "recipient = {:recipient} && actor = {:actor} && type = {:type} && post = {:post} && comment = {:comment}",
                    {
                        recipient: target.recipient,
                        actor,
                        type: target.type,
                        post: postId,
                        comment: commentId,
                    },
                );
            } catch {
                // not found
            }
            if (existing) continue;

            const collection = e.app.findCollectionByNameOrId("notifications");
            const notification = new Record(collection);
            notification.set("recipient", target.recipient);
            notification.set("actor", actor);
            notification.set("type", target.type);
            notification.set("post", postId);
            notification.set("comment", commentId);
            notification.set("read", false);
            e.app.save(notification);
        }
    } catch (error) {
        console.error("notifications: comment failed", error);
    }
    return e.next();
}, "comments");

// Removing a like removes its notification, so an unlike never leaves a stale
// "liked your post" row behind.
onRecordAfterDeleteSuccess((e) => {
    try {
        e.app
            .db()
            .newQuery(
                "DELETE FROM notifications WHERE type = 'post_like' AND post = {:post} AND actor = {:actor}",
            )
            .bind({
                post: e.record.getString("post_id"),
                actor: e.record.getString("user_id"),
            })
            .execute();
    } catch (error) {
        console.error("notifications: post_like delete failed", error);
    }
    return e.next();
}, "post_likes");

onRecordAfterDeleteSuccess((e) => {
    try {
        e.app
            .db()
            .newQuery(
                "DELETE FROM notifications WHERE type = 'comment_like' AND comment = {:comment} AND actor = {:actor}",
            )
            .bind({
                comment: e.record.getString("comment_id"),
                actor: e.record.getString("user_id"),
            })
            .execute();
    } catch (error) {
        console.error("notifications: comment_like delete failed", error);
    }
    return e.next();
}, "comment_likes");

// Relation cascades should remove these too, but deleting the comment's own
// notifications here keeps stale rows out even if a database was created
// before the cascade was in place.
onRecordAfterDeleteSuccess((e) => {
    try {
        e.app
            .db()
            .newQuery("DELETE FROM notifications WHERE comment = {:comment}")
            .bind({ comment: e.record.id })
            .execute();
    } catch (error) {
        console.error("notifications: comment delete failed", error);
    }
    return e.next();
}, "comments");

// The recipient may only flip `read`; every event field is restored from the
// stored row before the request continues.
onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("notifications", e.record.id);
    for (const field of ["recipient", "actor", "type", "post", "comment"]) {
        e.record.set(field, original.getString(field));
    }
    return e.next();
}, "notifications");
