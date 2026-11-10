import PocketBase from "pocketbase";

import ENV from "./env";

const pb = new PocketBase(ENV.POCKETBASE_URL);

// The app issues many concurrent queries (feed + likes, infinite pages...),
// disable the SDK's auto cancellation so they don't abort each other.
pb.autoCancellation(false);

// Protected file URLs need a short-lived token because <img> can't send the
// Authorization header. The auth store (lib/auth.tsx) keeps it fresh while
// signed in.
let fileToken = "";
let fileTokenExpiresAt = 0;
let pendingFileToken: Promise<string> | null = null;

function jwtExpiry(token: string): number {
    try {
        const payload = token.split(".")[1] ?? "";
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const json = JSON.parse(
            atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
        );
        return typeof json.exp === "number" ? json.exp * 1000 : 0;
    } catch {
        return 0;
    }
}

/**
 * Returns a valid file token, fetching a new one when the cached token is
 * missing or about to expire (PocketBase issues 3-minute tokens).
 */
export async function ensureFileToken(force = false): Promise<string> {
    if (!pb.authStore.isValid) {
        clearFileToken();
        return "";
    }
    if (!force && fileToken && Date.now() < fileTokenExpiresAt - 60_000) {
        return fileToken;
    }
    if (!pendingFileToken) {
        pendingFileToken = pb.files
            .getToken()
            .then((token) => {
                // The request may resolve after a logout; don't keep it then.
                if (!pb.authStore.isValid) return "";
                fileToken = token;
                fileTokenExpiresAt = jwtExpiry(token);
                return token;
            })
            .catch(() => fileToken)
            .finally(() => {
                pendingFileToken = null;
            });
    }
    return pendingFileToken;
}

export function clearFileToken() {
    fileToken = "";
    fileTokenExpiresAt = 0;
}

export function getFileToken() {
    return fileToken;
}

export function getFileUrl(
    record: FileRecord,
    filename: string,
    thumb?: string,
) {
    if (!filename) return "";
    const token = getFileToken();
    return pb.files.getURL(record, filename, {
        ...(thumb ? { thumb } : {}),
        ...(token ? { token } : {}),
    });
}

/**
 * PocketBase filter literals expect dates as "YYYY-MM-DD HH:mm:ss.SSSZ".
 */
export function pbDate(date: Date): string {
    return date.toISOString().replace("T", " ");
}

type FileRecord = {
    id: string;
    collectionId?: string;
    collectionName?: string;
    [key: string]: unknown;
};

type WithExpandedCircle = {
    circle?: unknown;
    expand?: {
        circle?: unknown;
    };
};

/**
 * users.tou_xiang stores a filename after the migration; build the URL.
 * The avatar is rendered at 56px at most, so ask PocketBase for a thumbnail
 * instead of the full upload (which can be several megabytes). Callers may
 * pass a full user record or just `{ id, collectionName, tou_xiang }` for
 * expanded/derived people (chat tool results).
 */
export function getUserAvatarUrl(
    user:
        | {
              id?: string;
              collectionName?: string;
              tou_xiang?: string;
          }
        | null
        | undefined,
    thumb = "200x200",
): string {
    if (!user?.tou_xiang) return "";
    return getFileUrl(user as FileRecord, user.tou_xiang, thumb);
}

/**
 * users.circle is a relation id; when the circle record is expanded it holds
 * the `image` filename. Returns "" when there is no circle image so callers
 * fall back to the default circle.
 */
export function getUserCircleUrl(
    user: WithExpandedCircle | null | undefined,
    thumb = "200x200",
): string {
    const circle = (user?.expand?.circle ?? user?.circle) as
        { image?: string } | string | undefined;
    if (!circle || typeof circle === "string") return "";
    if (!circle.image) return "";
    return getFileUrl(circle as FileRecord, circle.image, thumb);
}

/**
 * Props for `<TouXiang>`: an uploaded ring wins over a built-in preset, and
 * "" falls back to the bundled default ring.
 */
export function getUserRing(
    user: (WithExpandedCircle & { circle_preset?: string }) | null | undefined,
): { circleUrl: string; preset: string } {
    const circleUrl = getUserCircleUrl(user);
    if (circleUrl) return { circleUrl, preset: "" };
    return { circleUrl: "", preset: user?.circle_preset ?? "" };
}

export default pb;
