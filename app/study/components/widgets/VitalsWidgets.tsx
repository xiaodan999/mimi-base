import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
    Checklist,
    Note,
    ScoreBox,
    Segmented,
    StepList,
    WidgetShell,
} from "./kit";
import { useWidgetState } from "./useWidget";
import type { Card } from "../../types";

/* -------------------------------------------------------------------------- */
/* 疼痛 NRS：拖滑杆 / 点表情                                                   */
/* -------------------------------------------------------------------------- */

const PAIN_FACES = [0, 2, 4, 6, 8, 10];
const PAIN_MOUTHS = [
    "M-9 4 Q0 14 9 4",
    "M-8 5 Q0 12 8 5",
    "M-8 8 H8",
    "M-8 10 Q0 3 8 10",
    "M-9 12 Q0 1 9 12",
    "M-9 13 Q0 -1 9 13",
];

function PainFace({ index, active }: { index: number; active: boolean }) {
    return (
        <svg
            viewBox="-20 -20 40 40"
            className={`iw-face ${active ? "on" : ""}`}
            aria-hidden="true"
        >
            <circle r="17.5" />
            <circle cx="-5" cy="-4" r="1.9" className="eye" />
            <circle cx="5" cy="-4" r="1.9" className="eye" />
            <path d={PAIN_MOUTHS[index]} className="mouth" />
        </svg>
    );
}

function painLevel(value: number) {
    if (value >= 7)
        return {
            label: "重度疼痛 · 按急诊处理",
            tone: "bad" as const,
            hint: "≥7 分：按急诊处理，开医嘱后 20 分钟内获得第一次镇痛剂",
        };
    if (value >= 4)
        return {
            label: "中度疼痛 · 通知医生",
            tone: "warn" as const,
            hint: "≥4 分：通知医生，按医嘱处理并记录",
        };
    return {
        label: "轻度 / 无痛 · 继续观察",
        tone: "ok" as const,
        hint: "每班评估，每天至少记录 1 次",
    };
}

export function PainWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const value = state.value ?? 0;
    const level = painLevel(value);

    const setValue = (next: number) =>
        patch({ value: next, done: state.done ?? 1 });

    return (
        <WidgetShell hint="拖动滑杆，或直接点表情">
            <div className="iw-faces">
                {PAIN_FACES.map((faceValue, i) => {
                    const active =
                        value === faceValue ||
                        (i < PAIN_FACES.length - 1 &&
                            value > faceValue &&
                            value < PAIN_FACES[i + 1]);
                    return (
                        <button
                            type="button"
                            key={faceValue}
                            className="iw-face-btn"
                            onClick={() => setValue(faceValue)}
                            aria-label={`疼痛 ${faceValue} 分`}
                        >
                            <PainFace index={i} active={active} />
                        </button>
                    );
                })}
            </div>

            <div className="iw-pain-read">
                <b>{value}</b>
                <span>/ 10</span>
                <em className={`iw-pain-tag ${level.tone}`}>{level.label}</em>
            </div>

            <input
                className="iw-range pain"
                type="range"
                min={0}
                max={10}
                step={1}
                value={value}
                onChange={(event) => setValue(Number(event.target.value))}
                aria-label="NRS 疼痛评分"
            />
            <div className="iw-scale">
                {Array.from({ length: 11 }, (_, i) => (
                    <button
                        type="button"
                        key={i}
                        className={i === value ? "on" : ""}
                        onClick={() => setValue(i)}
                    >
                        {i}
                    </button>
                ))}
            </div>
            <div className="iw-scale-ends">
                <span>无痛</span>
                <span>剧痛</span>
            </div>

            <Note tone={level.tone}>{level.hint}</Note>
            {state.done && <div className="iw-done">✓ 这次评分已记住</div>}
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 危急值仪表：拖动血钾看什么时候报警                                           */
/* -------------------------------------------------------------------------- */

function gaugeStatus(value: number) {
    if (value < 3.0)
        return { label: "危急值（低钾）· 立即报告", tone: "bad" as const };
    if (value > 6.0)
        return { label: "危急值（高钾）· 立即报告", tone: "bad" as const };
    if (value < 3.5 || value > 5.5)
        return { label: "异常值 · 复测并报告", tone: "warn" as const };
    return { label: "正常范围", tone: "ok" as const };
}

function gaugeArc(from: number, to: number) {
    const point = (fraction: number) => {
        const angle = Math.PI * (1 - fraction);
        return {
            x: 120 + 86 * Math.cos(angle),
            y: 108 - 86 * Math.sin(angle),
        };
    };
    const a = point(from);
    const b = point(to);
    return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A86 86 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const GAUGE_BANDS = [
    { from: 0, to: 0.1, color: "#ef4444" },
    { from: 0.1, to: 0.2, color: "#f59e0b" },
    { from: 0.2, to: 0.6, color: "#22c55e" },
    { from: 0.6, to: 0.7, color: "#f59e0b" },
    { from: 0.7, to: 1, color: "#ef4444" },
];

export function GaugeWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const value = state.value ?? 6.8;
    const fraction = Math.min(1, Math.max(0, (value - 2.5) / 5));
    const status = gaugeStatus(value);
    const rotation = -90 + fraction * 180;

    return (
        <WidgetShell hint="拖动血钾值，看看哪一刻算危急值">
            <svg viewBox="0 0 240 124" className="iw-gauge" aria-hidden="true">
                {GAUGE_BANDS.map((band) => (
                    <path
                        key={band.from}
                        d={gaugeArc(band.from, band.to)}
                        fill="none"
                        stroke={band.color}
                        strokeWidth="13"
                        strokeLinecap="butt"
                    />
                ))}
                <g
                    style={{
                        transformOrigin: "120px 108px",
                        transform: `rotate(${rotation}deg)`,
                    }}
                >
                    <line
                        x1="120"
                        y1="108"
                        x2="120"
                        y2="40"
                        stroke="var(--ink)"
                        strokeWidth="4"
                        strokeLinecap="round"
                    />
                </g>
                <circle cx="120" cy="108" r="7" fill="var(--ink)" />
                <text x="26" y="122" className="iw-gauge-tick">
                    2.5
                </text>
                <text x="120" y="122" className="iw-gauge-tick mid">
                    5.0
                </text>
                <text x="214" y="122" className="iw-gauge-tick end">
                    7.5
                </text>
            </svg>

            <div className="iw-big-value">
                <b>{value.toFixed(1)}</b>
                <span>mmol/L · 血钾 K⁺</span>
            </div>

            <input
                className="iw-range"
                type="range"
                min={2.5}
                max={7.5}
                step={0.1}
                value={value}
                onChange={(event) =>
                    patch({
                        value: Number(event.target.value),
                        done: state.done ?? 1,
                    })
                }
                aria-label="血钾值"
            />

            <Note tone={status.tone}>{status.label}</Note>
            <div className="iw-legend">
                <span className="ok">3.5–5.5 正常</span>
                <span className="warn">3.0–3.5 / 5.5–6.0 异常</span>
                <span className="bad">&lt;3.0 或 &gt;6.0 危急值</span>
            </div>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 跌倒评分：勾危险因子，自动累计                                               */
/* -------------------------------------------------------------------------- */

type FallFactor = {
    id: string;
    label: string;
    options: number[];
    fixed: boolean;
};

function scoreCellOptions(html: string): { options: number[]; fixed: boolean } {
    const plain = html.replace(/<[^>]+>/g, "").trim();
    if (plain.includes("/")) {
        const options = plain
            .split("/")
            .map((part) => Number.parseInt(part.trim(), 10))
            .filter((value) => Number.isFinite(value));
        return { options: options.length ? options : [0, 1], fixed: false };
    }
    const value = Number.parseInt(plain, 10);
    return { options: Number.isFinite(value) ? [value] : [1], fixed: true };
}

export function FallWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = useMemo(() => state.checks ?? [], [state.checks]);
    const factors = useMemo<FallFactor[]>(() => {
        return (card.table?.rows ?? []).map((row, index) => {
            const score = scoreCellOptions(row[1] ?? "");
            return {
                id: `f${index}`,
                label: row[0],
                options: score.options,
                fixed: score.fixed,
            };
        });
    }, [card.table]);

    const selected = useMemo(() => new Set(checks), [checks]);
    const total = factors.reduce((sum, factor) => {
        if (factor.fixed)
            return sum + (selected.has(factor.id) ? factor.options[0] : 0);
        const picked = factor.options.find((option) =>
            selected.has(`${factor.id}:${option}`),
        );
        return sum + (picked ?? 0);
    }, 0);

    const toggleFixed = (factor: FallFactor) => {
        const next = selected.has(factor.id)
            ? checks.filter((key) => key !== factor.id)
            : [...checks, factor.id];
        patch({ checks: next, done: state.done ?? 1 });
    };

    const pickOption = (factor: FallFactor, value: number) => {
        const next = [
            ...checks.filter((key) => !key.startsWith(`${factor.id}:`)),
            `${factor.id}:${value}`,
        ];
        patch({ checks: next, done: state.done ?? 1 });
    };

    return (
        <WidgetShell hint="按患者情况勾选，分数会自动累加">
            <div className="iw-scoreline">
                <ScoreBox
                    value={total}
                    unit="分"
                    label={total >= 4 ? "≥4 分 · 高危" : "未达高危线"}
                    tone={total >= 4 ? "bad" : "ok"}
                />
                <button
                    type="button"
                    className="iw-btn ghost sm"
                    onClick={() => patch({ checks: [] })}
                >
                    清零
                </button>
            </div>

            <div className="iw-factors">
                {factors.map((factor) => {
                    if (factor.fixed) {
                        const on = selected.has(factor.id);
                        return (
                            <button
                                type="button"
                                key={factor.id}
                                className={`iw-factor ${on ? "on" : ""}`}
                                onClick={() => toggleFixed(factor)}
                                aria-pressed={on}
                            >
                                <span className="iw-check-box">
                                    {on ? "✓" : ""}
                                </span>
                                <span
                                    className="iw-factor-txt"
                                    dangerouslySetInnerHTML={{
                                        __html: factor.label,
                                    }}
                                />
                                <em>+{factor.options[0]}</em>
                            </button>
                        );
                    }
                    const picked = factor.options.find((option) =>
                        selected.has(`${factor.id}:${option}`),
                    );
                    return (
                        <div key={factor.id} className="iw-factor-row">
                            <span
                                className="iw-factor-txt"
                                dangerouslySetInnerHTML={{
                                    __html: factor.label,
                                }}
                            />
                            <Segmented
                                options={factor.options}
                                value={picked ?? 0}
                                onChange={(value) => pickOption(factor, value)}
                            />
                        </div>
                    );
                })}
            </div>

            <Note tone={total >= 4 ? "bad" : "ok"}>
                {total >= 4
                    ? "高危：挂警示牌 · 每日评估 · 签告知书 · 落实预防措施"
                    : "未到 4 分；病情变化、转科、手术后要重新评"}
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* Braden 压疮：六个维度打分 + 雷达图                                           */
/* -------------------------------------------------------------------------- */

const BRADEN_DIMS = [
    { id: "sense", label: "感觉", max: 4 },
    { id: "moist", label: "湿度", max: 4 },
    { id: "activity", label: "活动能力", max: 4 },
    { id: "mobility", label: "移动能力", max: 4 },
    { id: "nutrition", label: "营养", max: 4 },
    { id: "friction", label: "摩擦/剪切", max: 3 },
];

const BRADEN_DEFAULT: Record<string, number> = {
    sense: 4,
    moist: 3,
    activity: 2,
    mobility: 2,
    nutrition: 3,
    friction: 3,
};

function bradenRisk(total: number) {
    if (total <= 9)
        return { label: "极高危 · 每班评估 1 次", tone: "bad" as const };
    if (total <= 12)
        return { label: "高危 · 每日评估 1 次", tone: "bad" as const };
    if (total <= 18)
        return { label: "有风险 · 每周评估 1 次", tone: "warn" as const };
    return { label: "低风险 · 常规评估", tone: "ok" as const };
}

function BradenRadar({ values }: { values: Record<string, number> }) {
    const cx = 120;
    const cy = 88;
    const radius = 58;
    const point = (index: number, ratio: number) => {
        const angle = ((-90 + index * 60) * Math.PI) / 180;
        return [
            cx + radius * ratio * Math.cos(angle),
            cy + radius * ratio * Math.sin(angle),
        ] as const;
    };
    const polygon = (ratio: number) =>
        BRADEN_DIMS.map((_, index) =>
            point(index, ratio)
                .map((value) => value.toFixed(1))
                .join(","),
        ).join(" ");
    const data = BRADEN_DIMS.map((dim, index) =>
        point(index, (values[dim.id] ?? 1) / dim.max)
            .map((value) => value.toFixed(1))
            .join(","),
    ).join(" ");

    return (
        <svg viewBox="0 0 240 176" className="iw-radar" aria-hidden="true">
            {[1, 0.66, 0.33].map((ratio) => (
                <polygon
                    key={ratio}
                    points={polygon(ratio)}
                    fill="none"
                    stroke="var(--line)"
                    strokeWidth="1"
                    strokeDasharray={ratio === 1 ? undefined : "3 3"}
                />
            ))}
            {BRADEN_DIMS.map((dim, index) => {
                const [x, y] = point(index, 1);
                return (
                    <line
                        key={dim.id}
                        x1={cx}
                        y1={cy}
                        x2={x}
                        y2={y}
                        stroke="var(--line)"
                    />
                );
            })}
            <polygon
                points={data}
                fill="color-mix(in srgb, var(--m2) 28%, transparent)"
                stroke="var(--m2)"
                strokeWidth="2"
            />
            {BRADEN_DIMS.map((dim, index) => {
                const [x, y] = point(index, 1.32);
                return (
                    <text
                        key={dim.id}
                        x={x}
                        y={y + 3}
                        className="iw-radar-label"
                        textAnchor={
                            index === 0 || index === 3
                                ? "middle"
                                : index === 1 || index === 2
                                  ? "start"
                                  : "end"
                        }
                    >
                        {dim.label}
                    </text>
                );
            })}
        </svg>
    );
}

export function BradenWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const values = { ...BRADEN_DEFAULT, ...(state.vals ?? {}) };
    const total = BRADEN_DIMS.reduce(
        (sum, dim) => sum + (values[dim.id] ?? dim.max),
        0,
    );
    const risk = bradenRisk(total);

    const setDim = (id: string, value: number) => {
        patch({
            vals: { ...values, [id]: value },
            done: state.done ?? 1,
        });
    };

    return (
        <WidgetShell hint="六项各打 1–4 分，分数越低越危险">
            <div className="iw-braden">
                <BradenRadar values={values} />
                <ScoreBox
                    value={total}
                    unit="/23"
                    label={risk.label}
                    tone={risk.tone}
                />
            </div>

            <div className="iw-dims">
                {BRADEN_DIMS.map((dim) => (
                    <div key={dim.id} className="iw-dim">
                        <span>{dim.label}</span>
                        <Segmented
                            options={Array.from(
                                { length: dim.max },
                                (_, index) => index + 1,
                            )}
                            value={values[dim.id] ?? dim.max}
                            onChange={(value) => setDim(dim.id, value)}
                        />
                    </div>
                ))}
            </div>

            <Note tone={risk.tone}>
                {risk.label}；23 分是满分（最安全），不是高危线。
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* ADL 十项：0/5/10 打分                                                       */
/* -------------------------------------------------------------------------- */

const ADL_ITEMS = [
    { id: "bowel", label: "大便", options: [0, 5, 10] },
    { id: "bladder", label: "小便", options: [0, 5, 10] },
    { id: "groom", label: "修饰", options: [0, 5] },
    { id: "toilet", label: "用厕", options: [0, 5, 10] },
    { id: "feed", label: "进食", options: [0, 5, 10] },
    { id: "transfer", label: "床椅移动", options: [0, 5, 10, 15] },
    { id: "mobility", label: "活动步行", options: [0, 5, 10, 15] },
    { id: "dress", label: "穿衣", options: [0, 5, 10] },
    { id: "stairs", label: "上下楼梯", options: [0, 5, 10] },
    { id: "bath", label: "洗澡", options: [0, 5] },
];

const ADL_DEFAULT = Object.fromEntries(
    ADL_ITEMS.map((item) => [item.id, item.options[item.options.length - 1]]),
);

function adlLevel(total: number) {
    if (total <= 40) return { label: "重度依赖", tone: "bad" as const };
    if (total <= 60) return { label: "中度依赖", tone: "warn" as const };
    if (total < 100) return { label: "轻度依赖", tone: "warn" as const };
    return { label: "完全自理", tone: "ok" as const };
}

export function AdlWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const values = { ...ADL_DEFAULT, ...(state.vals ?? {}) };
    const total = ADL_ITEMS.reduce(
        (sum, item) => sum + (values[item.id] ?? 0),
        0,
    );
    const level = adlLevel(total);

    return (
        <WidgetShell hint="点每一项的分值，看看自理能力等级">
            <ScoreBox
                value={total}
                unit="/100"
                label={level.label}
                tone={level.tone}
            />
            <div className="iw-dims">
                {ADL_ITEMS.map((item) => (
                    <div key={item.id} className="iw-dim">
                        <span>{item.label}</span>
                        <Segmented
                            options={item.options}
                            value={values[item.id] ?? 0}
                            onChange={(value) =>
                                patch({
                                    vals: { ...values, [item.id]: value },
                                    done: state.done ?? 1,
                                })
                            }
                        />
                    </div>
                ))}
            </div>
            <Note tone={level.tone}>
                ADL 分数越高越独立；≤40 重、41–60 中、61–99 轻、100 自理。
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 冰箱温控：拖动温度看异常                                                     */
/* -------------------------------------------------------------------------- */

const FRIDGE_STEPS = [
    "发现异常，立即查明原因",
    "不是插口问题 → 调节冰箱温度",
    "观察 30 分钟，看是否恢复",
    "仍不恢复 → 报告护士长、设备科",
    "冰箱上挂「故障」警示牌",
    "备用药打包、注明标识，转移邻近科室",
    "最后在登记本上记录",
];

export function FridgeWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const value = state.value ?? 5;
    const abnormal = value < 2 || value > 8;
    const step = state.step ?? 0;

    return (
        <WidgetShell hint="拖动温度，低于 2℃ 或高于 8℃ 都会报警">
            <div className="iw-temp">
                <div className={`iw-temp-num ${abnormal ? "bad" : "ok"}`}>
                    <b>{value.toFixed(1)}</b>
                    <span>℃</span>
                </div>
                <div className={`iw-temp-state ${abnormal ? "bad" : "ok"}`}>
                    {abnormal ? "温度异常" : "温度正常"}
                    <small>安全范围 2–8℃</small>
                </div>
            </div>

            <div className="iw-tempbar" aria-hidden="true">
                <span className="safe" />
                <i style={{ left: `${(value / 12) * 100}%` }} />
            </div>
            <input
                className="iw-range"
                type="range"
                min={0}
                max={12}
                step={0.5}
                value={value}
                onChange={(event) =>
                    patch({
                        value: Number(event.target.value),
                        done: state.done ?? 1,
                    })
                }
                aria-label="冰箱温度"
            />
            <div className="iw-scale-ends">
                <span>0℃</span>
                <span>2℃</span>
                <span>8℃</span>
                <span>12℃</span>
            </div>

            <Checklist
                compact
                items={[
                    {
                        id: "defrost",
                        label: "本月已除霜（每月至少 1 次，有记录）",
                    },
                ]}
                checks={state.checks ?? []}
                onToggle={() => {
                    const next = (state.checks ?? []).includes("defrost")
                        ? (state.checks ?? []).filter(
                              (key) => key !== "defrost",
                          )
                        : [...(state.checks ?? []), "defrost"];
                    patch({ checks: next, done: state.done ?? 1 });
                }}
            />

            {abnormal && (
                <div className="iw-sub">
                    <div className="iw-sub-h">温度异常处理流程</div>
                    <StepList
                        steps={FRIDGE_STEPS}
                        step={Math.min(step, FRIDGE_STEPS.length - 1)}
                        onStep={(next) =>
                            patch({
                                step: next,
                                done:
                                    next >= FRIDGE_STEPS.length - 1
                                        ? 1
                                        : (state.done ?? undefined),
                            })
                        }
                    />
                </div>
            )}

            <Note tone={abnormal ? "bad" : "ok"}>
                {abnormal
                    ? "先查原因、调温、观察 30 分钟；不恢复再报修、挂牌、转移药品。"
                    : "2–8℃、每月除霜、账物相符；冰箱内不放血标本和私人物品。"}
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 约束 2 小时：演示计时器                                                      */
/* -------------------------------------------------------------------------- */

export function ClockWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const [elapsed, setElapsed] = useState(() =>
        Math.min(120, Math.max(0, state.value ?? 0)),
    );
    const [running, setRunning] = useState(false);
    const hydrated = useRef(false);
    const checks = state.checks ?? [];
    const relaxReady = elapsed >= 120;

    useEffect(() => {
        if (!running) return;
        const timer = window.setInterval(() => {
            setElapsed((current) => {
                const next = Math.min(120, current + 1);
                if (next >= 120) setRunning(false);
                return next;
            });
        }, 1000);
        return () => window.clearInterval(timer);
    }, [running]);

    useEffect(() => {
        if (elapsed >= 120) patch({ value: 120, done: 1 });
    }, [elapsed, patch]);

    // 首次从服务端 hydrate 时，把已保存的分钟数同步进来（只同步一次）
    useEffect(() => {
        if (hydrated.current || state.value === undefined) return;
        hydrated.current = true;
        setElapsed(Math.min(120, Math.max(0, state.value)));
    }, [state.value]);

    const toggleCheck = (id: string) => {
        const next = checks.includes(id)
            ? checks.filter((key) => key !== id)
            : [...checks, id];
        patch({ checks: next, done: state.done ?? 1 });
    };

    return (
        <WidgetShell hint="演示：1 秒 = 1 分钟；到 2 小时提醒放松">
            <div className="iw-clock">
                <div
                    className={`iw-ring ${relaxReady ? "bad" : ""}`}
                    style={{ "--p": elapsed / 120 } as CSSProperties}
                >
                    <div className="iw-ring-in">
                        <b>{elapsed}</b>
                        <span>分钟</span>
                    </div>
                </div>
                <div className="iw-clock-side">
                    <div
                        className={`iw-clock-state ${relaxReady ? "bad" : ""}`}
                    >
                        {relaxReady
                            ? "到点：放松 3–5 分钟"
                            : running
                              ? "约束计时中"
                              : "未开始"}
                    </div>
                    <div className="iw-clock-btns">
                        <button
                            type="button"
                            className="iw-btn"
                            onClick={() => {
                                if (running) {
                                    setRunning(false);
                                    patch({ value: elapsed });
                                } else {
                                    setRunning(true);
                                }
                            }}
                            disabled={relaxReady}
                        >
                            {running ? "暂停" : "开始"}
                        </button>
                        <button
                            type="button"
                            className="iw-btn ghost"
                            onClick={() => {
                                setRunning(false);
                                setElapsed(0);
                                patch({ value: 0 });
                            }}
                        >
                            重置
                        </button>
                    </div>
                    <div className="iw-tiny">
                        每 2 小时放松 3–5 分钟，并评估皮肤血运
                    </div>
                </div>
            </div>

            <Checklist
                compact
                items={[
                    { id: "agree", label: "已签知情同意书、有约束记录" },
                    { id: "relax", label: "每 2 小时放松 3–5 分钟" },
                    { id: "skin", label: "每 2 小时评估皮肤及血运" },
                    { id: "need", label: "约束期间满足喝水、进食、如厕" },
                ]}
                checks={checks}
                onToggle={toggleCheck}
            />

            {relaxReady && (
                <button
                    type="button"
                    className="iw-btn wide"
                    onClick={() => {
                        setElapsed(0);
                        patch({ value: 0, step: (state.step ?? 0) + 1 });
                    }}
                >
                    已完成放松，重新计时 →
                </button>
            )}

            <Note tone="warn">
                约束不是「绑上就完事」：无医嘱、无知情同意、无 2 小时记录，
                三条任一缺失都算违规。
            </Note>
        </WidgetShell>
    );
}
