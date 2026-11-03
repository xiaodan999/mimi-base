/**
 * 《皮肤之下》的剖面几何常量。
 *
 * 这里只放纯数据，不 import three / React，方便 cases 和 bun test 使用。
 * 单位是场景单位，不是真实厘米；真实深度写在病例的探针读数里。
 */

export type LayerId = "bone" | "muscle" | "fat" | "dermis" | "epidermis";

export type SkinLayer = {
    id: LayerId;
    name: string;
    /** 图例里的短说明 */
    note: string;
    /** 层底 / 层顶的 Y 坐标 */
    y0: number;
    y1: number;
    color: string;
    edge: string;
};

export const SKIN_WIDTH = 5.6;
export const SKIN_DEPTH = 2.8;

/** 从下往上：骨面 → 肌肉 → 皮下脂肪 → 真皮 → 表皮 */
export const SKIN_LAYERS: SkinLayer[] = [
    {
        id: "bone",
        name: "骨面",
        note: "Ⅳ期可暴露，警惕骨髓炎",
        y0: 0,
        y1: 0.34,
        color: "#e9e4d8",
        edge: "#a8a29e",
    },
    {
        id: "muscle",
        name: "肌肉",
        note: "血供丰富，损伤后易出血",
        y0: 0.34,
        y1: 1.12,
        color: "#c05252",
        edge: "#7f1d1d",
    },
    {
        id: "fat",
        name: "皮下脂肪",
        note: "Ⅲ期创底，常呈黄色",
        y0: 1.12,
        y1: 1.92,
        color: "#efc75e",
        edge: "#a16207",
    },
    {
        id: "dermis",
        name: "真皮",
        note: "Ⅱ期可部分缺损",
        y0: 1.92,
        y1: 2.42,
        color: "#ef9fb6",
        edge: "#be185d",
    },
    {
        id: "epidermis",
        name: "表皮",
        note: "先看完整与否，再谈深度",
        y0: 2.42,
        y1: 2.58,
        color: "#f8c9da",
        edge: "#db2777",
    },
];

export const SKIN_TOP = SKIN_LAYERS[SKIN_LAYERS.length - 1].y1;

export function layerById(id: LayerId): SkinLayer {
    const layer = SKIN_LAYERS.find((item) => item.id === id);
    if (!layer) throw new Error(`未知皮肤层：${id}`);
    return layer;
}

/** 某一层内部按比例取一个 Y，offset 0 = 层底，1 = 层顶 */
export function floorYAt(id: LayerId, offset: number): number {
    const layer = layerById(id);
    return layer.y0 + (layer.y1 - layer.y0) * offset;
}

export const BASE_TISSUE_COLORS: Record<LayerId, string> = {
    bone: "#f1ece1",
    muscle: "#b91c1c",
    fat: "#f0c04f",
    dermis: "#e26d8e",
    epidermis: "#f3b3c8",
};

export type BruiseKind = "erythema" | "deep";

export type WoundProfile = {
    /** 创口在 X 方向的半宽；0 表示皮肤完整、没有开放创面 */
    surfaceHole: number;
    /** 创底半宽，可大于创口，做出潜行/窦道 */
    baseHole: number;
    /** 创底所在 Y；等于 SKIN_TOP 表示没有破口 */
    floorY: number;
    /** 创底最深处的组织 */
    baseLayer: LayerId;
    /** 焦痂覆盖，深度不可判断 */
    eschar?: boolean;
    /** 腐肉/渗液程度 0..1 */
    slough?: number;
    /** 完整皮肤上的红斑 / 深部紫斑 */
    bruise?: BruiseKind | null;
    /** 旁边是否有未破的水疱 */
    blister?: boolean;
    boneExposed?: boolean;
    tendonExposed?: boolean;
    /** 是否存在潜行/窦道（视觉上创底比创口宽） */
    undermining?: boolean;
    /** 探针读数里的深度文案 */
    depthLabel: string;
};

/** 病例共用的剖面尺寸说明，给 DOM 图例用 */
export const LAYER_COUNT = SKIN_LAYERS.length;
