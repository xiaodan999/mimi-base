import type { ReactNode } from "react";

export type WidgetOption = {
    id: string;
    label: string;
    sub?: string;
};

/** 每个互动演示的统一外壳 */
export function WidgetShell({
    hint,
    children,
}: {
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="iw">
            <div className="iw-top">
                <span className="iw-badge">✨ 可交互</span>
                {hint && <span className="iw-hint">{hint}</span>}
            </div>
            {children}
        </div>
    );
}

export function ChipRow({
    options,
    value,
    onPick,
    wrap = true,
}: {
    options: WidgetOption[];
    value?: string;
    onPick: (id: string) => void;
    wrap?: boolean;
}) {
    return (
        <div className={wrap ? "iw-chips wrap" : "iw-chips"}>
            {options.map((option) => (
                <button
                    type="button"
                    key={option.id}
                    className={`iw-chip ${value === option.id ? "on" : ""}`}
                    onClick={() => onPick(option.id)}
                    aria-pressed={value === option.id}
                >
                    <span>{option.label}</span>
                    {option.sub && <small>{option.sub}</small>}
                </button>
            ))}
        </div>
    );
}

export type CheckItem = {
    id: string;
    label: string;
    sub?: string;
    tone?: "warn" | "bad";
};

export function Checklist({
    items,
    checks,
    onToggle,
    compact = false,
}: {
    items: CheckItem[];
    checks: string[];
    onToggle: (id: string) => void;
    compact?: boolean;
}) {
    const picked = new Set(checks);
    return (
        <div className={`iw-checks ${compact ? "compact" : ""}`}>
            {items.map((item) => {
                const on = picked.has(item.id);
                return (
                    <button
                        type="button"
                        key={item.id}
                        className={`iw-check ${on ? "on" : ""} ${
                            item.tone ? `t-${item.tone}` : ""
                        }`}
                        onClick={() => onToggle(item.id)}
                        aria-pressed={on}
                    >
                        <span className="iw-check-box">{on ? "✓" : ""}</span>
                        <span className="iw-check-txt">
                            <span
                                dangerouslySetInnerHTML={{
                                    __html: item.label,
                                }}
                            />
                            {item.sub && <small>{item.sub}</small>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** 通用纵向流程：点任意一步跳过去，也可以按下一步 */
export function StepList({
    steps,
    step,
    onStep,
}: {
    steps: string[];
    step: number;
    onStep: (step: number) => void;
}) {
    const last = steps.length - 1;
    return (
        <>
            <div className="iw-bar">
                <i
                    style={{
                        width: `${((Math.min(step, last) + 1) / steps.length) * 100}%`,
                    }}
                />
            </div>
            <ol className="iw-steps">
                {steps.map((text, i) => {
                    const state = i < step ? "done" : i === step ? "on" : "";
                    return (
                        <li key={i} className={`iw-step ${state}`}>
                            <button type="button" onClick={() => onStep(i)}>
                                <span className="iw-step-dot">
                                    {i < step ? "✓" : i + 1}
                                </span>
                                <span
                                    className="iw-step-txt"
                                    dangerouslySetInnerHTML={{ __html: text }}
                                />
                            </button>
                        </li>
                    );
                })}
            </ol>
            <div className="iw-foot">
                <button
                    type="button"
                    className="iw-btn ghost sm"
                    onClick={() => onStep(0)}
                >
                    重来
                </button>
                <button
                    type="button"
                    className="iw-btn"
                    disabled={step >= last}
                    onClick={() => onStep(Math.min(last, step + 1))}
                >
                    {step >= last ? "流程完成 ✓" : "下一步 →"}
                </button>
            </div>
        </>
    );
}

export function ScoreBox({
    value,
    unit,
    label,
    tone,
}: {
    value: ReactNode;
    unit?: string;
    label: string;
    tone?: "ok" | "warn" | "bad";
}) {
    return (
        <div className={`iw-score ${tone ?? ""}`}>
            <div>
                <b>{value}</b>
                {unit && <small>{unit}</small>}
            </div>
            <span>{label}</span>
        </div>
    );
}

export function Segmented({
    options,
    value,
    onChange,
}: {
    options: number[];
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <div className="iw-seg">
            {options.map((option) => (
                <button
                    type="button"
                    key={option}
                    className={option === value ? "on" : ""}
                    onClick={() => onChange(option)}
                    aria-pressed={option === value}
                >
                    {option}
                </button>
            ))}
        </div>
    );
}

export function Note({
    children,
    tone,
}: {
    children: ReactNode;
    tone?: "ok" | "warn" | "bad";
}) {
    return <div className={`iw-note ${tone ?? ""}`}>{children}</div>;
}
