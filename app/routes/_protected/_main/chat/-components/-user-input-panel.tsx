import { useEffect, useRef, useState } from "react";
import { HelpCircle, Loader2, MapPin } from "lucide-react";

import { getBrowserLocation, LocationError } from "@/app/chat/location";
import { answerUserInput, usePendingUserInput } from "@/app/chat/user-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Inline card for an `ask_user` tool call. It pauses the model's tool loop
 * until the user answers; answering resolves the tool call and the model
 * continues in the same run. The question is scoped to its conversation so a
 * run left waiting in the background reappears only where it was asked.
 */
export function UserInputPanel({ conversationId }: { conversationId: string }) {
    const request = usePendingUserInput(conversationId);
    const [text, setText] = useState("");
    const [error, setError] = useState("");
    const [locating, setLocating] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setText("");
        setError("");
        setLocating(false);
        if (request?.kind === "text") {
            // Let the card mount before focusing (mobile keyboards).
            const timer = setTimeout(() => inputRef.current?.focus(), 80);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [request]);

    if (!request) return null;

    const submitText = () => {
        const value = text.trim();
        if (value === "") return;
        answerUserInput({ ok: true, answer: value });
    };

    const allowLocation = async () => {
        setError("");
        setLocating(true);
        try {
            const location = await getBrowserLocation();
            answerUserInput({ ok: true, location });
        } catch (caught) {
            setError(
                caught instanceof LocationError
                    ? caught.message
                    : "获取位置失败，换一种方式试试",
            );
            setLocating(false);
        }
    };

    return (
        <section
            aria-label="AI 提问"
            aria-live="polite"
            className="border-t border-primary/20 bg-primary/5 px-3 py-3"
        >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                <HelpCircle className="size-3.5" aria-hidden />
                AI 想问你
            </div>
            <p className="mt-1.5 text-[15px] leading-relaxed">
                {request.question}
            </p>

            {request.kind === "text" && (
                <div className="mt-2 flex items-center gap-2">
                    <Input
                        ref={inputRef}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                submitText();
                            }
                        }}
                        placeholder={request.placeholder ?? "输入你的回答…"}
                        maxLength={500}
                        className="h-10 flex-1 rounded-xl bg-background"
                    />
                    <Button
                        type="button"
                        size="sm"
                        className="h-10 rounded-xl px-4"
                        disabled={text.trim() === ""}
                        onClick={submitText}
                    >
                        回答
                    </Button>
                </div>
            )}

            {request.kind === "choice" && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {(request.options ?? []).map((option) => (
                        <Button
                            key={option}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl bg-background"
                            onClick={() =>
                                answerUserInput({ ok: true, answer: option })
                            }
                        >
                            {option}
                        </Button>
                    ))}
                </div>
            )}

            {request.kind === "confirm" && (
                <div className="mt-2 flex gap-2">
                    <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-xl"
                        onClick={() =>
                            answerUserInput({ ok: true, answer: "yes" })
                        }
                    >
                        是的
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl bg-background"
                        onClick={() =>
                            answerUserInput({ ok: true, answer: "no" })
                        }
                    >
                        不是
                    </Button>
                </div>
            )}

            {request.kind === "expense" && request.expense && (
                <div className="mt-2">
                    <div className="rounded-xl border border-border/60 bg-background px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 truncate text-[15px] font-medium">
                                {request.expense.item}
                            </span>
                            <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                                ¥{request.expense.price}
                            </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            {request.expense.category !== ""
                                ? `分类：${request.expense.category}`
                                : "分类留空，之后可以补"}
                            {" · 记入共享账本"}
                        </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                        <Button
                            type="button"
                            size="sm"
                            className="h-9 rounded-xl"
                            onClick={() => answerUserInput({ ok: true })}
                        >
                            记下
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl bg-background"
                            onClick={() =>
                                answerUserInput({
                                    ok: false,
                                    error: "用户没有确认这笔账",
                                })
                            }
                        >
                            先不记
                        </Button>
                    </div>
                </div>
            )}

            {request.kind === "location" && (
                <div className="mt-2">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        浏览器会请求定位权限。坐标只用于这次回答，并保存在你自己的聊天记录里。
                    </p>
                    <div className="mt-2 flex gap-2">
                        <Button
                            type="button"
                            size="sm"
                            className="h-9 rounded-xl"
                            disabled={locating}
                            onClick={() => void allowLocation()}
                        >
                            {locating ? (
                                <Loader2 className="mr-1 size-4 animate-spin" />
                            ) : (
                                <MapPin className="mr-1 size-4" />
                            )}
                            {locating ? "定位中…" : "允许定位"}
                        </Button>
                        {error !== "" && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl bg-background"
                                onClick={() =>
                                    answerUserInput({
                                        ok: false,
                                        error: "用户无法或不愿提供定位",
                                    })
                                }
                            >
                                改用手动输入
                            </Button>
                        )}
                    </div>
                    {error !== "" && (
                        <p className="mt-1.5 text-[11px] text-destructive">
                            {error}
                        </p>
                    )}
                </div>
            )}

            <div className="mt-2 flex justify-end">
                <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline-offset-2 active:underline"
                    onClick={() =>
                        answerUserInput({
                            ok: false,
                            error: "用户取消了请求",
                        })
                    }
                >
                    取消
                </button>
            </div>
        </section>
    );
}
