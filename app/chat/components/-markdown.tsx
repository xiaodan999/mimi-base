import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { highlightCode, isHighlightableLanguage } from "@/app/chat/highlighter";
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
            <CodeBody code={raw} language={language}>
                {children}
            </CodeBody>
        </div>
    );
}

/** Plain text until Shiki (lazy-loaded chunk) delivers highlighted HTML. */
function CodeBody({
    code,
    language,
    children,
}: {
    code: string;
    language: string;
    children?: ReactNode;
}) {
    const [html, setHtml] = useState<string | null>(null);
    useEffect(() => {
        if (!isHighlightableLanguage(language)) return undefined;
        let alive = true;
        void highlightCode(code, language).then((result) => {
            if (alive && result !== null) setHtml(result);
        });
        return () => {
            alive = false;
        };
    }, [code, language]);

    if (html === null) {
        return (
            <pre className="overflow-x-auto p-3 text-[12.5px] leading-relaxed">
                {children}
            </pre>
        );
    }
    return (
        <div
            className="shiki-host overflow-x-auto p-3 text-[12.5px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

export const markdownComponents: Components = {
    p: ({ children }) => (
        <p className="mb-2.5 whitespace-pre-wrap last:mb-0">{children}</p>
    ),
    h1: ({ children }) => (
        <h1 className="mt-4 mb-2 text-lg font-semibold first:mt-0">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="mt-4 mb-2 text-base font-semibold first:mt-0">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="mt-3 mb-1.5 text-[15px] font-semibold first:mt-0">
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
        <th className="border-b border-border/70 px-3 py-2 font-semibold whitespace-nowrap">
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
            smooth={false}
        />
    );
}

/** Static markdown for the artifact preview (no assistant-ui context). */
export function MarkdownView({ text }: { text: string }) {
    return (
        <div className="text-[15px] leading-relaxed [&_*]:break-words">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}
