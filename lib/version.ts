/**
 * Build metadata. `APP_SHA` is a Vite `define` global injected in
 * `vite.config.ts`; `/version.json` is emitted by the same build so a running
 * bundle can compare itself with what the server currently serves.
 */
export type DeployedVersion = {
    version: string;
    sha: string;
    builtAt?: string;
    swVersion?: string;
};

const DEV_SHA = "dev";

export function isDevBuild(sha: string): boolean {
    return !sha || sha === DEV_SHA;
}

/** Full commit sha, shortened for display. Falls back to the dev label. */
export function shortSha(sha: string): string {
    return isDevBuild(sha) ? "开发版" : sha.slice(0, 7);
}

/**
 * True when both values describe the same build. Dev builds always compare
 * equal so a locally served app never claims an update is available.
 */
export function sameBuild(a: { sha: string }, b: { sha: string }): boolean {
    if (isDevBuild(a.sha) || isDevBuild(b.sha)) return true;
    return a.sha.toLowerCase() === b.sha.toLowerCase();
}

function readString(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}

/**
 * Read the deployed build's `version.json`. Returns null in dev (the file is
 * only emitted by `vite build`) and when offline, so callers can stay quiet
 * instead of showing an error.
 */
export async function fetchDeployedVersion(): Promise<DeployedVersion | null> {
    try {
        const response = await fetch("/version.json", { cache: "no-store" });
        if (!response.ok) return null;
        const data: unknown = await response.json();
        if (!data || typeof data !== "object") return null;
        const record = data as Record<string, unknown>;
        const version = readString(record.version);
        const sha = readString(record.sha);
        if (!version || !sha) return null;
        return {
            version,
            sha,
            builtAt: readString(record.builtAt),
            swVersion: readString(record.swVersion),
        };
    } catch {
        return null;
    }
}

/** Local `YYYY-MM-DD HH:mm` for a build timestamp; keeps the raw value if bad. */
export function formatBuildTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate(),
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
