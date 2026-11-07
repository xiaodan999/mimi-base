/**
 * Offline IP -> city lookup for the chat location feature.
 *
 * `GET /ai/geo/ip` (wired in ai-relay.ts) resolves the caller's public IP to
 * a city with the `ip2region` package, whose bundled xdb data (v4 + v6) ships
 * via node_modules like the pdf.js CMaps — nothing is downloaded or
 * committed. City-level only: the feature never produces coordinates, and
 * the client asks the user to confirm the estimate before it reaches the
 * model.
 */

import { IP2Region, type IP2Region as Ip2RegionClient } from "ip2region/bun";

export type CityInfo = {
    country: string;
    region: string;
    city: string;
};

export type IpCityLookup = (ip: string) => Promise<CityInfo | null>;

export type IpCityLookupOptions = {
    /** Injectable for tests. */
    fetch?: typeof fetch;
    now?: () => number;
    /** Address families to load; tests load v4 only to keep memory small. */
    families?: readonly (4 | 6)[];
    /**
     * Dev only: resolve private/loopback callers through the server's own
     * public egress IP (dev phone and server share the home network). Prod
     * never geolocates anything but the caller's public IP.
     */
    devEgress?: boolean;
};

const EGRESS_URLS = ["https://api.ipify.org", "https://ip.3322.net"];
const EGRESS_TIMEOUT_MS = 3_000;
const EGRESS_CACHE_MS = 10 * 60_000;
/** Failures retry sooner than successes. */
const EGRESS_FAILURE_CACHE_MS = 30_000;
/** After a failed database open, wait this long before trying again. */
const OPEN_RETRY_MS = 60_000;

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4ToUint32(ip: string): number | null {
    const match = IPV4_PATTERN.exec(ip);
    if (!match) return null;
    const octets = match.slice(1).map(Number);
    if (octets.some((n) => n > 255)) return null;
    return (
        ((octets[0] << 24) |
            (octets[1] << 16) |
            (octets[2] << 8) |
            octets[3]) >>>
        0
    );
}

/**
 * Loopback / private / link-local ranges — callers without a meaningful
 * city. Global IPv6 addresses resolve through the bundled v6 database, so
 * only their local ranges are excluded. Unparseable strings count as
 * private: there is nothing to geolocate.
 */
export function isPrivateIp(ip: string): boolean {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip.trim());
    const candidate = mapped ? mapped[1] : ip.trim();
    if (candidate.includes(":")) {
        const first = candidate.toLowerCase().split(":")[0];
        return (
            candidate.toLowerCase() === "::1" ||
            candidate.toLowerCase() === "::" ||
            /^fe[89ab]/.test(first) ||
            /^f[cd]/.test(first)
        );
    }
    const n = ipv4ToUint32(candidate);
    if (n === null) return true;
    const inRange = (base: string, bits: number) => {
        const mask = (0xffffffff << (32 - bits)) >>> 0;
        return (n & mask) === (ipv4ToUint32(base)! & mask);
    };
    return (
        inRange("0.0.0.0", 8) ||
        inRange("10.0.0.0", 8) ||
        inRange("127.0.0.0", 8) ||
        inRange("169.254.0.0", 16) ||
        inRange("172.16.0.0", 12) ||
        inRange("192.168.0.0", 16)
    );
}

/**
 * The proxy is the only thing that talks to the loopback-only relay, so the
 * rightmost X-Forwarded-For entry is the address it saw (spoof-resistant);
 * a client-supplied leftmost entry cannot displace it.
 */
export function resolveClientIp(req: Request, socketIp: string): string {
    const forwarded = req.headers.get("x-forwarded-for") ?? "";
    const entries = forwarded
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");
    return entries[entries.length - 1] ?? socketIp;
}

/**
 * Text-only egress-IP services, tried in order. Used in dev to give
 * private/loopback callers (Vite proxy, localhost) the home city.
 */
export async function fetchEgressIp(
    fetchImpl: typeof fetch,
): Promise<string | null> {
    for (const url of EGRESS_URLS) {
        try {
            const response = await fetchImpl(url, {
                signal: AbortSignal.timeout(EGRESS_TIMEOUT_MS),
            });
            if (!response.ok) continue;
            const text = (await response.text()).trim();
            if (IPV4_PATTERN.test(text) && !isPrivateIp(text)) return text;
        } catch {
            // Try the next source.
        }
    }
    return null;
}

export function createIpCityLookup(
    options: IpCityLookupOptions = {},
): IpCityLookup {
    const fetchImpl = options.fetch ?? fetch;
    const now = options.now ?? Date.now;

    let client: Ip2RegionClient | null = null;
    let opening: Promise<Ip2RegionClient | null> | null = null;
    let lastFailedAt = 0;
    let egressCache: { ip: string | null; at: number } | null = null;

    const open = async (): Promise<Ip2RegionClient | null> => {
        if (client) return client;
        if (now() - lastFailedAt < OPEN_RETRY_MS) return null;
        opening ??= IP2Region.open({
            families: options.families,
            mappedIPv6: "ipv4",
        })
            .then((opened) => {
                client = opened;
                return opened;
            })
            .catch(() => {
                lastFailedAt = now();
                return null;
            })
            .finally(() => {
                opening = null;
            });
        return opening;
    };

    const resolveEgressIp = async (): Promise<string | null> => {
        if (egressCache) {
            const ttl =
                egressCache.ip === null
                    ? EGRESS_FAILURE_CACHE_MS
                    : EGRESS_CACHE_MS;
            if (now() - egressCache.at < ttl) return egressCache.ip;
        }
        const ip = await fetchEgressIp(fetchImpl);
        egressCache = { ip, at: now() };
        return ip;
    };

    return async (raw) => {
        let ip = raw;
        if (isPrivateIp(ip)) {
            if (!options.devEgress) return null;
            const egress = await resolveEgressIp();
            if (egress === null) return null;
            ip = egress;
        }
        const db = await open();
        if (!db) return null;
        try {
            const result = db.lookup(ip);
            return {
                country: result?.country?.name ?? "",
                region: result?.subdivisions?.[0]?.name ?? "",
                city: result?.city?.name ?? "",
            };
        } catch {
            // Unparseable literals and database hiccups are not fatal.
            return null;
        }
    };
}
