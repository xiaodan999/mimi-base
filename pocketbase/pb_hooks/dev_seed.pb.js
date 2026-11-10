/// <reference path="../pb_data/types.d.ts" />

// Dev-only accounts, created when they are missing.
// server.ts sets MIMI_DEV=1 only in dev (i.e. when .env.prod is absent), so
// the deployed server never creates these accounts.
onBootstrap((e) => {
    e.next();

    if ($os.getenv("MIMI_DEV") !== "1") return;

    // onBootstrap runs before migrations on a fresh data dir, where the custom
    // user_name field does not exist yet and `set()` would be silently
    // ignored. Seed on onServe instead: it runs after migrations on every
    // start, and the existence checks keep it idempotent. Keep the logic
    // inline: the JSVM does not expose this file's top-level helpers to the
    // onServe callback.
    e.app.onServe().bindFunc((event) => {
        const app = event.app;

        // The app logins documented in the README. Keep this list in sync with
        // `lib/dev-accounts.ts` (the login page and the `?dev=` URLs).
        const accounts = [
            {
                email: "test@mimi.local",
                password: "mimi123456",
                userName: "测试账号",
            },
            {
                email: "test2@mimi.local",
                password: "mimi123456",
                userName: "测试账号二",
            },
        ];

        for (const account of accounts) {
            try {
                const existing = app.findRecordsByFilter(
                    "users",
                    "email = {:email}",
                    "",
                    1,
                    0,
                    { email: account.email },
                );
                if (existing.length > 0) {
                    const user = existing[0];
                    // A fresh data dir seeded before the user_name migration
                    // can have an empty name. Fill it once, but never
                    // overwrite a name the user has already changed.
                    if (!user.getString("user_name")) {
                        user.set("user_name", account.userName);
                        app.save(user);
                        console.log(
                            `dev_seed: filled user_name for ${account.email}`,
                        );
                    }
                    continue;
                }

                const users = app.findCollectionByNameOrId("_pb_users_auth_");
                const user = new Record(users);
                user.setEmail(account.email);
                user.setPassword(account.password);
                user.set("user_name", account.userName);
                user.set("verified", true);
                app.save(user);
                console.log(`dev_seed: created test account ${account.email}`);
            } catch (err) {
                console.error(
                    `dev_seed: failed to create ${account.email}:`,
                    err,
                );
            }
        }

        // The dashboard (/_/) login. PocketBase creates no superuser on an
        // empty data dir, which leaves a fresh clone unable to open the
        // dashboard at all, so pin a known one too. An existing account is
        // left untouched: use `./pocketbase superuser upsert` from
        // pocketbase/ to reset a lost password.
        const adminEmail = "dev@mimi.local";
        const adminPassword = "mimi123456";

        try {
            const admins = app.findRecordsByFilter(
                "_superusers",
                "email = {:email}",
                "",
                1,
                0,
                { email: adminEmail },
            );
            if (admins.length === 0) {
                const superusers = app.findCollectionByNameOrId("_superusers");
                const admin = new Record(superusers);
                admin.setEmail(adminEmail);
                admin.setPassword(adminPassword);
                admin.set("verified", true);
                app.save(admin);
                console.log(
                    `dev_seed: created dashboard superuser ${adminEmail}`,
                );
            }
        } catch (err) {
            console.error(
                "dev_seed: failed to create the dashboard superuser:",
                err,
            );
        }

        event.next();
    });
});
