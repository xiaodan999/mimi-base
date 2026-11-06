import { useState, type ReactNode } from "react";
import type {
    ReasoningMessagePartProps,
    ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
    AlertTriangle,
    BrainCircuit,
    Check,
    ChevronDown,
    Copy,
    FileText,
    FolderOpen,
    Loader2,
    SquarePen,
    Terminal,
} from "lucide-react";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/* -------------------------------- code --------------------------------- */

function hastText(node: unknown): string {
    if (node === null || typeof node !== "object") return "";
    const record = node as { value?: unknown; children?: unknown[] };
    if (typeof record.value === "string") return record.value;
    if (Array.isArray(record.children)) {
        return record.children.map(hastText).join("");
    }
    return "";
}

function hastLanguage(node: unknown): string {
    if (node === null || typeof node !== "object") return "";
    const children = (node as { children?: unknown[] }).children ?? [];
    for (const child of children) {
        if (child === null || typeof child !== "object") continue;
        const element = child as {
            tagName?: string;
            properties?: { className?: unknown };
        };
        if (element.tagName !== "code") continue;
        const classes = Array.isArray(element.properties?.className)
            ? element.properties.className.map(String)
            : [];
        const language = classes.find((value) => value.startsWith("language-"));
        if (language) return language.slice("language-".length);
    }
    return "";
}

function CodeBlock({
    node,
    children,
}: {
    node?: unknown;
    children?: ReactNode;
}) {
    const [copied, setCopied] = useState(false);
    const language = hastLanguage(node);
    const raw = hastText(node).replace(/\n$/, "");

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(raw);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // clipboard may be unavailable on http pages
        }
    };

    return (
        <div className="my-3 overflow-hidden rounded-xl border border-border/70 bg-muted/40">
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                <span className="font-mono lowercase">
                    {language || "code"}
                </span>
                <button
                    type="button"
                    onClick={copy}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 active:bg-accent"
                    aria-label="复制代码"
                >
                    {copied ? (
                        <Check className="size-3" />
                    ) : (
                        <Copy className="size-3" />
                    )}
                    {copied ? "已复制" : "复制"}
                </button>
            </div>
            <pre className="overflow-x-auto p-3 text-[12.5px] leading-relaxed">
                {children}
            </pre>
        </div>
    );
}

const markdownComponents: Components = {
    p: ({ children }) => (
        <p className="mb-2.5 whitespace-pre-wrap last:mb-0">{children}</p>
    ),
    h1: ({ children }) => (
        <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">
            {children}
        </h3>
    ),
    ul: ({ children }) => (
        <ul className="mb-2.5 list-disc space-y-1 pl-5 last:mb-0">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="mb-2.5 list-decimal space-y-1 pl-5 last:mb-0">
            {children}
        </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
        <blockquote className="my-2.5 border-l-2 border-border pl-3 text-muted-foreground">
            {children}
        </blockquote>
    ),
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline decoration-primary/40 underline-offset-2"
        >
            {children}
        </a>
    ),
    table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full border-collapse text-[13px]">
                {children}
            </table>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="bg-muted/60 text-left">{children}</thead>
    ),
    th: ({ children }) => (
        <th className="whitespace-nowrap border-b border-border/70 px-3 py-2 font-semibold">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="border-b border-border/40 px-3 py-2 align-top last:border-0">
            {children}
        </td>
    ),
    hr: () => <hr className="my-4 border-border/70" />,
    pre: ({ node, children }) => <CodeBlock node={node}>{children}</CodeBlock>,
    code: ({ className, children, ...props }) => (
        <code
            className={cn(
                "rounded bg-muted px-1 py-0.5 font-mono text-[12.5px] [pre_&]:bg-transparent [pre_&]:p-0",
                className,
            )}
            {...props}
        >
            {children}
        </code>
    ),
};

/** Markdown text part with GFM tables, code blocks and a copy button. */
export function MarkdownText() {
    return (
        <MarkdownTextPrimitive
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
            className="text-[15px] leading-relaxed [&_*]:break-words"
            defer
        />
    );
}

/* ------------------------------ reasoning ------------------------------- */

/** Collapsible chain of thought. Collapsed by default, like ChatGPT. */
export function ReasoningPart({ text, status }: ReasoningMessagePartProps) {
    const [open, setOpen] = useState(false);
    const running = status?.type === "running";
    return (
        <div className="my-2 overflow-hidden rounded-xl border border-border/60 bg-muted/30">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground active:bg-accent/50"
            >
                <BrainCircuit className="size-3.5 shrink-0" aria-hidden />
                <span>{running ? "正在思考…" : "思考过程"}</span>
                {running && <Loader2 className="size-3 animate-spin" />}
                <ChevronDown
                    className={cn(
                        "ml-auto size-3.5 shrink-0 transition-transform",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open && (
                <div className="whitespace-pre-wrap border-t border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {text}
                </div>
            )}
        </div>
    );
}

/* ------------------------------ tool calls ------------------------------ */

const TOOL_TITLES: Record<string, string> = {
    sandbox_run: "运行代码",
    sandbox_read: "读取文件",
    sandbox_write: "写入文件",
    sandbox_list: "列出文件",
};

const TOOL_ICONS: Record<string, typeof Terminal> = {
    sandbox_run: Terminal,
    sandbox_read: FileText,
    sandbox_write: SquarePen,
    sandbox_list: FolderOpen,
};

function pretty(value: unknown, max = 4000): string {
    if (value === undefined) return "";
    if (typeof value === "string") {
        return value.length > max ? `${value.slice(0, max)}…` : value;
    }
    try {
        const text = JSON.stringify(value, null, 2);
        return text.length > max ? `${text.slice(0, max)}…` : text;
    } catch {
        return String(value);
    }
}

type ToolResult = {
    ok?: boolean;
    result?: unknown;
    logs?: unknown;
    files?: unknown;
    error?: unknown;
};

/** A compact card for a sandbox tool call, expandable for args + output. */
export function ToolCallPart({
    toolName,
    args,
    argsText,
    result,
    isError,
}: ToolCallMessagePartProps) {
    const [open, setOpen] = useState(false);
    const running = result === undefined;
    const payload =
        result !== undefined && typeof result === "object" && result !== null
            ? (result as ToolResult)
            : undefined;
    const failed = isError === true || payload?.ok === false;
    const Icon = TOOL_ICONS[toolName] ?? Terminal;
    const logs = Array.isArray(payload?.logs)
        ? payload.logs.filter(
              (line): line is string => typeof line === "string",
          )
        : [];
    const files = Array.isArray(payload?.files)
        ? payload.files.filter(
              (file): file is string => typeof file === "string",
          )
        : [];
    const errorText =
        payload?.error !== undefined
            ? String(payload.error)
            : failed
              ? "执行失败"
              : "";

    return (
        <div
            className={cn(
                "my-2 overflow-hidden rounded-xl border text-xs",
                failed
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border/60 bg-card/60",
            )}
        >
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2 text-left active:bg-accent/40"
            >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium">
                    {TOOL_TITLES[toolName] ?? toolName}
                </span>
                {running && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        运行中
                    </span>
                )}
                {!running && failed && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertTriangle className="size-3" />
                        失败
                    </span>
                )}
                {!running && !failed && files.length > 0 && (
                    <span className="text-muted-foreground">
                        {files.length} 个文件
                    </span>
                )}
                <ChevronDown
                    className={cn(
                        "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open && (
                <div className="space-y-2 border-t border-border/50 px-3 py-2">
                    <div>
                        <div className="mb-1 font-medium text-muted-foreground">
                            参数
                        </div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2 font-mono text-[11.5px]">
                            {pretty(args ?? argsText, 3000)}
                        </pre>
                    </div>
                    {logs.length > 0 && (
                        <div>
                            <div className="mb-1 font-medium text-muted-foreground">
                                输出
                            </div>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2 font-mono text-[11.5px]">
                                {logs.join("\n")}
                            </pre>
                        </div>
                    )}
                    {payload?.result !== undefined &&
                        payload.result !== null && (
                            <div>
                                <div className="mb-1 font-medium text-muted-foreground">
                                    结果
                                </div>
                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2 font-mono text-[11.5px]">
                                    {pretty(payload.result)}
                                </pre>
                            </div>
                        )}
                    {errorText !== "" && (
                        <div className="text-destructive">{errorText}</div>
                    )}
                </div>
            )}
        </div>
    );
}

/* -------------------------------- images -------------------------------- */

export function ChatImage({
    image,
    filename,
}: {
    image: string;
    filename?: string;
}) {
    return (
        <img
            src={image}
            alt={filename ?? "图片"}
            loading="lazy"
            className="mt-2 max-h-72 w-auto max-w-full rounded-2xl border border-border/60 object-cover"
        />
    );
}

/* -------------------------------- errors -------------------------------- */

/** Rendered from the `data-error` part we add for failed assistant turns. */
export function ErrorPart({ data }: { data?: { message?: string } }) {
    return (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 break-words">
                {data?.message || "这次没生成成功，可以点重新生成再试一次。"}
            </span>
        </div>
    );
}
