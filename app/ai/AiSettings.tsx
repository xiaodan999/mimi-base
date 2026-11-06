import { useEffect, useState } from "react";

import { toast } from "@/app/study/toast";

import AiSheet from "./AiSheet";
import { clearAiCache } from "./cache";
import { aiErrorText, testAiConnection } from "./client";
import type { AiSettings } from "./config";
import { notificationsSupported, requestSystemNotifications } from "./notify";
import { formatUsd, readDailyUsage } from "./usage";

type Props = {
    open: boolean;
    settings: AiSettings;
    onClose: () => void;
    onSave: (settings: AiSettings) => void;
};

export default function AiSettingsSheet({
    open,
    settings,
    onClose,
    onSave,
}: Props) {
    const [draft, setDraft] = useState(settings);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    const [usage, setUsage] = useState(() => readDailyUsage());

    useEffect(() => {
        if (!open) return;
        setDraft(settings);
        setTestResult(null);
        setUsage(readDailyUsage());
    }, [open, settings]);

    const patchDraft = (patch: Partial<AiSettings>) => {
        setDraft((prev) => ({ ...prev, ...patch }));
        setTestResult(null);
    };

    const toggleNotify = async (checked: boolean) => {
        if (!checked) {
            patchDraft({ notify: false });
            return;
        }
        if (!notificationsSupported()) {
            toast("这个浏览器不支持系统通知");
            return;
        }
        const granted = await requestSystemNotifications();
        if (!granted) {
            toast("浏览器没有授权通知，可以去系统设置里打开");
            return;
        }
        patchDraft({ notify: true });
    };

    const test = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            await testAiConnection();
            setTestResult({ ok: true, text: "连接成功，可以用了" });
            toast("连接成功，可以用了");
        } catch (error) {
            const text = aiErrorText(error);
            setTestResult({ ok: false, text });
            toast(text);
        } finally {
            setTesting(false);
            setUsage(readDailyUsage());
        }
    };

    const save = () => {
        onSave({
            notify: draft.notify,
            dailyBudgetUsd: Math.max(0, Number(draft.dailyBudgetUsd) || 0),
        });
        toast("AI 设置已保存（只在这台设备）");
    };

    return (
        <AiSheet
            open={open}
            onClose={onClose}
            title="AI 设置"
            subtitle="AI 由本站提供，登录即可使用，不需要填 Key"
            zIndex={90}
        >
            {/* 这里用学习页的 st-* 控件，作用域放在内容上，别套到整个抽屉上：
                 `.study-root :where(button)` 会把 shadcn 按钮的背景和边框清掉。 */}
            <div className="study-root space-y-4">
                <div className="st-tiny rounded-xl bg-muted/40 px-3 py-2">
                    模型和 API Key 都由站点统一配置。这里只保留通知和本机预算，
                    不需要也不支持填写自己的 Key。
                </div>

                <label className="block">
                    <div className="st-tiny mb-1 font-bold">
                        每天花费上限（美元，估）
                    </div>
                    <input
                        className="st-input"
                        type="number"
                        min="0"
                        step="0.1"
                        value={draft.dailyBudgetUsd}
                        onChange={(event) =>
                            patchDraft({
                                dailyBudgetUsd: Math.max(
                                    0,
                                    Number(event.target.value) || 0,
                                ),
                            })
                        }
                        placeholder="0 = 不限制"
                    />
                    <div className="st-tiny mt-1">
                        填 0 不限制；超过当天估算花费就暂停这台设备的新请求。
                        站点另有每日次数限制。
                    </div>
                </label>

                <div className="st-tiny rounded-xl bg-muted/40 px-3 py-2">
                    今日估算消耗 {formatUsd(usage.costUsd)} · {usage.calls} 次 ·{" "}
                    {usage.tokens} tokens（只在本机估算，不是账单）
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                    <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                        checked={draft.notify}
                        onChange={(event) =>
                            void toggleNotify(event.target.checked)
                        }
                    />
                    <span className="min-w-0">
                        <span className="st-tiny block font-bold">
                            任务完成后发送系统通知
                        </span>
                        <span className="st-tiny block">
                            App 切到后台时也能收到提醒；需要浏览器授权。
                        </span>
                    </span>
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

                <button className="st-btn block" onClick={save}>
                    保存
                </button>
            </div>
        </AiSheet>
    );
}
