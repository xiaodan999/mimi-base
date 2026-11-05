/// <reference path="../pb_data/types.d.ts" />

// Dev-only accounts, created on startup when they are missing.
// server.ts sets MIMI_DEV=1 only in dev (i.e. when .env.prod is absent), so
// the deployed server never creates these accounts.
onBootstrap((e) => {
    e.next();

    if ($os.getenv("MIMI_DEV") !== "1") return;

    // The app login documented in the README.
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

    if (existing.length === 0) {
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
    }

    // The dashboard (/_/) login. PocketBase creates no superuser on an empty
    // data dir, which leaves a fresh clone unable to open the dashboard at all,
    // so pin a known one too. An existing account is left untouched: use
    // `./pocketbase superuser upsert` from pocketbase/ to reset a lost password.
    const adminEmail = "dev@mimi.local";
    const adminPassword = "mimi123456";

    try {
        const admins = e.app.findRecordsByFilter(
            "_superusers",
            "email = {:email}",
            "",
            1,
            0,
            { email: adminEmail },
        );
        if (admins.length === 0) {
            const superusers = e.app.findCollectionByNameOrId("_superusers");
            const admin = new Record(superusers);
            admin.setEmail(adminEmail);
            admin.setPassword(adminPassword);
            admin.set("verified", true);
            e.app.save(admin);
            console.log(`dev_seed: created dashboard superuser ${adminEmail}`);
        }
    } catch (err) {
        console.error(
            "dev_seed: failed to create the dashboard superuser:",
            err,
        );
    }
});
