import { useEffect, useState } from "react";

import type { Card } from "../../types";
import { Checklist, Note, ScoreBox, StepList, WidgetShell } from "./kit";
import { useWidgetState } from "./useWidget";

/* -------------------------------------------------------------------------- */
/* 通用流程                                                                    */
/* -------------------------------------------------------------------------- */

export function FlowWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const steps = Array.isArray(card.demoArg)
        ? card.demoArg
        : ["步骤一", "步骤二"];
    const step = Math.min(state.step ?? 0, steps.length - 1);

    return (
        <WidgetShell hint="点任意一步跳过去，也可以按下一步">
            <StepList
                steps={steps}
                step={step}
                onStep={(next) =>
                    patch({
                        step: next,
                        ...(next >= steps.length - 1
                            ? { done: 1 as const }
                            : {}),
                    })
                }
            />
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 身份识别：选两种以上方法                                                     */
/* -------------------------------------------------------------------------- */

const ID_OPTIONS = [
    { id: "name", label: "姓名", sub: "反问式：请患者自己说" },
    { id: "mrn", label: "住院号", sub: "与腕带核对" },
    { id: "dob", label: "出生日期", sub: "与腕带核对" },
    {
        id: "bed",
        label: "床号",
        sub: "床号会变，不能作为依据",
        tone: "bad" as const,
    },
];

export function WristbandWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = state.checks ?? [];
    const has = (id: string) => checks.includes(id);
    const valid = has("name") && (has("mrn") || has("dob"));
    const bedOnly = has("bed") && !valid;

    const toggle = (id: string) => {
        const next = has(id)
            ? checks.filter((key) => key !== id)
            : [...checks, id];
        patch({
            checks: next,
            done:
                next.includes("name") &&
                (next.includes("mrn") || next.includes("dob"))
                    ? 1
                    : (state.done ?? undefined),
        });
    };

    return (
        <WidgetShell hint="给这位患者做一次身份核对">
            <div className="iw-band">
                <div className="iw-band-photo">🙂</div>
                <div className="iw-band-info">
                    <b>王小明</b>
                    <span>住院号 2026110208</span>
                    <span>床号 32 床</span>
                </div>
                <div className="iw-band-chip">腕带</div>
            </div>

            <Checklist
                items={ID_OPTIONS.map((option) => ({
                    id: option.id,
                    label: `${option.label}`,
                    sub: option.sub,
                    tone: option.tone,
                }))}
                checks={checks}
                onToggle={toggle}
            />

            <Note tone={valid ? "ok" : bedOnly ? "bad" : "warn"}>
                {valid
                    ? "✓ 姓名 + 住院号/出生日期，两种方法已满足；给药、输血、手术前每次都要核。"
                    : bedOnly
                      ? "只选床号不合格：床号会变，人不会。"
                      : "至少需要两种方法：姓名 + 住院号（或出生日期）。"}
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 手术安全核查：三个时点                                                       */
/* -------------------------------------------------------------------------- */

const SURGERY_PHASES = [
    {
        id: "pre",
        label: "① 麻醉实施前",
        items: ["身份、术式、部位/侧别", "知情同意", "过敏史"],
    },
    {
        id: "cut",
        label: "② 手术开始前（切皮前）",
        items: ["部位标记", "影像资料", "器械、敷料清点"],
    },
    {
        id: "out",
        label: "③ 患者离室前",
        items: ["标本", "器械敷料再次清点", "患者去向"],
    },
];

export function SurgeryWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = state.checks ?? [];
    const allItems = SURGERY_PHASES.flatMap((phase) =>
        phase.items.map((_, index) => `${phase.id}-${index}`),
    );
    const doneCount = allItems.filter((id) => checks.includes(id)).length;

    const toggle = (id: string) => {
        const next = checks.includes(id)
            ? checks.filter((key) => key !== id)
            : [...checks, id];
        patch({
            checks: next,
            done: allItems.every((key) => next.includes(key))
                ? 1
                : (state.done ?? undefined),
        });
    };

    return (
        <WidgetShell hint="三个时点都核完，才算手术安全核查完成">
            <div className="iw-progress-line">
                <span>
                    已核 {doneCount}/{allItems.length}
                </span>
                <div className="iw-bar">
                    <i
                        style={{
                            width: `${(doneCount / allItems.length) * 100}%`,
                        }}
                    />
                </div>
            </div>

            {SURGERY_PHASES.map((phase) => (
                <div key={phase.id} className="iw-sub">
                    <div className="iw-sub-h">{phase.label}</div>
                    <Checklist
                        compact
                        items={phase.items.map((label, index) => ({
                            id: `${phase.id}-${index}`,
                            label,
                        }))}
                        checks={checks}
                        onToggle={toggle}
                    />
                </div>
            ))}

            <Note tone={doneCount === allItems.length ? "ok" : "warn"}>
                三方共同核查并签名：手术医师、麻醉医师、手术室护士。
                护士发现「没标/标错」有权暂停手术。
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 输血：三查九对一确认                                                         */
/* -------------------------------------------------------------------------- */

const BLOOD_GROUPS = [
    {
        id: "check3",
        title: "三查",
        items: ["血的有效期", "血液质量", "输血装置是否完好"],
    },
    {
        id: "check9",
        title: "九对",
        items: [
            "床号",
            "姓名",
            "性别",
            "年龄",
            "住院号",
            "血型",
            "血袋号",
            "血液种类和剂量",
            "献血者编号",
        ],
    },
    {
        id: "confirm",
        title: "一确认",
        items: ["患者血型与交叉配血单一致，并签字"],
    },
];

export function BloodChecklistWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = state.checks ?? [];
    const allIds = BLOOD_GROUPS.flatMap((group) =>
        group.items.map((_, index) => `${group.id}-${index}`),
    );
    const doneCount = allIds.filter((id) => checks.includes(id)).length;

    const toggle = (id: string) => {
        const next = checks.includes(id)
            ? checks.filter((key) => key !== id)
            : [...checks, id];
        patch({
            checks: next,
            done: allIds.every((key) => next.includes(key))
                ? 1
                : (state.done ?? undefined),
        });
    };

    return (
        <WidgetShell hint="逐项核对，别漏了最容易被跳过的献血者编号">
            <div className="iw-progress-line">
                <span>
                    已核 {doneCount}/{allIds.length}
                </span>
                <div className="iw-bar">
                    <i
                        style={{
                            width: `${(doneCount / allIds.length) * 100}%`,
                        }}
                    />
                </div>
            </div>

            {BLOOD_GROUPS.map((group) => {
                const groupDone = group.items.filter((_, index) =>
                    checks.includes(`${group.id}-${index}`),
                ).length;
                return (
                    <div key={group.id} className="iw-sub">
                        <div className="iw-sub-h">
                            {group.title}
                            <em>
                                {groupDone}/{group.items.length}
                            </em>
                        </div>
                        <Checklist
                            compact
                            items={group.items.map((label, index) => ({
                                id: `${group.id}-${index}`,
                                label,
                            }))}
                            checks={checks}
                            onToggle={toggle}
                        />
                    </div>
                );
            })}

            <Note tone="warn">
                出库后 30 分钟内开始输注，4 小时内输完；输血前后用生理盐水冲管；
                血袋黄色垃圾袋包裹送回血库保留 24 小时。
            </Note>
        </WidgetShell>
    );
}

const BLOOD_PHASES = [
    {
        title: "① 采血",
        summary: "双人核对 · 床边两种以上身份核对",
        items: [
            "严禁从静脉输液通路直接采血",
            "严禁同时采集两个患者的血标本",
            "条形码贴交叉配血单，双签名后送检",
        ],
    },
    {
        title: "② 取血",
        summary: "血库与取血者、病区护士共同三查九对",
        items: [
            "三查：有效期、血液质量、输血装置",
            "九对：逐项核对",
            "无误后双签名",
        ],
    },
    {
        title: "③ 输血",
        summary: "双人交叉核对 · 先慢后快 · 全程观察",
        items: [
            "血袋内不得加入任何药物",
            "前后及两袋之间用生理盐水冲管",
            "开始 <20 滴/分，观察 15 分钟",
            "每袋 4 小时内输完，血袋保留 24 小时",
        ],
    },
];

export function BloodProcessWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const step = Math.min(state.step ?? 0, BLOOD_PHASES.length - 1);
    const phase = BLOOD_PHASES[step];

    return (
        <WidgetShell hint="采血 → 取血 → 输血，走完整个流程">
            <div className="iw-phase-tabs">
                {BLOOD_PHASES.map((item, index) => (
                    <button
                        type="button"
                        key={item.title}
                        className={`${index === step ? "on" : ""} ${
                            index < step ? "done" : ""
                        }`}
                        onClick={() =>
                            patch({
                                step: index,
                                ...(index >= BLOOD_PHASES.length - 1
                                    ? { done: 1 as const }
                                    : {}),
                            })
                        }
                    >
                        {index < step ? "✓ " : ""}
                        {item.title}
                    </button>
                ))}
            </div>

            <div className="iw-phase-card">
                <div className="iw-phase-title">{phase.summary}</div>
                <ul className="iw-phase-list">
                    {phase.items.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>

            <div className="iw-foot">
                <button
                    type="button"
                    className="iw-btn ghost sm"
                    onClick={() => patch({ step: 0 })}
                >
                    重来
                </button>
                <button
                    type="button"
                    className="iw-btn"
                    disabled={step >= BLOOD_PHASES.length - 1}
                    onClick={() =>
                        patch({
                            step: Math.min(BLOOD_PHASES.length - 1, step + 1),
                            ...(step + 1 >= BLOOD_PHASES.length - 1
                                ? { done: 1 as const }
                                : {}),
                        })
                    }
                >
                    {step >= BLOOD_PHASES.length - 1
                        ? "流程完成 ✓"
                        : "本阶段完成 →"}
                </button>
            </div>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 火灾 RACB：按顺序点                                                          */
/* -------------------------------------------------------------------------- */

const FIRE_ACTIONS: Record<
    string,
    { label: string; en: string; detail: string }
> = {
    R: { label: "救援", en: "Rescue", detail: "先救人，通知在场所有工作人员" },
    A: { label: "报警", en: "Alarm", detail: "119 讲清单位、楼层、部位、火势" },
    C: { label: "限制", en: "Confine", detail: "关闭邻近门窗，断电断氧" },
    B: {
        label: "灭火/疏散",
        en: "Evacuate",
        detail: "高层先撤、病重先撤、医护最后",
    },
};
const FIRE_ORDER = ["R", "A", "C", "B"];
const FIRE_DISPLAY = ["A", "R", "B", "C"];

export function FireWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const picked = (state.checks ?? []).filter((key) =>
        FIRE_ORDER.includes(key),
    );
    const [wrong, setWrong] = useState<string | null>(null);
    const next = FIRE_ORDER[picked.length];

    const pick = (letter: string) => {
        if (picked.includes(letter)) return;
        if (letter !== next) {
            setWrong(letter);
            window.setTimeout(() => setWrong(null), 650);
            return;
        }
        const updated = [...picked, letter];
        patch({
            checks: updated,
            done:
                updated.length === FIRE_ORDER.length
                    ? 1
                    : (state.done ?? undefined),
        });
    };

    return (
        <WidgetShell hint="按正确顺序点：R → A → C → B">
            <div className="iw-fire-progress">
                {FIRE_ORDER.map((letter, index) => (
                    <span
                        key={letter}
                        className={`${picked.includes(letter) ? "on" : ""} ${
                            index === picked.length ? "next" : ""
                        }`}
                    >
                        {picked.includes(letter) ? letter : index + 1}
                    </span>
                ))}
                <em>
                    已选 {picked.length}/{FIRE_ORDER.length}
                </em>
            </div>

            <div className="iw-fire-grid">
                {FIRE_DISPLAY.map((letter) => {
                    const action = FIRE_ACTIONS[letter];
                    const done = picked.includes(letter);
                    return (
                        <button
                            type="button"
                            key={letter}
                            className={`iw-fire ${done ? "done" : ""} ${
                                wrong === letter ? "wrong" : ""
                            } ${next === letter ? "next" : ""}`}
                            onClick={() => pick(letter)}
                            disabled={done}
                        >
                            <b>{letter}</b>
                            <span>{action.label}</span>
                            <small>{action.en}</small>
                            <em>{action.detail}</em>
                        </button>
                    );
                })}
            </div>

            <button
                type="button"
                className="iw-btn ghost sm"
                onClick={() => patch({ checks: [] })}
            >
                重来
            </button>

            <Note tone={picked.length === 4 ? "ok" : "warn"}>
                {picked.length === 4
                    ? "✓ RACB 完成：救、报、限、灭/撤。"
                    : "顺序不对会抖一下；想想先做什么，再报警、限制、灭火/疏散。"}
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 七步洗手法：一步一步点                                                       */
/* -------------------------------------------------------------------------- */

const HAND_STEPS = [
    { key: "内", desc: "掌心相对，手指并拢互相搓" },
    { key: "外", desc: "手心对手背，沿指缝搓" },
    { key: "夹", desc: "掌心相对，十指交叉搓" },
    { key: "弓", desc: "弯曲手指关节，在掌心旋转搓" },
    { key: "大", desc: "拇指握在掌心，旋转搓" },
    { key: "立", desc: "指尖并拢，在掌心搓" },
    { key: "腕", desc: "搓手腕，交换进行" },
];

export function HandsWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const step = Math.min(state.step ?? 0, HAND_STEPS.length - 1);
    const current = HAND_STEPS[step];

    return (
        <WidgetShell hint="七步洗手法，点步骤或按下一步">
            <div className="iw-hand">
                <div className="iw-hand-key">{current.key}</div>
                <div className="iw-hand-info">
                    <b>第 {step + 1} 步 / 7</b>
                    <span>{current.desc}</span>
                    <small>每步 ≥15 秒，来回 ≥5 次，全程 40–60 秒</small>
                </div>
            </div>

            <div className="iw-hand-steps">
                {HAND_STEPS.map((item, index) => (
                    <button
                        type="button"
                        key={item.key}
                        className={`${index === step ? "on" : ""} ${
                            index < step ? "done" : ""
                        }`}
                        onClick={() =>
                            patch({
                                step: index,
                                ...(index >= HAND_STEPS.length - 1
                                    ? { done: 1 as const }
                                    : {}),
                            })
                        }
                    >
                        {item.key}
                    </button>
                ))}
            </div>

            <div className="iw-foot">
                <button
                    type="button"
                    className="iw-btn ghost sm"
                    onClick={() => patch({ step: 0 })}
                >
                    重来
                </button>
                <button
                    type="button"
                    className="iw-btn"
                    disabled={step >= HAND_STEPS.length - 1}
                    onClick={() =>
                        patch({
                            step: Math.min(HAND_STEPS.length - 1, step + 1),
                            ...(step + 1 >= HAND_STEPS.length - 1
                                ? { done: 1 as const }
                                : {}),
                        })
                    }
                >
                    {step >= HAND_STEPS.length - 1 ? "七步完成 ✓" : "下一步 →"}
                </button>
            </div>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 手卫生五时刻                                                                 */
/* -------------------------------------------------------------------------- */

const MOMENT_ITEMS = [
    { id: "before", label: "接触患者前", sub: "如握手、查体、协助翻身" },
    { id: "aseptic", label: "清洁/无菌操作前", sub: "如换药、导尿、穿刺" },
    { id: "body", label: "接触体液、血液、分泌物后", sub: "如吸痰、换尿袋" },
    { id: "after", label: "接触患者后", sub: "即使只是扶了一下" },
    {
        id: "around",
        label: "接触患者周围物品后",
        sub: "床栏、床头柜、监护仪按钮",
    },
];

export function MomentsWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = state.checks ?? [];
    const count = MOMENT_ITEMS.filter((item) =>
        checks.includes(item.id),
    ).length;

    const toggle = (id: string) => {
        const next = checks.includes(id)
            ? checks.filter((key) => key !== id)
            : [...checks, id];
        patch({
            checks: next,
            done:
                next.length === MOMENT_ITEMS.length
                    ? 1
                    : (state.done ?? undefined),
        });
    };

    return (
        <WidgetShell hint="点出你认为要洗手的时刻">
            <div className="iw-moments">
                <div className="iw-moment-hub">
                    <span>🧑‍⚕️</span>
                    <b>患者</b>
                    <small>两前三后</small>
                </div>
                <div className="iw-moment-list">
                    {MOMENT_ITEMS.map((item, index) => {
                        const on = checks.includes(item.id);
                        return (
                            <button
                                type="button"
                                key={item.id}
                                className={`iw-moment ${on ? "on" : ""}`}
                                onClick={() => toggle(item.id)}
                                aria-pressed={on}
                            >
                                <span className="iw-moment-num">
                                    {on ? "✓" : index + 1}
                                </span>
                                <span>
                                    <b>{item.label}</b>
                                    <small>{item.sub}</small>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <Note tone={count === MOMENT_ITEMS.length ? "ok" : "warn"}>
                {count === MOMENT_ITEMS.length
                    ? "✓ 五个时刻都记住了；「接触周围物品后」最容易被漏掉。"
                    : `已找到 ${count}/5 个时刻，注意床栏、床头柜也算「周围物品」。`}
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 麻精药品五专                                                                 */
/* -------------------------------------------------------------------------- */

const LOCK_ITEMS = ["专人", "专柜", "专锁", "专册登记", "专用处方"];

export function LocksWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = state.checks ?? [];
    const allOn = LOCK_ITEMS.every((_, index) =>
        checks.includes(`lock-${index}`),
    );

    const toggle = (id: string) => {
        const next = checks.includes(id)
            ? checks.filter((key) => key !== id)
            : [...checks, id];
        patch({
            checks: next,
            done: LOCK_ITEMS.every((_, index) => next.includes(`lock-${index}`))
                ? 1
                : (state.done ?? undefined),
        });
    };

    return (
        <WidgetShell hint="把五把锁都扣上">
            <div className="iw-locks">
                {LOCK_ITEMS.map((label, index) => {
                    const id = `lock-${index}`;
                    const on = checks.includes(id);
                    return (
                        <button
                            type="button"
                            key={id}
                            className={`iw-lock ${on ? "on" : ""}`}
                            onClick={() => toggle(id)}
                            aria-pressed={on}
                        >
                            <span className="iw-lock-icon">
                                {on ? "🔒" : "🔓"}
                            </span>
                            <b>{label}</b>
                        </button>
                    );
                })}
            </div>

            <Note tone={allOn ? "ok" : "warn"}>
                {allOn
                    ? "✓ 五专齐全：保险箱双人双锁、每班清点、双签名。"
                    : "五专一个都不能少：人、柜、锁、册、方。"}
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 抢救车四固定                                                                 */
/* -------------------------------------------------------------------------- */

const CART_ITEMS = ["定人保管", "定点放置", "定数量品种", "定期维修及消毒灭菌"];

export function CartWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const checks = state.checks ?? [];
    const allOn = CART_ITEMS.every((_, index) =>
        checks.includes(`cart-${index}`),
    );

    const toggle = (id: string) => {
        const next = checks.includes(id)
            ? checks.filter((key) => key !== id)
            : [...checks, id];
        patch({
            checks: next,
            done: CART_ITEMS.every((_, index) => next.includes(`cart-${index}`))
                ? 1
                : (state.done ?? undefined),
        });
    };

    return (
        <WidgetShell hint="点齐四个固定，抢救车才算到位">
            <div className="iw-cart">
                <div className={`iw-cart-box ${allOn ? "on" : ""}`}>
                    <span>🚑</span>
                    <b>抢救车</b>
                    <small>{allOn ? "封条完好 ✓" : "待检查"}</small>
                </div>
                <div className="iw-cart-grid">
                    {CART_ITEMS.map((label, index) => {
                        const id = `cart-${index}`;
                        const on = checks.includes(id);
                        return (
                            <button
                                type="button"
                                key={id}
                                className={`iw-cart-item ${on ? "on" : ""}`}
                                onClick={() => toggle(id)}
                                aria-pressed={on}
                            >
                                <span>{on ? "✓" : index + 1}</span>
                                <b>{label}</b>
                            </button>
                        );
                    })}
                </div>
            </div>

            <Note tone={allOn ? "ok" : "warn"}>
                {allOn
                    ? "✓ 四固定完成；用后及时补充、班班交接。"
                    : "四固定：人、点、量、修——不是「五定」，按本院说法答题。"}
            </Note>
        </WidgetShell>
    );
}

/* -------------------------------------------------------------------------- */
/* 心肺复苏：节拍器                                                             */
/* -------------------------------------------------------------------------- */

export function CprWidget({ card }: { card: Card }) {
    const { state, patch } = useWidgetState(card.id);
    const bpm = state.value ?? 110;
    const [running, setRunning] = useState(false);
    const [beats, setBeats] = useState(0);

    useEffect(() => {
        if (!running) return;
        const timer = window.setInterval(() => {
            setBeats((count) => count + 1);
            if (typeof navigator !== "undefined" && navigator.vibrate) {
                navigator.vibrate(12);
            }
        }, 60000 / bpm);
        return () => window.clearInterval(timer);
    }, [running, bpm]);

    const cycle = beats % 30;
    const cycleCount = Math.floor(beats / 30);

    return (
        <WidgetShell hint="跟着节拍按：100–120 次/分，30:2">
            <div className="iw-cpr">
                <div className={`iw-cpr-heart ${running ? "on" : ""}`}>
                    <span>❤️</span>
                </div>
                <div className="iw-cpr-info">
                    <ScoreBox
                        value={bpm}
                        unit="次/分"
                        label={running ? "按压中" : "待开始"}
                        tone={running ? "ok" : undefined}
                    />
                    <div className="iw-cpr-count">
                        <b>{beats}</b> 次按压
                        <span>
                            第 {cycleCount + 1} 轮 · 本轮 {cycle}/30
                        </span>
                    </div>
                    <div className="iw-cpr-btns">
                        <button
                            type="button"
                            className="iw-btn"
                            onClick={() => {
                                setRunning((value) => !value);
                                if (!running) patch({ done: 1 });
                            }}
                        >
                            {running ? "暂停" : "开始按压"}
                        </button>
                        <button
                            type="button"
                            className="iw-btn ghost"
                            onClick={() => {
                                setRunning(false);
                                setBeats(0);
                            }}
                        >
                            归零
                        </button>
                    </div>
                </div>
            </div>

            <div className="iw-dim">
                <span>频率</span>
                <input
                    className="iw-range"
                    type="range"
                    min={100}
                    max={120}
                    step={1}
                    value={bpm}
                    onChange={(event) =>
                        patch({
                            value: Number(event.target.value),
                            done: state.done ?? undefined,
                        })
                    }
                    aria-label="按压频率"
                />
                <em>{bpm}</em>
            </div>

            <Note tone={cycle === 29 && running ? "bad" : "warn"}>
                {cycle === 29 && running
                    ? "30 次到了 → 2 次通气，然后继续按压。"
                    : "按压深度 5–6cm，频率 100–120 次/分，按压:通气 = 30:2。"}
            </Note>
        </WidgetShell>
    );
}
