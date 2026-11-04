// Tiny TCP forwarder for Windows -> WSL2 (NAT mode).
//
// WSL2 gets its own NAT address, so other devices on the LAN cannot reach the
// dev server even though the Windows host can. This listens on the Windows
// host's LAN interfaces and forwards to the WSL VM. It runs with the Windows
// node.exe, which already has inbound firewall rules, so it needs no admin
// rights and no `netsh portproxy`.
//
// Only the Vite port is forwarded. PocketBase stays on loopback and Vite
// proxies `/api` to it, so the phone needs one port and the client can use
// same-origin URLs.
//
// Usage: node lan-proxy.mjs <wsl-ip> <port> [port...]
import net from "node:net";
import os from "node:os";

const [target, ...rest] = process.argv.slice(2);
const ports = rest.map(Number).filter((port) => Number.isInteger(port));

if (!target || ports.length === 0) {
    console.error("usage: node lan-proxy.mjs <wsl-ip> <port...>");
    process.exit(1);
}

// VMware / Hyper-V / WSL / VPN adapters are not reachable from the phone.
const VIRTUAL_INTERFACE =
    /loopback|vethernet|wsl|vmware|virtualbox|hyper-v|docker|tailscale|zerotier|bluetooth|npcap|tap/i;

function lanRank(address) {
    if (address.startsWith("192.168.")) return 0;
    if (address.startsWith("10.")) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
    return 3;
}

function lanAddresses() {
    const found = [];
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
        if (VIRTUAL_INTERFACE.test(name)) continue;
        for (const address of addresses ?? []) {
            if (address.family === "IPv4" && !address.internal) {
                found.push(address.address);
            }
        }
    }
    return [...new Set(found)].sort((a, b) => lanRank(a) - lanRank(b));
}

// The shell script reads this line to print the phone URL.
console.log(`LAN_IPS=${lanAddresses().join(",")}`);

const servers = [];
let closing = false;

for (const port of ports) {
    const server = net.createServer((client) => {
        const upstream = net.connect(port, target, () => {
            client.pipe(upstream);
            upstream.pipe(client);
        });
        upstream.on("error", () => client.destroy());
        client.on("error", () => upstream.destroy());
    });

    server.on("error", (error) => {
        console.error(`[${port}] ${error.message}`);
        if (!closing) process.exit(1);
    });

    server.listen(port, "0.0.0.0", () => {
        console.log(`[${port}] 0.0.0.0 -> ${target}:${port}`);
    });
    servers.push(server);
}

function shutdown() {
    closing = true;
    for (const server of servers) server.close();
    setTimeout(() => process.exit(0), 100).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
