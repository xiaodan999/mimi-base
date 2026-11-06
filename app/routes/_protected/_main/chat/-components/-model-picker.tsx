import { ChevronDown, Eye, Sparkles, Wrench } from "lucide-react";

import type { ChatModel } from "@/app/chat/types";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ModelPickerProps = {
    models: readonly ChatModel[];
    value: string;
    onChange: (modelId: string) => void;
    disabled?: boolean;
    className?: string;
};

/** Model choice from the server allowlist only; no free-text input. */
export function ModelPicker({
    models,
    value,
    onChange,
    disabled,
    className,
}: ModelPickerProps) {
    const current = models.find((model) => model.id === value);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled || models.length === 0}
                    className={cn(
                        "h-8 max-w-[9rem] gap-1 rounded-lg px-2 text-xs text-muted-foreground",
                        className,
                    )}
                    aria-label="选择模型"
                >
                    <Sparkles className="size-3.5 shrink-0" />
                    <span className="truncate">
                        {current?.label ?? "无可用模型"}
                    </span>
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
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
