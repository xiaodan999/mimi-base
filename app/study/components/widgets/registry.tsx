import { Suspense, lazy, type ComponentType, type ElementType } from "react";

import type { Card } from "../../types";

export type WidgetComponent = ComponentType<{ card: Card }>;

/**
 * 每个互动 widget 都拆成独立的按需 chunk：打开一张知识卡只下载它用到的
 * 那一个组件，而不是把三个文件 ~2650 行全部静态拖进来。
 * 渲染方（CardDemo）会把这些 lazy 组件包在 Suspense 里。
 */
const anatomy = (name: string) =>
    lazy(() =>
        import("./AnatomyWidgets").then((m) => ({
            default: (m as Record<string, WidgetComponent>)[name],
        })),
    );
const procedure = (name: string) =>
    lazy(() =>
        import("./ProcedureWidgets").then((m) => ({
            default: (m as Record<string, WidgetComponent>)[name],
        })),
    );
const vitals = (name: string) =>
    lazy(() =>
        import("./VitalsWidgets").then((m) => ({
            default: (m as Record<string, WidgetComponent>)[name],
        })),
    );

/** 输血有两张卡：c26 走全流程，其余走查对清单 */
const BloodProcessWidget = procedure("BloodProcessWidget");
const BloodChecklistWidget = procedure("BloodChecklistWidget");

function WidgetFallback() {
    return <div className="iw st-tiny">互动加载中…</div>;
}

function BloodWidget({ card }: { card: Card }) {
    const Widget =
        card.id === "c26" ? BloodProcessWidget : BloodChecklistWidget;
    return (
        <Suspense fallback={<WidgetFallback />}>
            <Widget card={card} />
        </Suspense>
    );
}

export const WIDGETS: Record<string, ElementType> = {
    wristband: procedure("WristbandWidget"),
    surgery3: procedure("SurgeryWidget"),
    gauge: vitals("GaugeWidget"),
    flow: procedure("FlowWidget"),
    fall: vitals("FallWidget"),
    braden: vitals("BradenWidget"),
    skin: anatomy("SkinWidget"),
    clock2h: vitals("ClockWidget"),
    pain: vitals("PainWidget"),
    hands: procedure("HandsWidget"),
    moments: procedure("MomentsWidget"),
    blood: BloodWidget,
    fire: procedure("FireWidget"),
    ecg: anatomy("EcgWidget"),
    defib: anatomy("DefibWidget"),
    breath: anatomy("BreathWidget"),
    fridge: vitals("FridgeWidget"),
    adl: vitals("AdlWidget"),
    locks: procedure("LocksWidget"),
    cart: procedure("CartWidget"),
    cpr: procedure("CprWidget"),
};
