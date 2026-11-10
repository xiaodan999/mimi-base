import type {
    DataMessagePartProps,
    ReasoningMessagePartProps,
    ToolCallMessagePartProps,
} from "@assistant-ui/react";
import {
    AlertTriangle,
    BarChart3,
    Brain,
    BrainCircuit,
    ChevronDown,
    Download,
    FileText,
    FolderOpen,
    Globe,
    HelpCircle,
    Image as ImageIcon,
    LayoutDashboard,
    Loader2,
    MessageSquareText,
    Newspaper,
    Paperclip,
    Receipt,
    SquarePen,
    Terminal,
    Wallet,
} from "lucide-react";
import { useState } from "react";

import { formatBytes, textArtifactInfo } from "@/app/chat/artifacts";
import { commentPreviews } from "@/app/chat/tool-comments";
import { TOOL_TITLES } from "@/app/chat/tool-labels";
import {
    expensesPeople,
    postAuthors,
    type ToolPerson,
} from "@/app/chat/tool-people";
import type { ChatArtifactPart } from "@/app/chat/types";
import { getUserAvatarUrl } from "@/lib/pb";
import { cn } from "@/lib/utils";

import { useArtifactActions, useSandboxFiles } from "./-artifact-viewer";
import { ChartCard } from "./-chart-card";
import { UiCard } from "./-ui-card";

// The markdown renderer (and its lazy Shiki code blocks) lives in its own
// module so the full-screen artifact preview can use it without a cycle.
export { MarkdownText } from "./-markdown";

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

const TOOL_ICONS: Record<string, typeof Terminal> = {
    ask_user: HelpCircle,
    sandbox_run: Terminal,
    sandbox_read: FileText,
    sandbox_write: SquarePen,
    sandbox_list: FolderOpen,
    send_file: Paperclip,
    show_chart: BarChart3,
    render_ui: LayoutDashboard,
    memory: Brain,
    read_url: Globe,
    get_expenses: Wallet,
    search_posts: Newspaper,
    get_comments: MessageSquareText,
    log_expense: Receipt,
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
    changed?: unknown;
    artifact_error?: unknown;
    error?: unknown;
};

/** Real profile chips (avatar + name + figure) for the shared-data tools,
 * rendered from the persisted result so they survive reloads. */
function PersonChip({ person }: { person: ToolPerson }) {
    const avatarUrl = getUserAvatarUrl(
        person.avatar !== "" && person.id !== ""
            ? {
                  id: person.id,
                  collectionName: "users",
                  tou_xiang: person.avatar,
              }
            : null,
    );
    return (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 py-0.5 pl-1 pr-2 text-[11px]">
            {avatarUrl !== "" ? (
                <img
                    src={avatarUrl}
                    alt=""
                    className="size-5 shrink-0 rounded-full object-cover"
                />
            ) : (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {person.name.slice(0, 1)}
                </span>
            )}
            <span className="max-w-[8rem] truncate font-medium">
                {person.name}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
                {person.detail}
            </span>
        </span>
    );
}

/** A compact card for a sandbox tool call, expandable for args + output. */
export function ToolCallPart({
    toolName,
    args,
    argsText,
    result,
    isError,
}: ToolCallMessagePartProps) {
    const [open, setOpen] = useState(false);
    const sandboxFiles = useSandboxFiles();
    const { openSandboxFile } = useArtifactActions();
    const running = result === undefined;
    const payload =
        result !== undefined && typeof result === "object" && result !== null
            ? (result as ToolResult)
            : undefined;
    const failed = isError === true || payload?.ok === false;
    const Icon = TOOL_ICONS[toolName] ?? Terminal;
    const language =
        toolName === "sandbox_run" &&
        typeof (args as { language?: unknown } | undefined)?.language ===
            "string"
            ? (args as { language: string }).language
            : "";
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
    const changed = Array.isArray(payload?.changed)
        ? payload.changed.filter(
              (file): file is string => typeof file === "string",
          )
        : [];
    const errorText =
        payload?.error !== undefined
            ? String(payload.error)
            : failed
              ? "执行失败"
              : "";
    const artifactError =
        payload?.artifact_error !== undefined
            ? String(payload.artifact_error)
            : "";
    // Data tools store the raw tool JSON on the part (`result` IS the
    // ExpensesToolResult / PostsToolResult / CommentsToolResult); sandbox
    // tools nest theirs under `result.result`. The parsers expect the raw
    // tool JSON.
    const people =
        toolName === "get_expenses"
            ? expensesPeople(payload)
            : toolName === "search_posts" || toolName === "get_comments"
              ? postAuthors(payload)
              : [];
    const comments =
        toolName === "get_comments"
            ? commentPreviews(payload)
            : { items: [], total: 0 };

    if (toolName === "show_chart" || toolName === "render_ui") {
        // Both render while args stream in and from the persisted result after
        // a reload; the expandable card only shows up for failures.
        const isChart = toolName === "show_chart";
        return (
            <div className="my-2">
                {isChart ? (
                    <ChartCard data={result ?? args} />
                ) : (
                    <UiCard data={result ?? args} />
                )}
                {failed && (
                    <details className="mt-1 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <summary className="cursor-pointer font-medium">
                            {isChart ? "图表数据有问题" : "卡片内容有问题"}
                        </summary>
                        <pre className="mt-1.5 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                            {pretty(args ?? argsText, 1500)}
                        </pre>
                    </details>
                )}
            </div>
        );
    }

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
                    {language === "javascript"
                        ? " · JS"
                        : language === "python"
                          ? " · Python"
                          : ""}
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
            {!running && !failed && people.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-border/50 px-3 py-2">
                    {people.map((person, index) => (
                        <PersonChip
                            key={
                                person.id !== ""
                                    ? person.id
                                    : `${person.name}-${index}`
                            }
                            person={person}
                        />
                    ))}
                </div>
            )}
            {!running && !failed && comments.items.length > 0 && (
                <div className="space-y-1.5 border-t border-border/50 px-3 py-2">
                    {comments.items.map((comment, index) => (
                        <p
                            key={
                                comment.id !== ""
                                    ? comment.id
                                    : `${comment.by}-${index}`
                            }
                            className="line-clamp-2 text-[11.5px] leading-snug"
                        >
                            <span className="font-medium">{comment.by}</span>
                            {comment.replyTo !== "" && (
                                <span className="text-muted-foreground">
                                    {" "}
                                    回复 @{comment.replyTo}
                                </span>
                            )}
                            <span className="text-muted-foreground">
                                ：{comment.text}
                            </span>
                        </p>
                    ))}
                    {comments.total > comments.items.length && (
                        <p className="text-[10px] text-muted-foreground">
                            共 {comments.total} 条，展开可看全部
                        </p>
                    )}
                </div>
            )}
            {!failed && changed.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-border/50 px-3 py-2">
                    {changed
                        .filter((path) => sandboxFiles[path] !== undefined)
                        .slice(0, 3)
                        .map((path) => (
                            <button
                                key={path}
                                type="button"
                                onClick={() => openSandboxFile(path)}
                                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border/70 bg-muted/40 px-2 py-1 text-[11px] active:bg-accent"
                            >
                                <FileText className="size-3 shrink-0" />
                                <span className="max-w-[10rem] truncate">
                                    {path.split("/").pop()}
                                </span>
                            </button>
                        ))}
                </div>
            )}
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
                    {artifactError !== "" && (
                        <div className="text-destructive">{artifactError}</div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ------------------------------- artifacts ------------------------------ */

const ARTIFACT_KIND_LABELS: Record<string, string> = {
    html: "HTML",
    markdown: "Markdown",
    csv: "CSV",
    json: "JSON",
    svg: "SVG",
    code: "代码",
    text: "文本",
};

function ArtifactCard({ part }: { part: ChatArtifactPart }) {
    const files = useSandboxFiles();
    const { openArtifact, downloadArtifact, artifactUrl } =
        useArtifactActions();

    if (part.source === "file") {
        const url = artifactUrl(part);
        return (
            <div className="my-2 overflow-hidden rounded-xl border border-border/60 bg-card/60 text-xs">
                <button
                    type="button"
                    onClick={() => openArtifact(part)}
                    aria-label={`预览 ${part.name}`}
                    className="block w-full bg-muted/20 active:opacity-90"
                >
                    {url ? (
                        <img
                            src={url}
                            alt={part.name}
                            loading="lazy"
                            className="max-h-72 w-full object-contain"
                        />
                    ) : (
                        <div className="flex h-24 items-center justify-center text-muted-foreground">
                            图片加载中…
                        </div>
                    )}
                </button>
                <div className="flex items-center gap-2 px-3 py-2">
                    <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{part.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                            {part.caption || formatBytes(part.size) || "图片"}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => downloadArtifact(part)}
                        aria-label={`下载 ${part.name}`}
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground active:bg-accent"
                    >
                        <Download className="size-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    const source = files[part.path];
    const info = textArtifactInfo(part.path);
    if (source === undefined) {
        return (
            <div className="my-2 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <FileText className="size-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{part.name}</div>
                    <div className="truncate text-[11px]">文件已从沙箱删除</div>
                </div>
            </div>
        );
    }
    return (
        <div className="my-2 flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs">
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{part.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                    {part.caption || ARTIFACT_KIND_LABELS[info.kind]}
                </div>
            </div>
            <button
                type="button"
                onClick={() => openArtifact(part)}
                className="shrink-0 rounded-lg px-2 py-1 font-medium text-primary active:bg-accent"
            >
                预览
            </button>
            <button
                type="button"
                onClick={() => downloadArtifact(part)}
                aria-label={`下载 ${part.name}`}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground active:bg-accent"
            >
                <Download className="size-3.5" />
            </button>
        </div>
    );
}

/** Rendered through assistant-ui's `data.by_name.artifact` slot. */
export function ArtifactPart({ data }: DataMessagePartProps) {
    const part = data as ChatArtifactPart | undefined;
    if (!part || part.type !== "artifact") return null;
    return <ArtifactCard part={part} />;
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
