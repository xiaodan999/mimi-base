import type { ComponentType } from "react";

import {
    BreathWidget,
    DefibWidget,
    EcgWidget,
    SkinWidget,
} from "./AnatomyWidgets";
import {
    BloodChecklistWidget,
    BloodProcessWidget,
    CartWidget,
    CprWidget,
    FireWidget,
    FlowWidget,
    HandsWidget,
    LocksWidget,
    MomentsWidget,
    SurgeryWidget,
    WristbandWidget,
} from "./ProcedureWidgets";
import {
    AdlWidget,
    BradenWidget,
    ClockWidget,
    FallWidget,
    FridgeWidget,
    GaugeWidget,
    PainWidget,
} from "./VitalsWidgets";
import type { Card } from "../../types";

export type WidgetComponent = ComponentType<{ card: Card }>;

/** 输血有两张卡：c25 查对清单，c26 全流程 */
function BloodWidget({ card }: { card: Card }) {
    return card.id === "c26" ? (
        <BloodProcessWidget card={card} />
    ) : (
        <BloodChecklistWidget card={card} />
    );
}

export const WIDGETS: Record<string, WidgetComponent> = {
    wristband: WristbandWidget,
    surgery3: SurgeryWidget,
    gauge: GaugeWidget,
    flow: FlowWidget,
    fall: FallWidget,
    braden: BradenWidget,
    skin: SkinWidget,
    clock2h: ClockWidget,
    pain: PainWidget,
    hands: HandsWidget,
    moments: MomentsWidget,
    blood: BloodWidget,
    fire: FireWidget,
    ecg: EcgWidget,
    defib: DefibWidget,
    breath: BreathWidget,
    fridge: FridgeWidget,
    adl: AdlWidget,
    locks: LocksWidget,
    cart: CartWidget,
    cpr: CprWidget,
};
