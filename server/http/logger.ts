/**
 * Small scoped logger for the Bun API.
 *
 * `LOG_LEVEL` selects the threshold (debug < info < warn < error). Every line
 * carries an ISO timestamp, the level, the scope and optional structured
 * details (including a request id). Secrets are never passed in here.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogDetails = Record<string, unknown>;

export type Logger = {
    debug(message: string, details?: LogDetails): void;
    info(message: string, details?: LogDetails): void;
    warn(message: string, details?: LogDetails): void;
    error(message: string, details?: LogDetails): void;
    child(scope: string): Logger;
};

const LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

function parseLevel(value: string | undefined): LogLevel {
    const level = (value ?? "").trim().toLowerCase();
    return level === "debug" || level === "warn" || level === "error"
        ? level
        : "info";
}

export type LoggerOptions = {
    level?: string;
    scope?: string;
    now?: () => Date;
    sink?: (line: string) => void;
};

function serializeDetails(details: LogDetails | undefined): string {
    if (!details || Object.keys(details).length === 0) return "";
    try {
        return ` ${JSON.stringify(details)}`;
    } catch {
        return " [details unavailable]";
    }
}

export function createLogger(options: LoggerOptions = {}): Logger {
    const threshold = LEVEL_WEIGHT[parseLevel(options.level)];
    const now = options.now ?? (() => new Date());
    const sink =
        options.sink ??
        ((line: string) => {
            console.log(line);
        });

    function write(
        level: LogLevel,
        scope: string,
        message: string,
        details?: LogDetails,
    ): void {
        if (LEVEL_WEIGHT[level] < threshold) return;
        const timestamp = now().toISOString();
        sink(
            `[${timestamp}] [${level}] [${scope}] ${message}${serializeDetails(details)}`,
        );
    }

    function scoped(scope: string): Logger {
        return {
            debug: (message, details) =>
                write("debug", scope, message, details),
            info: (message, details) => write("info", scope, message, details),
            warn: (message, details) => write("warn", scope, message, details),
            error: (message, details) =>
                write("error", scope, message, details),
            child: (childScope) => scoped(`${scope}:${childScope}`),
        };
    }

    return scoped(options.scope ?? "server");
}

/** Process-wide default; scoped children keep their own prefix. */
export const logger = createLogger({
    level: process.env.LOG_LEVEL,
    scope: "mimi",
});
