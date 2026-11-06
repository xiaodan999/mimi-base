export type BrowserLocation = {
    latitude: number;
    longitude: number;
    /** Metres. */
    accuracy: number;
    city?: string;
    region?: string;
    country?: string;
};

export class LocationError extends Error {
    code: number;

    constructor(message: string, code: number) {
        super(message);
        this.name = "LocationError";
        this.code = code;
    }
}

type ReverseGeocodeResponse = {
    city?: unknown;
    locality?: unknown;
    principalSubdivision?: unknown;
    countryName?: unknown;
};

function textOf(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined;
}

/**
 * Coordinates -> a readable place. BigDataCloud's reverse endpoint is
 * CORS-friendly and needs no key. A failure is not fatal: the coordinates
 * are still useful for weather APIs.
 */
export async function reverseGeocode(
    latitude: number,
    longitude: number,
    fetchImpl: typeof fetch = fetch,
): Promise<Pick<BrowserLocation, "city" | "region" | "country">> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    try {
        const url =
            "https://api.bigdatacloud.net/data/reverse-geocode-client" +
            `?latitude=${encodeURIComponent(latitude)}` +
            `&longitude=${encodeURIComponent(longitude)}` +
            "&localityLanguage=zh";
        const response = await fetchImpl(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });
        if (!response.ok) return {};
        const data = (await response.json()) as ReverseGeocodeResponse;
        return {
            ...((textOf(data.city) ?? textOf(data.locality))
                ? { city: textOf(data.city) ?? textOf(data.locality) }
                : {}),
            ...(textOf(data.principalSubdivision)
                ? { region: textOf(data.principalSubdivision) }
                : {}),
            ...(textOf(data.countryName)
                ? { country: textOf(data.countryName) }
                : {}),
        };
    } catch {
        return {};
    } finally {
        clearTimeout(timer);
    }
}

function messageFor(code: number): string {
    if (code === 1) return "用户拒绝了定位权限";
    if (code === 2) return "暂时无法获取位置";
    if (code === 3) return "获取位置超时";
    return "获取位置失败";
}

/**
 * Asks the browser for the current position. This shows the browser's own
 * permission prompt; it never runs without the user's consent.
 */
export function getBrowserLocation(
    timeoutMs = 15_000,
): Promise<BrowserLocation> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
        return Promise.reject(new LocationError("当前浏览器不支持定位", 0));
    }
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const base = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                };
                void reverseGeocode(base.latitude, base.longitude).then(
                    (place) => resolve({ ...base, ...place }),
                );
            },
            (error) =>
                reject(new LocationError(messageFor(error.code), error.code)),
            {
                enableHighAccuracy: false,
                timeout: timeoutMs,
                maximumAge: 60_000,
            },
        );
    });
}
