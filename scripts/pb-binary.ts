/**
 * Locate (or download) the pinned PocketBase binary for local dev.
 *
 * The container image bakes its own binary; this is only for
 * `bun run dev:backend` / `dev:all` / preview. New worktrees first look in the
 * worktrees, then sibling checkouts, then the shared cache, so a fresh
 * checkout starts without network access.
 */

import { execFileSync, execSync } from "node:child_process";
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const PB_VERSION = "0.40.6";

const isWindows = process.platform === "win32";
const platformTag = (() => {
    if (process.platform === "win32") return "windows_amd64";
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    if (process.platform === "darwin") return `darwin_${arch}`;
    return `linux_${arch}`;
})();
const binName = isWindows ? "pocketbase.exe" : "pocketbase";
const dir = path.resolve(import.meta.dir, "../pocketbase");
const repo = path.resolve(dir, "..");
const bin = path.join(dir, binName);

function cachePath(): string {
    const base = process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache");
    return path.join(
        base,
        "mimi-base",
        `pocketbase-${PB_VERSION}${isWindows ? ".exe" : ""}`,
    );
}

/** New worktrees should not need GitHub. */
function reusableBinaries(): string[] {
    const candidates: string[] = [];
    const parent = path.dirname(repo);

    try {
        const listing = execSync("git worktree list --porcelain", {
            cwd: repo,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        for (const line of listing.split("\n")) {
            if (!line.startsWith("worktree ")) continue;
            const root = line.slice("worktree ".length).trim();
            candidates.push(path.join(root, "pocketbase", binName));
        }
    } catch {
        // Not a git checkout or git is missing; the sibling scan still applies.
    }

    try {
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            candidates.push(
                path.join(parent, entry.name, "pocketbase", binName),
            );
        }
    } catch {
        // ignore
    }

    candidates.push(cachePath());

    return [...new Set(candidates)].filter(
        (candidate) => path.resolve(candidate) !== bin,
    );
}

/** Keep one shared copy so later worktrees don't depend on this checkout. */
function seedCache(source: string) {
    const target = cachePath();
    if (existsSync(target)) return;
    try {
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(source, target);
        chmodSync(target, 0o755);
    } catch {
        // The cache is an optimization only.
    }
}

function matchesPinnedVersion(candidate: string): boolean {
    try {
        const version = execFileSync(candidate, ["--version"], {
            encoding: "utf8",
        }).trim();
        return version.includes(PB_VERSION);
    } catch {
        return false;
    }
}

/**
 * Windows 10+ ships bsdtar, which reads zip archives, and Linux uses unzip.
 * Prefer unzip anyway: under Git Bash on Windows `tar` resolves to GNU tar,
 * which cannot read zip, so the bsdtar fallback only works when unzip is
 * missing.
 */
function extractCommand(): string {
    try {
        execSync("unzip -v", { stdio: "ignore" });
        return "unzip -o pocketbase.zip";
    } catch {
        if (isWindows) return "tar -xf pocketbase.zip";
        throw new Error("unzip is required to extract PocketBase");
    }
}

export async function ensureBinary(): Promise<string> {
    if (existsSync(bin)) {
        seedCache(bin);
        return bin;
    }

    for (const candidate of reusableBinaries()) {
        if (!existsSync(candidate)) continue;
        try {
            chmodSync(candidate, 0o755);
        } catch {
            // A read-only checkout is fine: we only read it.
        }
        if (!matchesPinnedVersion(candidate)) continue;
        try {
            copyFileSync(candidate, bin);
            chmodSync(bin, 0o755);
            seedCache(bin);
            console.log(`copied PocketBase v${PB_VERSION} from ${candidate}`);
            return bin;
        } catch (error) {
            console.warn(`could not reuse ${candidate}:`, error);
        }
    }

    const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${platformTag}.zip`;
    console.log(`downloading PocketBase v${PB_VERSION} (${platformTag})...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
    const zip = path.join(dir, "pocketbase.zip");
    await Bun.write(zip, res);
    execSync(extractCommand(), { cwd: dir, stdio: "inherit" });
    unlinkSync(zip);
    chmodSync(bin, 0o755);
    seedCache(bin);
    return bin;
}
