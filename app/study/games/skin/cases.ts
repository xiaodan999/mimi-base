/**
 * 《皮肤之下》的六个压疮病例。
 *
 * 分期与处理依据知识卡 c13（压疮分期与处理 6 期），风险评估关联 c11
 *（Braden 评分）。所有文案只用于教学模拟，临床执行以医院制度为准。
 */

import {
    type BruiseKind,
    floorYAt,
    SKIN_TOP,
    type WoundProfile,
} from "./anatomy";

export type StageKey = "1" | "2" | "3" | "4" | "u" | "d";

export type StageOption = {
    key: StageKey;
    /** 选项上的短标签 */
    label: string;
    /** 分期全名 */
    full: string;
    /** 关键表现，帮助记忆 */
    hint: string;
};

/** 顺序固定为 Ⅰ → Ⅳ → 不可分期 → DTPI，和知识卡一致 */
export const STAGE_OPTIONS: StageOption[] = [
    {
        key: "1",
        label: "Ⅰ期",
        full: "Ⅰ期 · 淤血红润期",
        hint: "淤血红润期 · 皮肤完整，指压不变白红斑",
    },
    {
        key: "2",
        label: "Ⅱ期",
        full: "Ⅱ期 · 炎性浸润期",
        hint: "炎性浸润期 · 部分皮层缺损，浅表溃疡或水疱",
    },
    {
        key: "3",
        label: "Ⅲ期",
        full: "Ⅲ期 · 浅度溃疡期",
        hint: "浅度溃疡期 · 全层缺损至皮下脂肪，未及筋膜",
    },
    {
        key: "4",
        label: "Ⅳ期",
        full: "Ⅳ期 · 坏死溃疡期",
        hint: "坏死溃疡期 · 全层缺损，骨 / 肌腱 / 肌肉暴露",
    },
    {
        key: "u",
        label: "不可分期",
        full: "不可分期",
        hint: "腐肉或焦痂覆盖，无法判断深度",
    },
    {
        key: "d",
        label: "深部组织损伤",
        full: "深部组织损伤（DTPI）",
        hint: "皮肤可完整，深层暗紫 / 硬结 / 疼痛",
    },
];

export const STAGE_LABELS: Record<StageKey, string> = {
    "1": "Ⅰ期",
    "2": "Ⅱ期",
    "3": "Ⅲ期",
    "4": "Ⅳ期",
    u: "不可分期",
    d: "深部组织损伤",
};

export function stageOption(key: StageKey): StageOption {
    return STAGE_OPTIONS.find((item) => item.key === key) ?? STAGE_OPTIONS[0];
}

/* ---------------- 处理方案 ---------------- */

export type TreatmentId =
    | "protect"
    | "blister"
    | "debride"
    | "debrideStage"
    | "observe"
    | "massage"
    | "dry"
    | "iodine"
    | "graft";

export type TreatmentDef = {
    id: TreatmentId;
    /** 选项完整文案 */
    text: string;
    /** 结算复盘用的短名 */
    short: string;
    /** 选错时的通用解释 */
    why: string;
};

export const TREATMENTS: Record<TreatmentId, TreatmentDef> = {
    protect: {
        id: "protect",
        text: "解除压力 + 保湿保护，水胶体 / 泡沫敷料",
        short: "减压 + 保湿保护",
        why: "先解除受压和剪切力，再用敷料保护皮肤或创面，维持湿性愈合环境。",
    },
    blister: {
        id: "blister",
        text: "消毒后抽吸水疱 + 保护创面（水胶体 / 泡沫）",
        short: "抽吸水疱 + 保护",
        why: "Ⅱ期水疱 >5 mm 可在消毒后用针头刺破抽吸，保留疱皮，再覆盖敷料；<5 mm 多可自行吸收。",
    },
    debride: {
        id: "debride",
        text: "清创 + 控感染 + 吸渗液 + 促肉芽 / 上皮（TIME）",
        short: "清创 + 渗液管理",
        why: "按 TIME 原则处理创面床：清除坏死组织、控制感染、管理渗液、保护创缘促进上皮。",
    },
    debrideStage: {
        id: "debrideStage",
        text: "先清创去除腐肉 / 焦痂，再重新分期处理",
        short: "清创后再分期",
        why: "腐肉或焦痂遮住真实深度，清创后重新评估分期，再按新分期选择敷料。",
    },
    observe: {
        id: "observe",
        text: "解除压力 / 剪切力 + 密切观察 + 保护完整皮肤",
        short: "减压 + 观察保护",
        why: "皮肤可能完整，禁止按摩；持续减压、减少剪切力，每班观察颜色、温度、硬度变化。",
    },
    massage: {
        id: "massage",
        text: "局部按摩受压部位，促进血液循环",
        short: "按摩受压部位",
        why: "受压部位已经缺血，按摩会加重组织损伤和疼痛，骨突处禁止按摩。",
    },
    dry: {
        id: "dry",
        text: "保持创面干燥并暴露，每日更换纱布",
        short: "干燥暴露",
        why: "干燥暴露会让创面脱水、上皮迁移变慢，也增加污染风险；应保持湿性愈合环境。",
    },
    iodine: {
        id: "iodine",
        text: "只用碘伏消毒，暂不解除压力",
        short: "只消毒不减压",
        why: "不解除压力就没有解决病因；碘伏还可能刺激创面、影响上皮生长。",
    },
    graft: {
        id: "graft",
        text: "立即手术植皮，不做创面床准备",
        short: "直接植皮",
        why: "感染、渗液和坏死组织未处理时植皮难以成活；先按 TIME 准备创面床。",
    },
};

/* ---------------- 病例 ---------------- */

export type ProbeReading = {
    tissue: string;
    note: string;
    depth: string;
};

export type SkinCase = {
    id: string;
    title: string;
    /** 部位，例如骶尾部 / 右足跟 */
    region: string;
    scenario: string;
    /** 3D 剖面里应该看到什么，给不能操作 3D 的同学 */
    visual: string;
    stage: StageKey;
    stageWhy: string;
    correctTreatment: TreatmentId;
    treatmentWhy: string;
    /** 四个处理选项，含正确项；开局会打乱顺序 */
    treatmentOptions: TreatmentId[];
    /** 选错时的针对性解释；没写则回落到处理的通用 why */
    wrongWhys: Partial<Record<TreatmentId, string>>;
    probe: ProbeReading;
    wound: WoundProfile;
};

const completeSkin = (
    baseLayer: WoundProfile["baseLayer"],
    bruise: BruiseKind | null,
    depthLabel: string,
): WoundProfile => ({
    surfaceHole: 0,
    baseHole: 0,
    floorY: SKIN_TOP,
    baseLayer,
    bruise,
    depthLabel,
});

export const SKIN_CASES: SkinCase[] = [
    {
        id: "case-1",
        title: "骶尾部的红斑",
        region: "骶尾部",
        scenario:
            "78 岁女性，脑梗死后卧床 2 周。骶尾部 3 cm × 2 cm 红斑，皮肤完整，指压后不褪色；局部皮温略高，患者诉压痛。Braden 评分 12 分。",
        visual: "剖面顶部完整，没有破口；受压区一片红色，指压后不褪色，周围皮肤正常。",
        stage: "1",
        stageWhy:
            "皮肤完整、出现指压不变白的红斑，是 Ⅰ期（淤血红润期）；此时还没有表皮缺损。",
        correctTreatment: "protect",
        treatmentWhy:
            "Ⅰ期皮肤完整，关键是解除压力并保护：水胶体 / 泡沫敷料可减少摩擦剪切、改善局部微环境；每班观察红斑是否扩大。",
        treatmentOptions: ["protect", "massage", "dry", "iodine"],
        wrongWhys: {
            massage:
                "Ⅰ期红斑区已经缺血，按摩会加重局部损伤和疼痛；骨突处禁止按摩。",
            dry: "保持干燥会让表皮更脆弱、增加摩擦损伤；Ⅰ期需要保湿保护和减压。",
            iodine: "碘伏消毒不能替代减压，还会刺激完整皮肤；Ⅰ期没有开放创面，不需要消毒。",
        },
        probe: {
            tissue: "完整表皮，无明显渗液",
            note: "探针不能进入：没有开放创面。重点看指压是否变白。",
            depth: "0 cm（皮肤完整）",
        },
        wound: completeSkin("epidermis", "erythema", "0 cm（皮肤完整）"),
    },
    {
        id: "case-2",
        title: "足跟的水疱",
        region: "右足跟",
        scenario:
            "72 岁男性，糖尿病，右足跟 2 cm 水疱，部分破溃。创面浅表、粉红、湿润，无腐肉；周围皮肤完整。",
        visual: "表皮缺了一小片，创底是粉色真皮；旁边还有一颗未破的水疱。",
        stage: "2",
        stageWhy:
            "表皮 / 部分真皮缺损，形成浅表开放创面或水疱，且没有腐肉，属于 Ⅱ期（炎性浸润期）。",
        correctTreatment: "blister",
        treatmentWhy:
            "水疱 >5 mm：消毒后在边缘用针头刺破抽吸，保留疱皮作为天然敷料，再用水胶体 / 泡沫保护，5–7 天换药。",
        treatmentOptions: ["blister", "massage", "dry", "iodine"],
        wrongWhys: {
            massage: "水疱和破溃处不能按摩，会撕裂疱皮、增加感染和疼痛。",
            dry: "暴露干燥会让创面脱水、上皮迁移变慢，也容易污染；应保护创面保持湿性愈合。",
            iodine: "只消毒不处理水疱、不保护创面；碘伏还会刺激新生上皮。",
        },
        probe: {
            tissue: "粉色真皮，浅表湿润",
            note: "创底仅到真皮浅层，没有触及脂肪、肌肉或骨面。",
            depth: "约 0.3 cm",
        },
        wound: {
            surfaceHole: 0.62,
            baseHole: 0.5,
            floorY: floorYAt("dermis", 0.4),
            baseLayer: "dermis",
            blister: true,
            depthLabel: "约 0.3 cm",
        },
    },
    {
        id: "case-3",
        title: "火山口样的创面",
        region: "骶尾部",
        scenario:
            "80 岁女性，髋部骨折术后。骶尾部 4 cm × 3 cm 创面，火山口状，深达皮下脂肪；底部黄色腐肉、少量渗液，边缘潜行，未见骨或肌腱。",
        visual: "创口像火山口，穿过真皮进入黄色脂肪层；底部有黄色腐肉和渗液，创底比创口更宽。",
        stage: "3",
        stageWhy:
            "全层缺损已经到皮下脂肪，但未及筋膜、肌肉或骨，属于 Ⅲ期（浅度溃疡期）。",
        correctTreatment: "debride",
        treatmentWhy:
            "Ⅲ期已到皮下脂肪：先清创去除黄色腐肉，藻酸盐 / 泡沫吸收渗液并保护创缘；渗液多时 2–7 天换药，渗液少可 5–7 天。",
        treatmentOptions: ["debride", "protect", "dry", "iodine"],
        wrongWhys: {
            protect:
                "Ⅲ期有腐肉和渗液，只盖敷料不做清创和渗液管理，创面床不会变干净。",
            dry: "干燥暴露会让腐肉变硬、渗液结痂，反而不利于引流和上皮迁移。",
            iodine: "只消毒不减压、不清创，病因和创面床都没处理；碘伏还会刺激肉芽。",
        },
        probe: {
            tissue: "黄色腐肉 + 脂肪组织",
            note: "创底在皮下脂肪层，未触及肌肉或骨面；边缘有潜行。",
            depth: "约 1.4 cm",
        },
        wound: {
            surfaceHole: 0.95,
            baseHole: 1.12,
            floorY: floorYAt("fat", 0.5),
            baseLayer: "fat",
            slough: 0.65,
            undermining: true,
            depthLabel: "约 1.4 cm",
        },
    },
    {
        id: "case-4",
        title: "深到骨面的洞",
        region: "坐骨结节",
        scenario:
            "65 岁男性，脊髓损伤。坐骨结节 5 cm × 3 cm 深洞，骨面与肌腱可见，大量脓性渗液，边缘潜行，周围皮肤发红，怀疑骨髓炎。",
        visual: "深洞穿过脂肪和肌肉，白色骨面与肌腱条索在创底可见，周围肌肉暗红，创腔里还有少量腐肉。",
        stage: "4",
        stageWhy:
            "全层缺损，骨面 / 肌腱暴露，属于 Ⅳ期（坏死溃疡期）；需要警惕骨髓炎和深部感染。",
        correctTreatment: "debride",
        treatmentWhy:
            "Ⅳ期骨 / 肌腱暴露：按 TIME 清创、控制感染、管理渗液、促肉芽；需评估负压、手术清创和骨髓炎治疗。",
        treatmentOptions: ["debride", "protect", "blister", "graft"],
        wrongWhys: {
            protect:
                "Ⅳ期骨 / 肌腱暴露且渗液多，只保护不清理感染和坏死组织，深部感染会继续。",
            blister:
                "这不是水疱期；Ⅳ期需要清创、控感染和渗液管理，抽吸水疱解决不了深部缺损。",
            graft: "创面床有感染、渗液和腐肉时直接植皮难以成活；先按 TIME 准备创面床。",
        },
        probe: {
            tissue: "白色骨面 + 肌腱",
            note: "探针直接触及骨面，创腔很深；注意骨髓炎和深部感染。",
            depth: "约 3.0 cm（深达骨面）",
        },
        wound: {
            surfaceHole: 1.05,
            baseHole: 0.96,
            floorY: 0.36,
            baseLayer: "bone",
            slough: 0.35,
            boneExposed: true,
            tendonExposed: true,
            depthLabel: "约 3.0 cm（深达骨面）",
        },
    },
    {
        id: "case-5",
        title: "黑色焦痂",
        region: "右足跟",
        scenario:
            "85 岁女性，长期卧床。右足跟 3 cm × 3 cm 黑色焦痂，坚硬干燥，周围有黄色腐肉和少量渗液，无法看清创底。",
        visual: "创口被黑色硬痂盖住，边缘有黄色腐肉；从剖面只能看到痂下有一层黄色组织，真实深度无法判断。",
        stage: "u",
        stageWhy:
            "全层缺损被腐肉或焦痂覆盖，无法判断真实深度，属于不可分期。先清创，再分期。",
        correctTreatment: "debrideStage",
        treatmentWhy:
            "焦痂遮盖无法判断深度：先清创去腐 / 焦痂再分期。若足跟焦痂稳定、干燥、完整，可先保护观察；本例周围有腐肉和渗液，需要清创。",
        treatmentOptions: ["debrideStage", "protect", "observe", "dry"],
        wrongWhys: {
            protect:
                "焦痂遮住真实深度，只保护不清理腐肉 / 焦痂就无法准确分期，也可能掩盖深部感染。",
            observe:
                "稳定、干燥、完整的足跟焦痂可以观察；但本例焦痂周围有腐肉和渗液，只观察会漏掉深部感染。",
            dry: "干燥暴露不能去除焦痂，也无法判断痂下深度；需要清创后再分期。",
        },
        probe: {
            tissue: "硬质黑色焦痂",
            note: "探针受阻，焦痂下的真实深度无法判断；需清创后再分期。",
            depth: "深度不明",
        },
        wound: {
            surfaceHole: 1,
            baseHole: 0.9,
            floorY: floorYAt("fat", 0.45),
            baseLayer: "fat",
            eschar: true,
            slough: 0.9,
            depthLabel: "深度不明（焦痂覆盖）",
        },
    },
    {
        id: "case-6",
        title: "紫黑色的完整皮肤",
        region: "骶尾部",
        scenario:
            "70 岁男性，ICU 机械通气。骶尾部 4 cm × 3 cm 皮肤完整，呈紫黑色 / 暗红，局部硬结、皮温低，疼痛明显；存在持续剪切力。",
        visual: "表皮完整，但顶部呈紫黑色，局部隆起、发硬；旁边有暗红色水疱，颜色明显比周围深。",
        stage: "d",
        stageWhy:
            "皮肤完整但出现持续暗紫 / 黑紫、硬结、疼痛和皮温改变，属于深部组织损伤（DTPI）；不要按摩。",
        correctTreatment: "observe",
        treatmentWhy:
            "DTPI 皮肤完整但深层已缺血：减压、减少剪切力、保护，禁止按摩；每班观察颜色、温度、硬度，若出现坏死或破溃再按分期处理。",
        treatmentOptions: ["observe", "massage", "debride", "dry"],
        wrongWhys: {
            massage:
                "DTPI 的深层组织已经缺血，按摩会加重损伤；完整皮肤也不能按摩骨突处。",
            debride:
                "皮肤还是完整的，清创会破坏屏障、增加感染；DTPI 首要是减压、减少剪切力和观察。",
            dry: "保持干燥会让受损皮肤更脆弱；应保护完整皮肤并持续观察颜色、温度和硬度。",
        },
        probe: {
            tissue: "皮肤完整，深层硬结",
            note: "探针不能进入；完整皮肤下的深部组织已经受损。",
            depth: "0 cm（皮肤完整）",
        },
        wound: completeSkin("dermis", "deep", "0 cm（皮肤完整）"),
    },
];

export function skinCaseById(id: string): SkinCase | undefined {
    return SKIN_CASES.find((item) => item.id === id);
}
