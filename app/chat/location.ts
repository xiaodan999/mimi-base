export type IpLocation = {
    city: string;
    region?: string;
    country?: string;
};

type GeoIpResponse = {
    city?: unknown;
    region?: unknown;
    country?: unknown;
};

function textOf(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined;
}

/**
 * City estimate for the chat location feature. `GET /api/ai/geo/ip` resolves the
 * caller's public IP to a city on the server (see server/geo-ip.ts) —
 * there are no coordinates, and the panel asks the user to confirm the
 * estimate before it reaches the model. An empty city or a failed request
 * rejects; the panel then offers manual input.
 *
 * The caller supplies the relay URL and auth headers (aiUrl + chatHeaders),
 * so this module stays free of the pb import graph like the other chat
 * logic under test.
 */
export async function getIpCity(
    request: { url: string; headers: Record<string, string> },
    fetchImpl: typeof fetch = fetch,
): Promise<IpLocation> {
    let response: Response;
    try {
        response = await fetchImpl(request.url, {
            headers: request.headers,
        });
    } catch {
        throw new Error("网络不给力，没能识别你所在的城市");
    }
    if (!response.ok) {
        throw new Error("没能识别你所在的城市");
    }
    const data = (await response.json()) as GeoIpResponse;
    const city = textOf(data.city);
    if (!city) {
        throw new Error("没能识别你所在的城市，手动输入一个吧");
    }
    return {
        city,
        ...(textOf(data.region) ? { region: textOf(data.region) } : {}),
        ...(textOf(data.country) ? { country: textOf(data.country) } : {}),
    };
}
