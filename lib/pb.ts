import PocketBase from "pocketbase";

import ENV from "./env";

const pb = new PocketBase(ENV.POCKETBASE_URL);

// The app issues many concurrent queries (feed + likes, infinite pages...),
// disable the SDK's auto cancellation so they don't abort each other.
pb.autoCancellation(false);

/**
 * PocketBase filter literals expect dates as "YYYY-MM-DD HH:mm:ss.SSSZ".
 */
export function pbDate(date: Date): string {
    return date.toISOString().replace("T", " ");
}

type FileRecord = {
    id: string;
    [key: string]: any;
};

type WithExpandedCircle = {
    circle?: unknown;
    expand?: {
        circle?: unknown;
    };
};

/**
 * users.tou_xiang stores a filename after the migration; build the URL.
 */
export function getUserAvatarUrl(
    user: { tou_xiang?: string } | null | undefined,
): string {
    if (!user?.tou_xiang) return "";
    return pb.files.getURL(user as FileRecord, user.tou_xiang);
}

/**
 * users.circle is a relation id; when the circle record is expanded it holds
 * the `image` filename. Returns "" when there is no circle image so callers
 * fall back to the default circle.
 */
export function getUserCircleUrl(
    user: WithExpandedCircle | null | undefined,
): string {
    const circle = (user?.expand?.circle ?? user?.circle) as
        { image?: string } | string | undefined;
    if (!circle || typeof circle === "string") return "";
    if (!circle.image) return "";
    return pb.files.getURL(circle as FileRecord, circle.image);
}

export default pb;
