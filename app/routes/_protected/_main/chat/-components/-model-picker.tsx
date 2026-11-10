import { BrainCircuit, ChevronDown, Eye, Sparkles, Wrench } from "lucide-react";

import type { ChatModel } from "@/app/chat/types";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const THINKING_LABELS: Record<string, string> = {
    low: "低",
    high: "高",
    max: "最高",
};

const DEFAULT_THINKING = "default";

export type ModelPickerProps = {
    models: readonly ChatModel[];
    value: string;
    /** "" = provider default, otherwise low / high / max. */
    thinking: string;
    onChange: (modelId: string) => void;
    onThinkingChange: (level: string) => void;
    disabled?: boolean;
    className?: string;
};

/** Model + thinking level, both from the server allowlist only. */
export function ModelPicker({
    models,
    value,
    thinking,
    onChange,
    onThinkingChange,
    disabled,
    className,
}: ModelPickerProps) {
    const current = models.find((model) => model.id === value);
    const levels = current?.thinkingLevels ?? [];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled || models.length === 0}
                    className={cn(
                        "h-8 max-w-[11rem] gap-1 rounded-lg px-2 text-xs text-muted-foreground",
                        className,
                    )}
                    aria-label={`选择模型和思考强度，当前 ${
                        current?.label ?? "无可用模型"
                    }${thinking ? `，${THINKING_LABELS[thinking] ?? thinking}` : ""}`}
                >
                    <Sparkles className="size-3.5 shrink-0" />
                    <span className="truncate">
                        {current?.label ?? "无可用模型"}
                    </span>
                    {thinking && (
                        <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] leading-none font-semibold text-primary">
                            {THINKING_LABELS[thinking] ?? thinking}
                        </span>
                    )}
                    <ChevronDown className="size-3 shrink-0" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>模型（由站点提供）</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
                    {models.map((model) => (
                        <DropdownMenuRadioItem
                            key={model.id}
                            value={model.id}
                            className="cursor-pointer"
                        >
                            <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm">
                                    {model.label}
                                </span>
                                <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    {model.vision && (
                                        <span className="inline-flex items-center gap-0.5">
                                            <Eye className="size-2.5" />
                                            图片
                                        </span>
                                    )}
                                    {model.tools && (
                                        <span className="inline-flex items-center gap-0.5">
                                            <Wrench className="size-2.5" />
                                            工具
                                        </span>
                                    )}
                                    {model.reasoning && <span>思考过程</span>}
                                </span>
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px]">
                    <BrainCircuit className="size-3" />
                    思考强度
                </DropdownMenuLabel>
                {levels.length > 0 ? (
                    <DropdownMenuRadioGroup
                        value={thinking || DEFAULT_THINKING}
                        onValueChange={(next) =>
                            onThinkingChange(
                                next === DEFAULT_THINKING ? "" : next,
                            )
                        }
                    >
                        <DropdownMenuRadioItem
                            value={DEFAULT_THINKING}
                            className="cursor-pointer text-sm"
                        >
                            默认
                        </DropdownMenuRadioItem>
                        {levels.map((level) => (
                            <DropdownMenuRadioItem
                                key={level}
                                value={level}
                                className="cursor-pointer text-sm"
                            >
                                {THINKING_LABELS[level] ?? level}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                ) : (
                    <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
                        这个模型不支持调整思考强度
                    </p>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
