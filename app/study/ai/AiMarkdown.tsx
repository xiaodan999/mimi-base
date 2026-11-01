import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.filter(Boolean).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={index}>{part.slice(1, -1)}</code>;
        }
        return <span key={index}>{part}</span>;
    });
}

/**
 * 极简 markdown 渲染：只处理标题、列表、粗体和行内代码。
 * 全部走 React 节点，不用 dangerouslySetInnerHTML。
 */
export default function AiMarkdown({ text }: { text: string }) {
    const lines = text.split(/\r?\n/);
    return (
        <div className="ai-md space-y-1.5 text-[14px] leading-7">
            {lines.map((line, index) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={index} className="h-1" />;
                if (/^#{1,3}\s/.test(trimmed)) {
                    return (
                        <div
                            key={index}
                            className="pt-1 text-[14.5px] font-extrabold"
                        >
                            {inline(trimmed.replace(/^#{1,3}\s+/, ""))}
                        </div>
                    );
                }
                if (/^[-*•]\s/.test(trimmed)) {
                    return (
                        <div key={index} className="flex gap-2">
                            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary" />
                            <span>
                                {inline(trimmed.replace(/^[-*•]\s+/, ""))}
                            </span>
                        </div>
                    );
                }
                const ordered = trimmed.match(/^(\d+)[.、]\s*(.*)$/);
                if (ordered) {
                    return (
                        <div key={index} className="flex gap-2">
                            <span className="shrink-0 font-bold text-primary">
                                {ordered[1]}.
                            </span>
                            <span>{inline(ordered[2])}</span>
                        </div>
                    );
                }
                return <p key={index}>{inline(trimmed)}</p>;
            })}
        </div>
    );
}
