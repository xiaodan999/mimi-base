/**
 * Formats an expense amount as `¥1,234.56`. Set `trimZero` for compact spots
 * (e.g. a stat tile) to render whole amounts as `¥1,234`.
 */
export function formatMoney(value: number, trimZero = false) {
    const [whole, cents] = Math.abs(value).toFixed(2).split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const body = trimZero && cents === "00" ? grouped : `${grouped}.${cents}`;
    return `${value < 0 ? "-" : ""}¥${body}`;
}
