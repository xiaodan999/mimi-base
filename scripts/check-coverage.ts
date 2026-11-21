/**
 * Enforce the aggregate line-coverage floor after `bun test --coverage`.
 *
 * Bun 1.4.4 has no aggregate threshold flag (`--coverage-threshold` is
 * silently ignored) and `coverageThreshold` in bunfig.toml is enforced per
 * file, which cannot work here because many UI files legitimately have 0%
 * coverage. This reads the lcov report and averages each file's line
 * percentage to match the "All files" column in Bun's text summary.
 */

const LCOV_PATH = "tmp/coverage/lcov.info";
const MIN_LINE_COVERAGE = 78;

type LineRecord = { found: number; hit: number };

const lcov = await Bun.file(LCOV_PATH).text();
const records: LineRecord[] = [];

for (const block of lcov.split("end_of_record")) {
    const found = Number(block.match(/^LF:(\d+)$/m)?.[1] ?? 0);
    const hit = Number(block.match(/^LH:(\d+)$/m)?.[1] ?? 0);
    if (found > 0) records.push({ found, hit });
}

if (records.length === 0) {
    console.error(`coverage: no line records in ${LCOV_PATH}`);
    process.exit(1);
}

const perFile = records.map((record) => (100 * record.hit) / record.found);
const average =
    perFile.reduce((total, value) => total + value, 0) / perFile.length;
const totalHit = records.reduce((total, record) => total + record.hit, 0);
const totalFound = records.reduce((total, record) => total + record.found, 0);

console.log(
    `line coverage: ${average.toFixed(2)}% ` +
        `(per-file average over ${records.length} files; ` +
        `${totalHit}/${totalFound} lines overall; floor ${MIN_LINE_COVERAGE}%)`,
);

if (average < MIN_LINE_COVERAGE) {
    console.error(`coverage below the ${MIN_LINE_COVERAGE}% line floor`);
    process.exit(1);
}

export {};
