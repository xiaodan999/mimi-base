/**
 * Enforce the gzipped shell budget in `scripts/bundle-budget.json`.
 *
 * The shell is what every route pays for before any lazy chunk: the entry
 * `<script type="module">`, its `<link rel="modulepreload">` graph and the
 * stylesheets referenced by `build/index.html`. Runs after `vite build`.
 */

const BUILD_DIR = "build";
const BUDGET_PATH = "scripts/bundle-budget.json";

type Asset = {
    url: string;
    raw: number;
    gzip: number;
};

function readAttr(tag: string, name: string): string | undefined {
    const match = tag.match(
        new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`, "i"),
    );
    return match?.[1];
}

function collectAssets(html: string): { js: string[]; css: string[] } {
    const js = new Set<string>();
    const css = new Set<string>();

    function keep(url: string | undefined, target: Set<string>) {
        if (!url) return;
        const pathname = url.split(/[?#]/)[0];
        if (pathname.startsWith("/assets/")) target.add(pathname);
    }

    for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
        if (readAttr(tag, "type") !== "module") continue;
        keep(readAttr(tag, "src"), js);
    }
    for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
        const rel = readAttr(tag, "rel")?.toLowerCase();
        if (rel === "modulepreload") keep(readAttr(tag, "href"), js);
        else if (rel === "stylesheet") keep(readAttr(tag, "href"), css);
    }

    return { js: [...js].sort(), css: [...css].sort() };
}

async function measure(pathname: string): Promise<Asset> {
    const path = `${BUILD_DIR}${pathname}`;
    const file = Bun.file(path);
    if (!(await file.exists())) {
        throw new Error(`missing shell asset: ${path}`);
    }
    const raw = await file.bytes();
    return { url: pathname, raw: raw.length, gzip: Bun.gzipSync(raw).length };
}

function sum(assets: Asset[]): { raw: number; gzip: number } {
    return assets.reduce(
        (total, asset) => ({
            raw: total.raw + asset.raw,
            gzip: total.gzip + asset.gzip,
        }),
        { raw: 0, gzip: 0 },
    );
}

function printGroup(label: string, assets: Asset[], budget: number): boolean {
    console.log(`\n${label}`);
    console.log(
        `${"asset".padEnd(52)} ${"raw".padStart(9)} ${"gzip".padStart(9)}`,
    );
    for (const asset of assets) {
        console.log(
            `${asset.url.padEnd(52)} ${String(asset.raw).padStart(9)} ${String(
                asset.gzip,
            ).padStart(9)}`,
        );
    }
    const total = sum(assets);
    const verdict =
        total.gzip <= budget
            ? `ok (${budget - total.gzip} under)`
            : `OVER by ${total.gzip - budget}`;
    console.log(
        `${"total".padEnd(52)} ${String(total.raw).padStart(9)} ${String(
            total.gzip,
        ).padStart(9)}  budget ${budget}  ${verdict}`,
    );
    return total.gzip <= budget;
}

function budgetValue(value: unknown, key: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${BUDGET_PATH}: ${key} must be a positive number`);
    }
    return value;
}

const html = await Bun.file(`${BUILD_DIR}/index.html`).text();
const budget = (await Bun.file(BUDGET_PATH).json()) as Record<string, unknown>;
const jsBudget = budgetValue(budget.shellJsGzipBytes, "shellJsGzipBytes");
const cssBudget = budgetValue(budget.shellCssGzipBytes, "shellCssGzipBytes");

const { js, css } = collectAssets(html);
if (js.length === 0) {
    throw new Error(`no shell module scripts found in ${BUILD_DIR}/index.html`);
}

const jsAssets = await Promise.all(js.map(measure));
const cssAssets = await Promise.all(css.map(measure));

console.log("shell bundle budget (gzip bytes from build/index.html)");
const jsOk = printGroup("shell JS (entry + modulepreload)", jsAssets, jsBudget);
const cssOk = printGroup("shell CSS (stylesheets)", cssAssets, cssBudget);

if (!jsOk || !cssOk) {
    console.error(
        "\nbundle budget exceeded; trim the shell or raise scripts/bundle-budget.json deliberately.",
    );
    process.exit(1);
}

console.log("\nshell bundle within budget");

export {};
