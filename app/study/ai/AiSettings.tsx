import { useEffect, useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";

import pb from "@/lib/pb";

import { toast } from "../toast";
import AiSheet from "./AiSheet";
import { clearAiCache } from "./cache";
import { aiErrorText, testAiConnection } from "./client";
import {
    AI_PRESETS,
    CUSTOM_PRESET_ID,
    matchPreset,
    type AiPreset,
    type AiSettings,
} from "./config";

type Props = {
    open: boolean;
    settings: AiSettings;
    onClose: () => void;
    onSave: (settings: AiSettings) => void;
};

/** PocketBase 中转的地址依赖当前部署，选中预设时再填进去 */
function presetBaseUrl(preset: AiPreset): string {
    if (preset.id !== "opencode-go-pb") return preset.baseUrl;
    return `${pb.baseUrl.replace(/\/+$/, "")}/api/ai/opencode/v1`;
}

export default function AiSettingsSheet({
    open,
    settings,
    onClose,
    onSave,
}: Props) {
    const [draft, setDraft] = useState(settings);
    const [presetId, setPresetId] = useState(() =>
        matchPreset(settings, presetBaseUrl),
    );
    const [showKey, setShowKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);

    useEffect(() => {
        if (!open) return;
        setDraft(settings);
        setPresetId(matchPreset(settings, presetBaseUrl));
        setShowKey(false);
        setTestResult(null);
    }, [open, settings]);

    const patchDraft = (patch: Partial<AiSettings>) => {
        setDraft((prev) => ({ ...prev, ...patch }));
        setTestResult(null);
    };

    const pickPreset = (id: string) => {
        setPresetId(id);
        setTestResult(null);
        const preset = AI_PRESETS.find((item) => item.id === id);
        if (preset) {
            setDraft((prev) => ({
                ...prev,
                baseUrl: presetBaseUrl(preset),
                model: preset.model,
            }));
        }
    };

    const test = async () => {
        if (
            !draft.baseUrl.trim() ||
            !draft.model.trim() ||
            !draft.apiKey.trim()
        ) {
            setTestResult({
                ok: false,
                text: "地址、模型和 Key 都要填完",
            });
            toast("先把地址、模型和 Key 填完");
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            await testAiConnection(draft);
            setTestResult({ ok: true, text: "连接成功，可以用了" });
            toast("连接成功，可以用了");
        } catch (error) {
            const text = aiErrorText(error);
            setTestResult({ ok: false, text });
            toast(text);
        } finally {
            setTesting(false);
        }
    };

    const save = () => {
        if (
            !draft.baseUrl.trim() ||
            !draft.model.trim() ||
            !draft.apiKey.trim()
        ) {
            toast("地址、模型、Key 都要填");
            return;
        }
        onSave({
            baseUrl: draft.baseUrl.trim(),
            model: draft.model.trim(),
            apiKey: draft.apiKey.trim(),
        });
        toast("AI 设置已保存（只在这台设备）");
    };

    const clearKey = () => {
        onSave({ ...draft, apiKey: "" });
        toast("已清除本机保存的 Key");
    };

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="AI 设置"
            subtitle="Key 只保存在本机浏览器，不会上传到服务器"
            zIndex={90}
        >
            <div className="space-y-4">
                <div>
                    <div className="st-tiny mb-1 font-bold">服务商</div>
                    <select
                        className="st-input"
                        value={presetId}
                        onChange={(event) => pickPreset(event.target.value)}
                    >
                        {AI_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.name}
                            </option>
                        ))}
                        <option value={CUSTOM_PRESET_ID}>自定义</option>
                    </select>
                    {presetId !== CUSTOM_PRESET_ID && (
                        <div className="st-tiny mt-1">
                            {
                                AI_PRESETS.find(
                                    (preset) => preset.id === presetId,
                                )?.note
                            }
                        </div>
                    )}
                </div>

                <label className="block">
                    <div className="st-tiny mb-1 font-bold">Base URL</div>
                    <input
                        className="st-input"
                        value={draft.baseUrl}
                        onChange={(event) =>
                            patchDraft({ baseUrl: event.target.value })
                        }
                        placeholder="https://api.deepseek.com/v1"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <div className="st-tiny mt-1">
                        一般以 /v1 结尾；会自动补上 /chat/completions。
                    </div>
                </label>

                <label className="block">
                    <div className="st-tiny mb-1 font-bold">模型</div>
                    <input
                        className="st-input"
                        value={draft.model}
                        onChange={(event) =>
                            patchDraft({ model: event.target.value })
                        }
                        placeholder="deepseek-chat"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </label>

                <label className="block">
                    <div className="st-tiny mb-1 font-bold">API Key</div>
                    <div className="relative">
                        <input
                            className="st-input pr-10"
                            type={showKey ? "text" : "password"}
                            value={draft.apiKey}
                            onChange={(event) =>
                                patchDraft({ apiKey: event.target.value })
                            }
                            placeholder="sk-..."
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                            onClick={() => setShowKey((value) => !value)}
                            aria-label={showKey ? "隐藏 Key" : "显示 Key"}
                        >
                            {showKey ? (
                                <EyeOff className="size-4" />
                            ) : (
                                <Eye className="size-4" />
                            )}
                        </button>
                    </div>
                </label>

                <div className="flex flex-wrap gap-2">
                    <button
                        className="st-btn sm line"
                        onClick={test}
                        disabled={testing}
                    >
                        {testing ? "测试中…" : "测试连接"}
                    </button>
                    <button
                        className="st-btn sm ghost"
                        onClick={() => {
                            clearAiCache();
                            toast("已清空本机 AI 缓存");
                        }}
                    >
                        清空 AI 缓存
                    </button>
                    <button className="st-btn sm ghost" onClick={clearKey}>
                        <Trash2 className="size-4" /> 清除 Key
                    </button>
                </div>

                {testResult && (
                    <div
                        className={`rounded-xl px-3 py-2 text-[12.5px] leading-6 ${
                            testResult.ok
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-red-50 text-red-700"
                        }`}
                    >
                        {testResult.ok ? "✅ " : "⚠️ "}
                        {testResult.text}
                    </div>
                )}

                <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-6 text-amber-800">
                    浏览器直连需要服务商允许跨域。DeepSeek、OpenRouter、硅基流动、Moonshot
                    可以直连；OpenAI 官方和 OpenCode Go 官方地址不返回 CORS
                    头。OpenCode Go 建议选「PocketBase 中转」预设，Key
                    只在请求时经过你的服务器，不落库。
                </div>

                <button className="st-btn block" onClick={save}>
                    保存
                </button>
            </div>
        </AiSheet>
    );
}
