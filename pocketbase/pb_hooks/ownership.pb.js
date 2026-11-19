/// <reference path="../pb_data/types.d.ts" />

/**
 * Ownership and server-field guards.
 *
 * PocketBase evaluates an update rule against the record **before** the
 * update, so `owner = @request.auth.id` alone lets a client PATCH `owner` to
 * the other account. The same applies to `author_id` / `user_id` and to
 * `chat_messages.conversation`. These hooks restore the immutable fields from
 * the stored row before the save.
 *
 * `feedback_reports.status` / `issue_*` are written by the Bun API with the
 * superuser token after it creates an issue; a normal client may never set
 * them (that would let one account forge a "查看 Issue" link in the shared
 * suggestions list or mark another row as verified).
 *
 * Every handler must keep the chain alive with `e.next()`.
 */

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("posts", e.record.id);
    e.record.set("author_id", original.getString("author_id"));
    return e.next();
}, "posts");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("comments", e.record.id);
    e.record.set("author_id", original.getString("author_id"));
    e.record.set("post_id", original.getString("post_id"));
    return e.next();
}, "comments");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("post_likes", e.record.id);
    e.record.set("user_id", original.getString("user_id"));
    e.record.set("post_id", original.getString("post_id"));
    return e.next();
}, "post_likes");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("comment_likes", e.record.id);
    e.record.set("user_id", original.getString("user_id"));
    e.record.set("comment_id", original.getString("comment_id"));
    return e.next();
}, "comment_likes");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("ji_zhang_biao", e.record.id);
    e.record.set("user_id", original.getString("user_id"));
    return e.next();
}, "ji_zhang_biao");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("ji_zhang_category", e.record.id);
    e.record.set("user_id", original.getString("user_id"));
    return e.next();
}, "ji_zhang_category");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("study_progress", e.record.id);
    e.record.set("user_id", original.getString("user_id"));
    e.record.set("subject_id", original.getString("subject_id"));
    return e.next();
}, "study_progress");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("tou_xiang_circle", e.record.id);
    e.record.set("owner", original.getString("owner"));
    return e.next();
}, "tou_xiang_circle");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("chat_conversations", e.record.id);
    e.record.set("owner", original.getString("owner"));
    return e.next();
}, "chat_conversations");

onRecordCreateRequest((e) => {
    const authId = e.auth && e.auth.id ? e.auth.id : "";
    const conversationId = e.record.getString("conversation");
    let conversation = null;
    try {
        conversation = e.app.findRecordById(
            "chat_conversations",
            conversationId,
        );
    } catch {
        throw new BadRequestError("对话不存在");
    }
    if (!authId || conversation.getString("owner") !== authId) {
        throw new ForbiddenError("不能写入别人的对话");
    }
    return e.next();
}, "chat_messages");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("chat_messages", e.record.id);
    e.record.set("owner", original.getString("owner"));
    e.record.set("conversation", original.getString("conversation"));
    return e.next();
}, "chat_messages");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("chat_personas", e.record.id);
    e.record.set("owner", original.getString("owner"));
    return e.next();
}, "chat_personas");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("chat_memories", e.record.id);
    e.record.set("owner", original.getString("owner"));
    e.record.set(
        "source_conversation",
        original.getString("source_conversation"),
    );
    return e.next();
}, "chat_memories");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("chat_artifacts", e.record.id);
    e.record.set("owner", original.getString("owner"));
    e.record.set("conversation", original.getString("conversation"));
    e.record.set("message", original.getString("message"));
    return e.next();
}, "chat_artifacts");

onRecordUpdateRequest((e) => {
    const original = e.app.findRecordById("chat_attachments", e.record.id);
    e.record.set("owner", original.getString("owner"));
    e.record.set("conversation", original.getString("conversation"));
    e.record.set("message", original.getString("message"));
    return e.next();
}, "chat_attachments");

onRecordCreateRequest((e) => {
    if (e.hasSuperuserAuth()) return e.next();
    e.record.set("status", "stored");
    e.record.set("issue_url", "");
    e.record.set("issue_number", 0);
    e.record.set("issue_state", "");
    e.record.set("issue_state_checked", "");
    e.record.set("error", "");
    return e.next();
}, "feedback_reports");

onRecordUpdateRequest((e) => {
    if (e.hasSuperuserAuth()) return e.next();
    const original = e.app.findRecordById("feedback_reports", e.record.id);
    e.record.set("owner", original.getString("owner"));
    for (const field of [
        "status",
        "issue_url",
        "issue_number",
        "issue_state",
        "issue_state_checked",
        "error",
    ]) {
        e.record.set(field, original.get(field));
    }
    return e.next();
}, "feedback_reports");
