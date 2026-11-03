/**
 * 《除颤时刻》的静态数据，全部是纯数据，方便单元测试。
 *
 * 坐标约定：Y 向上，+Z 是身体正面，患者的右侧在 -X（面对模型时在屏幕左侧）。
 */

export type Vec3 = [number, number, number];

export type LeadId = "white" | "black" | "green" | "red" | "brown";

export type LeadDef = {
    id: LeadId;
    /** 中文颜色，用于界面文案 */
    name: string;
    /** 导联代号，例如 RA / LA */
    code: string;
    color: string;
    /** 正确贴放的体表定位点 id */
    targetZone: string;
    /** 正确位置的短名称 */
    targetLabel: string;
    /** 结果页使用的定位说明 */
    hint: string;
};

export const LEAD_DEFS: LeadDef[] = [
    {
        id: "white",
        name: "白色",
        code: "RA",
        color: "#f8fafc",
        targetZone: "lead-right-clavicle",
        targetLabel: "右锁骨下",
        hint: "白色（RA）贴在右锁骨下，靠近右肩。",
    },
    {
        id: "black",
        name: "黑色",
        code: "LA",
        color: "#0f172a",
        targetZone: "lead-left-clavicle",
        targetLabel: "左锁骨下",
        hint: "黑色（LA）贴在左锁骨下，靠近左肩。",
    },
    {
        id: "green",
        name: "绿色",
        code: "RL",
        color: "#34d399",
        targetZone: "lead-right-lower-abdomen",
        targetLabel: "右下腹",
        hint: "绿色（RL）贴在右下腹。",
    },
    {
        id: "red",
        name: "红色",
        code: "LL",
        color: "#fb7185",
        targetZone: "lead-left-lower-abdomen",
        targetLabel: "左下腹",
        hint: "红色（LL）贴在左下腹。",
    },
    {
        id: "brown",
        name: "棕色",
        code: "C",
        color: "#b45309",
        targetZone: "lead-chest",
        targetLabel: "胸部",
        hint: "棕色（C）贴在胸部胸导联位置。",
    },
];

export type BodyZone = {
    id: string;
    label: string;
    position: Vec3;
    /** 定位环朝向；默认面向 +Z 的身体正面 */
    rotation?: Vec3;
    hitRadius?: number;
    /** 该定位点对应的正确导联 */
    lead?: LeadId;
};

export const LEAD_ZONES: BodyZone[] = [
    {
        id: "lead-right-clavicle",
        label: "右锁骨下",
        position: [-0.3, 1.49, 0.25],
        rotation: [0, -0.15, 0],
        hitRadius: 0.13,
        lead: "white",
    },
    {
        id: "lead-left-clavicle",
        label: "左锁骨下",
        position: [0.3, 1.49, 0.25],
        rotation: [0, 0.15, 0],
        hitRadius: 0.13,
        lead: "black",
    },
    {
        id: "zone-right-shoulder",
        label: "右肩",
        position: [-0.54, 1.52, 0.08],
        rotation: [0, -0.95, 0],
        hitRadius: 0.14,
    },
    {
        id: "zone-left-shoulder",
        label: "左肩",
        position: [0.54, 1.52, 0.08],
        rotation: [0, 0.95, 0],
        hitRadius: 0.14,
    },
    {
        id: "lead-chest",
        label: "胸部（胸导联）",
        position: [0.12, 1.06, 0.3],
        rotation: [0, 0.04, 0],
        hitRadius: 0.14,
        lead: "brown",
    },
    {
        id: "zone-epigastric",
        label: "上腹（剑突下）",
        position: [0, 0.97, 0.27],
        hitRadius: 0.13,
    },
    {
        id: "lead-right-lower-abdomen",
        label: "右下腹",
        position: [-0.24, 0.66, 0.2],
        rotation: [0, -0.12, 0],
        hitRadius: 0.13,
        lead: "green",
    },
    {
        id: "lead-left-lower-abdomen",
        label: "左下腹",
        position: [0.24, 0.66, 0.2],
        rotation: [0, 0.12, 0],
        hitRadius: 0.13,
        lead: "red",
    },
    {
        id: "zone-umbilicus",
        label: "脐部",
        position: [0, 0.78, 0.24],
        hitRadius: 0.12,
    },
    {
        id: "zone-right-flank",
        label: "右侧腰",
        position: [-0.4, 0.8, 0.1],
        rotation: [0, -1.2, 0],
        hitRadius: 0.13,
    },
    {
        id: "zone-left-flank",
        label: "左侧腰",
        position: [0.4, 0.8, 0.1],
        rotation: [0, 1.2, 0],
        hitRadius: 0.13,
    },
];

export type PadTarget = {
    id: string;
    label: string;
    position: Vec3;
    rotation: Vec3;
};

export const PAD_TARGETS: PadTarget[] = [
    {
        id: "pad-right-2ics",
        label: "右锁骨中线第 2 肋间",
        position: [-0.27, 1.36, 0.27],
        rotation: [0, -0.12, 0],
    },
    {
        id: "pad-left-5ics",
        label: "左腋前线第 5 肋间",
        position: [0.4, 1.0, 0.1],
        rotation: [0, 1.15, 0],
    },
];

export const PAD_ZONES: BodyZone[] = [
    ...PAD_TARGETS.map((target) => ({
        id: target.id,
        label: target.label,
        position: target.position,
        rotation: target.rotation,
        hitRadius: 0.17,
    })),
    {
        id: "pad-zone-sternum",
        label: "胸骨正中",
        position: [0, 1.34, 0.31],
        hitRadius: 0.17,
    },
    {
        id: "pad-zone-right-apex",
        label: "右侧胸壁（心尖方向）",
        position: [-0.4, 1.0, 0.1],
        rotation: [0, -1.15, 0],
        hitRadius: 0.16,
    },
    {
        id: "pad-zone-left-clavicle",
        label: "左锁骨下",
        position: [0.3, 1.49, 0.25],
        rotation: [0, 0.15, 0],
        hitRadius: 0.15,
    },
    {
        id: "pad-zone-right-shoulder",
        label: "右肩",
        position: [-0.54, 1.52, 0.08],
        rotation: [0, -0.95, 0],
        hitRadius: 0.14,
    },
    {
        id: "pad-zone-left-shoulder",
        label: "左肩",
        position: [0.54, 1.52, 0.08],
        rotation: [0, 0.95, 0],
        hitRadius: 0.14,
    },
];

export type ShockStepId = "charge" | "clear" | "shock";

export type ShockStep = {
    id: ShockStepId;
    label: string;
    detail: string;
};

/** 正确的除颤顺序，不要调换 */
export const SHOCK_STEPS: ShockStep[] = [
    {
        id: "charge",
        label: "充电",
        detail: "把除颤仪充到选定能量（双相 120–200 J）",
    },
    {
        id: "clear",
        label: "所有人离开",
        detail: "确认没有人接触患者和床沿",
    },
    {
        id: "shock",
        label: "放电",
        detail: "按下放电键，随后立即恢复胸外按压",
    },
];

export const SHOCK_ORDER_LABEL = "充电 → 所有人离开 → 放电";

export function getLead(id: LeadId): LeadDef {
    return LEAD_DEFS.find((lead) => lead.id === id) ?? LEAD_DEFS[0];
}

export function getLeadZone(id: LeadId): BodyZone | undefined {
    return LEAD_ZONES.find((zone) => zone.lead === id);
}
