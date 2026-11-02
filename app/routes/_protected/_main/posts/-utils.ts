const MINUTE = 60 * 1000;

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad(value: number) {
    return value.toString().padStart(2, "0");
}

function daysAgo(date: Date, now: Date) {
    return Math.round(
        (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000,
    );
}

function shortDate(date: Date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function timeOfDay(date: Date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Moments-style relative time: 刚刚 / 5分钟前 / 3小时前 / 昨天 21:04 / ...
 */
export function formatRelativeTime(value: string | Date, now = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const diff = now.getTime() - date.getTime();
    if (diff < MINUTE) return "刚刚";
    if (diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)}分钟前`;

    const days = daysAgo(date, now);
    if (days === 0) return `${Math.max(1, Math.floor(diff / 3600000))}小时前`;
    if (days === 1) return `昨天 ${timeOfDay(date)}`;
    if (days > 1 && days < 7) return `${days}天前`;
    if (date.getFullYear() === now.getFullYear()) {
        return `${shortDate(date)} ${timeOfDay(date)}`;
    }
    return `${date.getFullYear()}年${shortDate(date)}`;
}

export function isSameDay(a: string | Date, b: string | Date) {
    const dateA = a instanceof Date ? a : new Date(a);
    const dateB = b instanceof Date ? b : new Date(b);
    return (
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate()
    );
}

/**
 * Label for the divider shown before the first post of a day.
 */
export function formatDayDivider(value: string | Date, now = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const days = daysAgo(date, now);
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (date.getFullYear() === now.getFullYear()) return shortDate(date);
    return `${date.getFullYear()}年${shortDate(date)}`;
}
