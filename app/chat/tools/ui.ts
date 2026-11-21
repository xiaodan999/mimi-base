import { normalizeChartSpec } from "@/app/chat/chart";
import type { SandboxFiles } from "@/app/chat/types";
import { normalizeUiSpec } from "@/app/chat/ui-spec";

import type { ToolOutcome } from "./outcome";

export function showChartTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
): ToolOutcome {
    const spec = normalizeChartSpec(args);
    if (!spec) {
        return {
            result: {
                ok: false,
                error: "图表数据不对：labels 和 values 必须一一对应（1-30 项）",
            },
            files,
            isError: true,
        };
    }
    // The card renders from the normalized spec (args or result survive a
    // reload); the result mirrors it so the model sees what was drawn.
    return { result: { ok: true, ...spec }, files, isError: false };
}

export function renderUiTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
): ToolOutcome {
    const spec = normalizeUiSpec(args);
    if (!spec) {
        return {
            result: {
                ok: false,
                error: "卡片内容不对：blocks 需要 1-12 个有效区块，内容别太长",
            },
            files,
            isError: true,
        };
    }
    return { result: { ok: true, ...spec }, files, isError: false };
}
