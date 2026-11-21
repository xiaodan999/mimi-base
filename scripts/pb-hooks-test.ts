/**
 * Real-PocketBase integration tests for the JSVM hooks.
 *
 * Boots a throwaway PocketBase from the pinned binary with this checkout's
 * migrations and hooks, seeds the dev accounts, and exercises ownership
 * restoration, the post counters, interaction notifications and the feedback
 * diagnostic scrub over the REST API. Every run gets a fresh temp data dir and
 * a free loopback port, so it can run repeatedly and in parallel checkouts.
 *
 * Not part of `bun test` on purpose: unlike the pure-logic unit suite this
 * needs the downloaded binary and a network listener. Run it with
 * `bun run test:pb` (CI job `pb-hooks`).
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import PocketBase, { ClientResponseError } from "pocketbase";

import { ensureBinary, PB_VERSION } from "./pb-binary";

const repoRoot = path.resolve(import.meta.dir, "..");
const migrationsDir = path.join(repoRoot, "pocketbase", "pb_migrations");
const hooksDir = path.join(repoRoot, "pocketbase", "pb_hooks");

const DEV_PASSWORD = "mimi123456";
const ACCOUNTS = [
    { email: "test@mimi.local", userName: "测试账号" },
    { email: "test2@mimi.local", userName: "测试账号二" },
];
// Created by pocketbase/pb_hooks/dev_seed.pb.js when MIMI_DEV=1.
const SUPERUSER = { email: "dev@mimi.local", password: "mimi123456" };

const SEED_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 15_000;

type TestResult = { name: string; ok: boolean };

const results: TestResult[] = [];

/** Run one independent assertion block, recording the outcome. */
async function test(name: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`ok ${results.length} - ${name}`);
    } catch (error) {
        results.push({ name, ok: false });
        console.error(`not ok ${results.length} - ${name}`);
        const message =
            error instanceof Error
                ? (error.stack ?? error.message)
                : String(error);
        console.error(
            message
                .split("\n")
                .map((line) => `  ${line}`)
                .join("\n"),
        );
    }
}

/** Assert that a PocketBase call fails with a 4xx/5xx response. */
async function expectRejected(
    label: string,
    fn: () => Promise<unknown>,
): Promise<ClientResponseError> {
    try {
        await fn();
    } catch (error) {
        assert.ok(
            error instanceof ClientResponseError,
            `${label}: expected a PocketBase error, got ${String(error)}`,
        );
        assert.ok(
            error.status >= 400,
            `${label}: expected HTTP >= 400, got ${error.status}`,
        );
        return error;
    }
    assert.fail(`${label}: the request unexpectedly succeeded`);
}

function authId(client: PocketBase): string {
    const record = client.authStore.record;
    assert.ok(record, "expected an authenticated PocketBase client");
    return record.id;
}

function isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = createServer();
        server.unref();
        server.once("error", () => resolve(false));
        server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
            server.close(() => resolve(true));
        });
    });
}

/** Drain a child stream so PocketBase never blocks on a full pipe. */
function collectLogs(stream: ReadableStream<Uint8Array>): () => string {
    let text = "";
    const decoder = new TextDecoder();
    void (async () => {
        const reader = stream.getReader();
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                text += decoder.decode(value, { stream: true });
                if (text.length > 8000) text = text.slice(-8000);
            }
        } catch {
            // The stream closes when the process exits; keep what we have.
        }
    })();
    return () => text;
}

async function stopProcess(proc: Bun.Subprocess): Promise<void> {
    if (proc.exitCode !== null) return;
    proc.kill();
    const exited = await Promise.race([
        proc.exited,
        Bun.sleep(5000).then(() => "timeout" as const),
    ]);
    if (exited === "timeout") {
        proc.kill("SIGKILL");
        await Promise.race([proc.exited, Bun.sleep(5000)]);
    }
}

function runMigrate(bin: string, dataDir: string): void {
    const proc = Bun.spawnSync(
        [
            bin,
            "migrate",
            "up",
            "--dir",
            dataDir,
            "--migrationsDir",
            migrationsDir,
        ],
        {
            env: { ...process.env, MIMI_DEV: "1" },
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    if (proc.exitCode !== 0) {
        const output = `${proc.stdout.toString()}\n${proc.stderr.toString()}`;
        throw new Error(
            `pocketbase migrate up failed (${proc.exitCode}):\n${output.trim()}`,
        );
    }
}

type PbServer = {
    proc: Bun.Subprocess;
    baseUrl: string;
};

async function startServer(bin: string, dataDir: string): Promise<PbServer> {
    const failures: string[] = [];
    // Random start so concurrent worktrees rarely race for the same port; a
    // lost race just moves on to the next candidate.
    const start = 8199 + Math.floor(Math.random() * 200);

    for (let offset = 0; offset < 20; offset++) {
        const port = start + offset;
        if (!(await isPortFree(port))) continue;

        const proc = Bun.spawn(
            [
                bin,
                "serve",
                "--http",
                `127.0.0.1:${port}`,
                "--dir",
                dataDir,
                "--migrationsDir",
                migrationsDir,
                "--hooksDir",
                hooksDir,
                "--automigrate=false",
            ],
            {
                env: { ...process.env, MIMI_DEV: "1" },
                stdout: "pipe",
                stderr: "pipe",
            },
        );
        const stdout = collectLogs(proc.stdout);
        const stderr = collectLogs(proc.stderr);
        const logs = () => `${stdout()}${stderr()}`.trim();
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
            await waitForHealth(baseUrl, proc);
            return { proc, baseUrl };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const tail = logs().split("\n").slice(-15).join("\n");
            failures.push(`port ${port}: ${message}${tail ? `\n${tail}` : ""}`);
            await stopProcess(proc);
        }
    }

    throw new Error(`could not start PocketBase:\n${failures.join("\n\n")}`);
}

async function waitForHealth(
    baseUrl: string,
    proc: Bun.Subprocess,
): Promise<void> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    let lastError = "";

    while (Date.now() < deadline) {
        if (proc.exitCode !== null) {
            throw new Error(`PocketBase exited with code ${proc.exitCode}`);
        }
        try {
            const res = await fetch(`${baseUrl}/api/health`, {
                signal: AbortSignal.timeout(2000),
            });
            if (res.ok) return;
            lastError = `health responded ${res.status}`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await Bun.sleep(200);
    }

    throw new Error(`health check timed out: ${lastError}`);
}

function newClient(baseUrl: string): PocketBase {
    const client = new PocketBase(baseUrl);
    // Many independent reads/writes on one client in sequence; keep the SDK
    // from cancelling a previous request that looks identical.
    client.autoCancellation(false);
    return client;
}

async function authAs(baseUrl: string, email: string): Promise<PocketBase> {
    const client = newClient(baseUrl);
    await client.collection("users").authWithPassword(email, DEV_PASSWORD);
    return client;
}

async function waitForSeededAccounts(
    baseUrl: string,
): Promise<{ a: PocketBase; b: PocketBase }> {
    const deadline = Date.now() + SEED_TIMEOUT_MS;
    let lastError: unknown = null;

    while (Date.now() < deadline) {
        try {
            const a = await authAs(baseUrl, ACCOUNTS[0].email);
            const b = await authAs(baseUrl, ACCOUNTS[1].email);
            return { a, b };
        } catch (error) {
            lastError = error;
            await Bun.sleep(250);
        }
    }

    throw new Error(
        `dev_seed accounts were not authenticatable within ${
            SEED_TIMEOUT_MS / 1000
        }s: ${String(lastError)}`,
    );
}

/**
 * Fallback: use the dashboard superuser to create/repair the dev accounts.
 * The seeded path stays first because it also proves dev_seed.pb.js works.
 */
async function createAccountsAsSuperuser(
    baseUrl: string,
): Promise<{ a: PocketBase; b: PocketBase }> {
    const admin = newClient(baseUrl);
    await admin
        .collection("_superusers")
        .authWithPassword(SUPERUSER.email, SUPERUSER.password);

    for (const account of ACCOUNTS) {
        const payload = {
            email: account.email,
            password: DEV_PASSWORD,
            passwordConfirm: DEV_PASSWORD,
            user_name: account.userName,
            verified: true,
        };
        try {
            await admin.collection("users").create(payload);
        } catch (error) {
            if (
                !(error instanceof ClientResponseError) ||
                error.status !== 400
            ) {
                throw error;
            }
            // The account exists but the seed did not give it the known
            // password; reset it so the test can log in.
            const existing = await admin.collection("users").getFirstListItem(
                admin.filter("email = {:email}", {
                    email: account.email,
                }),
            );
            await admin.collection("users").update(existing.id, {
                password: DEV_PASSWORD,
                passwordConfirm: DEV_PASSWORD,
                verified: true,
            });
        }
    }

    const a = await authAs(baseUrl, ACCOUNTS[0].email);
    const b = await authAs(baseUrl, ACCOUNTS[1].email);
    return { a, b };
}

async function ensureAccounts(
    baseUrl: string,
): Promise<{ a: PocketBase; b: PocketBase }> {
    try {
        return await waitForSeededAccounts(baseUrl);
    } catch (error) {
        console.warn(
            `dev_seed login failed (${
                error instanceof Error ? error.message : String(error)
            }); creating the accounts through the superuser API`,
        );
        return createAccountsAsSuperuser(baseUrl);
    }
}

async function listNotifications(client: PocketBase, filter: string) {
    return client.collection("notifications").getFullList({ filter });
}

function isEmptyConsole(value: unknown): boolean {
    if (value === "" || value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" || trimmed === "[]";
    }
    return false;
}

async function runAssertions(a: PocketBase, b: PocketBase): Promise<void> {
    const aId = authId(a);
    const bId = authId(b);

    await test("posts: author_id is restored on update", async () => {
        const created = await a.collection("posts").create({
            text: "ownership target",
            author_id: aId,
        });
        assert.equal(created.author_id, aId, "the post starts with test's id");

        const updated = await a.collection("posts").update(created.id, {
            author_id: bId,
            text: "ownership target (edited)",
        });
        assert.equal(
            updated.author_id,
            aId,
            "author_id must be restored from the stored row",
        );
        assert.equal(
            updated.text,
            "ownership target (edited)",
            "ordinary fields still update",
        );
    });

    await test("chat: messages cannot be written into another account's conversation", async () => {
        const conversation = await a.collection("chat_conversations").create({
            owner: aId,
            title: "private thread",
            model: "test-model",
        });

        await expectRejected(
            "test2 writing a message into test's conversation",
            () =>
                b.collection("chat_messages").create({
                    owner: bId,
                    conversation: conversation.id,
                    role: "user",
                    content: "intruder",
                    parts: [],
                }),
        );

        const own = await a.collection("chat_messages").create({
            owner: aId,
            conversation: conversation.id,
            role: "user",
            content: "owner message",
            parts: [],
        });
        assert.ok(own.id, "the owner can append to their conversation");

        const rows = await a.collection("chat_messages").getFullList({
            filter: a.filter("conversation = {:conversation}", {
                conversation: conversation.id,
            }),
        });
        assert.equal(rows.length, 1, "the rejected row was not saved");
        assert.equal(rows[0].content, "owner message");
    });

    await test("likes: counter and notification follow create/delete", async () => {
        const post = await a.collection("posts").create({
            text: "like target",
            author_id: aId,
        });
        const like = await b.collection("post_likes").create({
            post_id: post.id,
            user_id: bId,
        });

        const afterLike = await a.collection("posts").getOne(post.id);
        assert.equal(afterLike.like_count, 1, "like_count increments");

        const notificationFilter = a.filter(
            'type = "post_like" && post = {:post} && actor = {:actor}',
            { post: post.id, actor: bId },
        );
        const notifications = await listNotifications(a, notificationFilter);
        assert.equal(
            notifications.length,
            1,
            "the post author gets one post_like notification",
        );
        assert.equal(notifications[0].recipient, aId);

        await b.collection("post_likes").delete(like.id);

        const afterUnlike = await a.collection("posts").getOne(post.id);
        assert.equal(afterUnlike.like_count, 0, "like_count returns to 0");
        const remaining = await listNotifications(a, notificationFilter);
        assert.equal(remaining.length, 0, "unliking removes the notification");
    });

    await test("comments: counter and notification follow create/delete", async () => {
        const post = await a.collection("posts").create({
            text: "comment target",
            author_id: aId,
        });
        const comment = await b.collection("comments").create({
            text: "nice post",
            author_id: bId,
            post_id: post.id,
            parent_id: "",
        });

        const afterCreate = await a.collection("posts").getOne(post.id);
        assert.equal(afterCreate.comment_count, 1, "comment_count increments");

        const notificationFilter = a.filter(
            'type = "post_comment" && post = {:post} && comment = {:comment}',
            { post: post.id, comment: comment.id },
        );
        const notifications = await listNotifications(a, notificationFilter);
        assert.equal(
            notifications.length,
            1,
            "the post author gets one post_comment notification",
        );
        assert.equal(notifications[0].recipient, aId);

        await b.collection("comments").delete(comment.id);

        const afterDelete = await a.collection("posts").getOne(post.id);
        assert.equal(
            afterDelete.comment_count,
            0,
            "comment_count returns to 0",
        );
        const remaining = await listNotifications(a, notificationFilter);
        assert.equal(
            remaining.length,
            0,
            "deleting the comment removes the notification",
        );
    });

    await test("likes: a self-like increments the count but notifies nobody", async () => {
        const post = await a.collection("posts").create({
            text: "self like target",
            author_id: aId,
        });
        await a.collection("post_likes").create({
            post_id: post.id,
            user_id: aId,
        });

        const afterLike = await a.collection("posts").getOne(post.id);
        assert.equal(afterLike.like_count, 1, "like_count still increments");

        const notifications = await listNotifications(
            a,
            a.filter('type = "post_like" && post = {:post}', {
                post: post.id,
            }),
        );
        assert.equal(
            notifications.length,
            0,
            "no notification is created for a self-like",
        );
    });

    await test("feedback: feature rows lose route/user_agent/console/conversation", async () => {
        const conversation = await a.collection("chat_conversations").create({
            owner: aId,
            title: "feedback source",
            model: "test-model",
        });

        const created = await a.collection("feedback_reports").create({
            owner: aId,
            kind: "feature",
            title: "一点建议",
            description: "希望首页更好看",
            route: "/home?secret=1",
            user_agent: "mimi-test-agent",
            console: [{ message: "boom" }],
            conversation: conversation.id,
        });

        const row = await a.collection("feedback_reports").getOne(created.id);
        assert.equal(row.route, "", "route is stripped");
        assert.equal(row.user_agent, "", "user_agent is stripped");
        assert.ok(
            isEmptyConsole(row.console),
            `console is stripped, got ${JSON.stringify(row.console)}`,
        );
        assert.equal(row.conversation, "", "conversation is stripped");
        assert.equal(row.status, "stored", "status is reset to stored");
        assert.equal(row.kind, "feature", "the kind is preserved");
    });

    await test("notifications: only the recipient can mark a row read", async () => {
        const post = await a.collection("posts").create({
            text: "read target",
            author_id: aId,
        });
        await b.collection("comments").create({
            text: "ping",
            author_id: bId,
            post_id: post.id,
            parent_id: "",
        });

        const notifications = await listNotifications(
            a,
            a.filter("post = {:post} && recipient = {:recipient}", {
                post: post.id,
                recipient: aId,
            }),
        );
        assert.equal(
            notifications.length,
            1,
            "the comment notification exists",
        );
        const notification = notifications[0];
        assert.equal(notification.read, false, "it starts unread");

        await expectRejected("test2 marking test's notification read", () =>
            b.collection("notifications").update(notification.id, {
                read: true,
            }),
        );
        const unchanged = await a
            .collection("notifications")
            .getOne(notification.id);
        assert.equal(
            unchanged.read,
            false,
            "the rejected PATCH left read=false",
        );

        const updated = await a
            .collection("notifications")
            .update(notification.id, { read: true });
        assert.equal(updated.read, true, "the recipient can mark the row read");
    });
}

async function main(): Promise<number> {
    const bin = await ensureBinary();
    const dataDir = await mkdtemp(path.join(tmpdir(), "mimi-pb-hooks-"));
    let server: PbServer | null = null;

    try {
        runMigrate(bin, dataDir);
        server = await startServer(bin, dataDir);
        console.log(
            `pb hooks: PocketBase v${PB_VERSION} on ${server.baseUrl} (data ${dataDir})`,
        );

        const { a, b } = await ensureAccounts(server.baseUrl);
        await runAssertions(a, b);
    } finally {
        if (server) await stopProcess(server.proc);
        try {
            await rm(dataDir, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200,
            });
        } catch (error) {
            console.warn(`could not remove ${dataDir}:`, error);
        }
    }

    const passed = results.filter((result) => result.ok).length;
    const failed = results.length - passed;
    console.log(`pb hooks: ${passed} passed`);
    if (failed > 0) {
        console.error(`pb hooks: ${failed} failed`);
        return 1;
    }
    return 0;
}

try {
    process.exitCode = await main();
} catch (error) {
    console.error("pb hooks: setup failed");
    console.error(error);
    process.exitCode = 1;
}
