/**
 * TCP peer address per request, captured by `Bun.serve` in main.ts.
 *
 * The geo-IP route needs it as a fallback when no proxy header is present.
 * Tests create Requests directly, so the WeakMap simply yields "" there.
 */

const clientIps = new WeakMap<Request, string>();

export function setRequestIp(request: Request, ip: string): void {
    clientIps.set(request, ip);
}

export function getRequestIp(request: Request): string {
    return clientIps.get(request) ?? "";
}
