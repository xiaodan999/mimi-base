/// <reference path="../pb_data/types.d.ts" />

// Dev-only test account, created on startup when it is missing.
// server.ts sets MIMI_DEV=1 only in dev (i.e. when .env.prod is absent), so
// the deployed server never creates this account.
onBootstrap((e) => {
    e.next();

    if ($os.getenv("MIMI_DEV") !== "1") return;

    const email = "test@mimi.local";
    const password = "mimi123456";
    const userName = "测试账号";

    const existing = e.app.findRecordsByFilter(
        "users",
        "email = {:email}",
        "",
        1,
        0,
        { email: email },
    );
    if (existing.length > 0) return; // already seeded

    try {
        const users = e.app.findCollectionByNameOrId("_pb_users_auth_");
        const user = new Record(users);
        user.setEmail(email);
        user.setPassword(password);
        user.set("user_name", userName);
        user.set("verified", true);
        e.app.save(user);
        console.log(`dev_seed: created test account ${email}`);
    } catch (err) {
        console.error("dev_seed: failed to create the test account:", err);
    }
});
