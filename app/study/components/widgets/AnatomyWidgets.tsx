import { useMemo } from "react";

import { ChipRow, Note, WidgetShell } from "./kit";
import { useWidgetState } from "./useWidget";
import { DEMOS } from "../../demos";
import type { Card } from "../../types";

/* -------------------------------------------------------------------------- */
/* 心电监护五色导联                                                             */
/* -------------------------------------------------------------------------- */

const ECG_LEADS = [
    {
        id: "ra",
        color: "#ffffff",
        border: "#94a3b8",
        label: "白 · 右臂",
        short: "白",
        x: 120,
        y: 62,
        loc: "锁骨下，靠近右肩（RA）",
    },
    {
        id: "la",
        color: "#111827",
        border: "#111827",
        label: "黑 · 左臂",
        short: "黑",
        x: 200,
        y: 62,
        loc: "锁骨下，靠近左肩（LA）",
    },
    {
        id: "rl",
        color: "#22c55e",
        border: "#16a34a",
        label: "绿 · 右腿",
        short: "绿",
        x: 134,
        y: 128,
        loc: "右下腹（RL）",
    },
    {
        id: "ll",
        color: "#ef4444",
        border: "#dc2626",
        label: "红 · 左腿",
        short: "红",
        x: 186,
        y: 128,
        loc: "左下腹（LL）",
    },
    {
        id: "c",
        color: "#92400e",
        border: "#92400e",
        label: "棕 · 胸导",
        short: "棕",
        x: 160,
        y: 94,
        loc: "胸部导联（C）",
    },
];

export function EcgWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const currentId = state.option ?? "ra";
    const current =
        ECG_LEADS.find((lead) => lead.id === currentId) ?? ECG_LEADS[0];

    return (
        <WidgetShell hint="点颜色或身上的电极，看看它贴在哪">
            <svg viewBox="0 0 320 176" className="iw-torso" aria-hidden="true">
                <circle cx="160" cy="28" r="14" className="iw-torso-head" />
                <path
                    d="M132 46 Q160 36 188 46 L198 132 Q160 148 122 132 Z"
                    className="iw-torso-body"
                />
                <path d="M160 46v100" className="iw-torso-mid" />
                {ECG_LEADS.map((lead) => {
                    const on = lead.id === currentId;
                    return (
                        <g
                            key={lead.id}
                            className="iw-lead"
                            onClick={() => patch({ option: lead.id, done: 1 })}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                ) {
                                    event.preventDefault();
                                    patch({ option: lead.id, done: 1 });
                                }
                            }}
                        >
                            <circle
                                cx={lead.x}
                                cy={lead.y}
                                r="22"
                                fill="transparent"
                            />
                            {on && (
                                <circle
                                    cx={lead.x}
                                    cy={lead.y}
                                    r="15"
                                    className="iw-lead-ring"
                                />
                            )}
                            <circle
                                cx={lead.x}
                                cy={lead.y}
                                r="9"
                                fill={lead.color}
                                stroke={lead.border}
                                strokeWidth="1.6"
                            />
                        </g>
                    );
                })}
            </svg>

            <div className="iw-lead-chips">
                {ECG_LEADS.map((lead) => (
                    <button
                        type="button"
                        key={lead.id}
                        className={`iw-lead-chip ${
                            lead.id === currentId ? "on" : ""
                        }`}
                        onClick={() => patch({ option: lead.id, done: 1 })}
                        aria-pressed={lead.id === currentId}
                    >
                        <i
                            style={{
                                background: lead.color,
                                borderColor: lead.border,
                            }}
                        />
                        {lead.label}
                    </button>
                ))}
            </div>

            <Note tone="ok">
                <b>{current.label}</b>：{current.loc}
                。左右是患者的左右，不是你看过去的左右。
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 除颤电极位置与能量                                                           */
/* -------------------------------------------------------------------------- */

const DEFIB_POSITIONS = [
    { id: "front", label: "左右位（前侧位）" },
    { id: "back", label: "前后位" },
];

export function DefibWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const position = state.option ?? "front";
    const energy = state.value ?? 200;

    return (
        <WidgetShell hint="切换体位和能量，看看电极该放哪">
            <div className="iw-phase-tabs">
                {DEFIB_POSITIONS.map((item) => (
                    <button
                        type="button"
                        key={item.id}
                        className={item.id === position ? "on" : ""}
                        onClick={() => patch({ option: item.id, done: 1 })}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <svg viewBox="0 0 320 176" className="iw-torso" aria-hidden="true">
                <circle cx="160" cy="28" r="14" className="iw-torso-head" />
                <path
                    d="M132 46 Q160 36 188 46 L198 132 Q160 148 122 132 Z"
                    className="iw-torso-body"
                />
                <path d="M160 46v100" className="iw-torso-mid" />

                {position === "front" ? (
                    <>
                        <rect
                            x="86"
                            y="46"
                            width="32"
                            height="42"
                            rx="9"
                            className="iw-pad"
                        />
                        <rect
                            x="190"
                            y="96"
                            width="32"
                            height="42"
                            rx="9"
                            className="iw-pad"
                        />
                        <text x="102" y="38" className="iw-pad-label">
                            胸骨右缘第 2 肋间
                        </text>
                        <text x="206" y="152" className="iw-pad-label">
                            左腋前线第 5 肋间
                        </text>
                    </>
                ) : (
                    <>
                        <rect
                            x="186"
                            y="52"
                            width="34"
                            height="40"
                            rx="9"
                            className="iw-pad back"
                        />
                        <rect
                            x="186"
                            y="100"
                            width="32"
                            height="40"
                            rx="9"
                            className="iw-pad"
                        />
                        <text x="203" y="44" className="iw-pad-label">
                            左肩胛下区
                        </text>
                        <text x="202" y="154" className="iw-pad-label">
                            左乳头下
                        </text>
                    </>
                )}
                <text x="160" y="22" className="iw-defib-title">
                    除颤电极
                </text>
            </svg>

            <div className="iw-energy">
                <span>能量</span>
                {[120, 150, 200, 360].map((value) => (
                    <button
                        type="button"
                        key={value}
                        className={energy === value ? "on" : ""}
                        onClick={() => patch({ value, done: 1 })}
                    >
                        {value} J
                    </button>
                ))}
            </div>

            <Note tone={energy === 360 ? "warn" : "ok"}>
                双相波 120–200 J（按厂家推荐），单相波 360 J。
                只对室颤/无脉室速除颤；心电静止（直线）不除颤。
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 三凹征                                                                      */
/* -------------------------------------------------------------------------- */

const BREATH_SITES = [
    { id: "suprasternal", label: "胸骨上窝", x: 150, y: 64 },
    { id: "supraclavicular", label: "锁骨上窝", x: 124, y: 80 },
    { id: "intercostal", label: "肋间隙", x: 112, y: 102 },
];

export function BreathWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = state.checks ?? [];
    const allOn = BREATH_SITES.every((site) => checks.includes(site.id));

    const toggle = (id: string) => {
        const next = checks.includes(id)
            ? checks.filter((key) => key !== id)
            : [...checks, id];
        patch({
            checks: next,
            done: BREATH_SITES.every((site) => next.includes(site.id))
                ? 1
                : (state.done ?? undefined),
        });
    };

    return (
        <WidgetShell hint="点出三个凹陷的位置">
            <svg
                viewBox="0 0 320 176"
                className="iw-torso breath"
                aria-hidden="true"
            >
                <path
                    d="M150 26 q14 0 14 16 v10 h14 q22 4 26 30 l6 56 q-30 12 -60 12 t-60 -12 l6 -56 q4 -26 26 -30 h14 v-10 q0 -16 14 -16z"
                    className="iw-torso-body"
                />
                {BREATH_SITES.map((site) => {
                    const on = checks.includes(site.id);
                    return (
                        <g
                            key={site.id}
                            className={`iw-breath-site ${on ? "on" : ""}`}
                            onClick={() => toggle(site.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                ) {
                                    event.preventDefault();
                                    toggle(site.id);
                                }
                            }}
                        >
                            <circle
                                cx={site.x}
                                cy={site.y}
                                r="22"
                                fill="transparent"
                            />
                            <circle
                                cx={site.x}
                                cy={site.y}
                                r="9"
                                className="iw-breath-ring"
                            />
                        </g>
                    );
                })}
                <text x="252" y="64" className="iw-breath-label">
                    胸骨上窝
                </text>
                <text x="252" y="86" className="iw-breath-label">
                    锁骨上窝
                </text>
                <text x="252" y="108" className="iw-breath-label">
                    肋间隙
                </text>
                <text x="160" y="168" className="iw-breath-foot">
                    {allOn
                        ? "✓ 三凹征：吸气时凹陷 → 上气道部分梗阻"
                        : "吸气时这三个地方凹陷 = 三凹征"}
                </text>
            </svg>

            <div className="iw-checks compact">
                {BREATH_SITES.map((site) => {
                    const on = checks.includes(site.id);
                    return (
                        <button
                            type="button"
                            key={site.id}
                            className={`iw-check ${on ? "on" : ""}`}
                            onClick={() => toggle(site.id)}
                            aria-pressed={on}
                        >
                            <span className="iw-check-box">
                                {on ? "✓" : ""}
                            </span>
                            <span className="iw-check-txt">{site.label}</span>
                        </button>
                    );
                })}
            </div>

            <Note tone={allOn ? "ok" : "warn"}>
                {allOn
                    ? "✓ 三凹征提示上气道部分梗阻，是吸气性呼吸困难。"
                    : "三凹 = 胸骨上窝 + 锁骨上窝 + 肋间隙；是吸气时凹，不是呼气。"}
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 压疮分期                                                                     */
/* -------------------------------------------------------------------------- */

const SKIN_STAGES = [
    { id: "d", label: "DTPI", row: 0 },
    { id: "1", label: "Ⅰ期", row: 1 },
    { id: "2", label: "Ⅱ期", row: 2 },
    { id: "3", label: "Ⅲ期", row: 3 },
    { id: "4", label: "Ⅳ期", row: 4 },
    { id: "u", label: "不可分期", row: 5 },
];

export function SkinWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const initial =
        typeof card.demoArg === "string" && card.demoArg ? card.demoArg : "2";
    const stage = state.option ?? initial;
    const current =
        SKIN_STAGES.find((item) => item.id === stage) ?? SKIN_STAGES[2];
    const row = card.table?.rows[current.row];

    const svg = useMemo(() => {
        const render = DEMOS.skin;
        if (!render) return "";
        try {
            return render(stage) ?? "";
        } catch {
            return "";
        }
    }, [stage]);

    return (
        <WidgetShell hint="切换分期，看看缺损到哪一层">
            <ChipRow
                options={SKIN_STAGES.map((item) => ({
                    id: item.id,
                    label: item.label,
                }))}
                value={stage}
                onPick={(id) => patch({ option: id, done: 1 })}
            />

            <div
                className="iw-skin-svg"
                dangerouslySetInnerHTML={{ __html: svg }}
            />

            {row && (
                <div className="iw-skin-info">
                    <div>
                        <b>{row[0].replace(/<[^>]+>/g, "")}</b>
                    </div>
                    <p dangerouslySetInnerHTML={{ __html: row[1] }} />
                    <small
                        dangerouslySetInnerHTML={{ __html: `处理：${row[2]}` }}
                    />
                </div>
            )}

            <Note tone="warn">
                先判断皮肤完整性，再判断深度，最后看有无焦痂/腐肉。
                Ⅰ期「指压不变白」是关键词。
            </Note>
        </WidgetShell>
    );
}
