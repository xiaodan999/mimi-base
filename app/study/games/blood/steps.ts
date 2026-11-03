/**
 * 《输血密室》的七道关卡。
 * 判定依据来自《质控内容.doc》的「用药及用血安全」章节。
 */

export type BloodOption = {
    text: string;
    ok: boolean;
    why: string;
};

export type BloodStep = {
    id: string;
    icon: string;
    title: string;
    scene: string;
    question: string;
    type: "single" | "multi" | "order" | "slider";
    options?: BloodOption[];
    /** order 关卡：按正确顺序排列 */
    items?: string[];
    /** slider 关卡 */
    min?: number;
    max?: number;
    answerMin?: number;
    answerMax?: number;
    unit?: string;
    rule: string;
    source: string;
};

export const BLOOD_STEPS: BloodStep[] = [
    {
        id: "collect",
        icon: "🧪",
        title: "采血",
        scene: "输血申请单开好了。你推着治疗车，准备去床边采血。",
        question: "下面哪些做法必须同时做到？",
        type: "multi",
        source: "输血流程 §7",
        rule: "采血要双人核对医嘱、申请单和试管条形码；两人携带用物到床边；用两种以上方式核对患者；严禁从静脉输液通路直接采血，严禁同时采集两个患者的血标本。",
        options: [
            {
                text: "双人核对医嘱、输血申请单和试管条形码",
                ok: true,
                why: "采血前双人核对，是把错误挡在第一步。",
            },
            {
                text: "两人携带申请单和试管到患者床边",
                ok: true,
                why: "采血必须到床旁核对，不能凭记忆或床号。",
            },
            {
                text: "用两种以上方式核对患者身份",
                ok: true,
                why: "姓名、住院号、出生日期等两种以上方法，缺一不可。",
            },
            {
                text: "从正在输液的静脉通路直接抽血",
                ok: false,
                why: "严禁从静脉输液通路直接采血，会稀释血样、影响配血结果。",
            },
            {
                text: "同时采集两个患者的血标本",
                ok: false,
                why: "严禁同时采集两个患者的血标本，极易发生标本混淆。",
            },
            {
                text: "只核对床号，快一点",
                ok: false,
                why: "严禁仅以床号识别患者；床号会变，人不会。",
            },
        ],
    },
    {
        id: "pickup",
        icon: "🩸",
        title: "取血",
        scene: "血库通知取血。你拿着取血单站在血库窗口前。",
        question: "取血时，正确的做法是？",
        type: "single",
        source: "输血查对 §6 / 输血流程 §7",
        rule: "取血要做三查九对，无误后双签名。三查：有效期、血液质量、输血装置完好；九对：床号、姓名、性别、年龄、住院号、血型、血袋号、血液种类和剂量、献血者编号。",
        options: [
            {
                text: "与血库人员完成三查九对，无误后双签名",
                ok: true,
                why: "三查九对是取血的核心；双签名让责任可追溯。",
            },
            {
                text: "只看血袋号和患者姓名",
                ok: false,
                why: "血型、住院号、血液种类和剂量、献血者编号都不能漏。",
            },
            {
                text: "拿回病房再核对",
                ok: false,
                why: "取血时就应完成核对；把问题带回病房，风险已经进门。",
            },
            {
                text: "让家属帮忙去取",
                ok: false,
                why: "取血必须由医护人员完成并双签名，不能交给家属。",
            },
        ],
    },
    {
        id: "bedside",
        icon: "🛏️",
        title: "床旁核对",
        scene: "血袋取回来了。患者躺在床上，家属在旁边。",
        question: "输血前，床旁必须完成哪些核对？",
        type: "multi",
        source: "输血流程 §7",
        rule: "输血前双人交叉核对；携带病历、交叉配血单、血袋和输血用物到床旁；再次用两种以上方式核对患者；确认血袋内不得加入任何药物。",
        options: [
            {
                text: "双人携带病历、交叉配血单、血袋和输血用物到床旁",
                ok: true,
                why: "核对需要原始资料在场，不能凭印象。",
            },
            {
                text: "再次用两种以上方式核对患者身份",
                ok: true,
                why: "床旁是最后一道身份关，必须重新核对。",
            },
            {
                text: "确认血袋内没有加入任何药物",
                ok: true,
                why: "血袋内不得加入任何药物；需要冲管时用生理盐水。",
            },
            {
                text: "双人再次核对并在交叉配血报告单上双签名",
                ok: true,
                why: "双人核对、双签名，是输血安全的关键留痕。",
            },
            {
                text: "一人核对即可，另一人先去忙",
                ok: false,
                why: "输血前必须双人交叉核对，单人核对不达标。",
            },
            {
                text: "先挂上血袋，再补核对",
                ok: false,
                why: "核对必须在输血前完成；先挂上就等于把错误输进患者体内。",
            },
        ],
    },
    {
        id: "rate",
        icon: "💧",
        title: "开始输注",
        scene: "核对无误。血液出库已经 20 分钟，你准备开始输注。",
        question: "初始滴速应该控制在多少？",
        type: "slider",
        source: "输血流程 §7",
        rule: "血液出库后 30 分钟内开始输注，开始滴速宜慢，<20 滴/分；观察 15 分钟无不良反应后，再根据病情调节滴速。每袋血 4 小时内输完。",
        min: 5,
        max: 60,
        answerMin: 5,
        answerMax: 19,
        unit: "滴/分",
    },
    {
        id: "watch",
        icon: "👀",
        title: "15 分钟观察",
        scene: "输血开始 15 分钟了。患者说有点发冷，你看了看监护仪。",
        question: "这时你应该？",
        type: "single",
        source: "输血评估记录 §6",
        rule: "记录时点：开始输血、输血 15 分钟、输血毕、输血毕后 15 分钟，均记录生命体征及有无输血反应。出现反应立即停止输血。",
        options: [
            {
                text: "观察生命体征和有无输血反应，并记录",
                ok: true,
                why: "15 分钟是输血反应的高发窗口，必须评估并记录。",
            },
            {
                text: "把滴速调快，节省时间",
                ok: false,
                why: "患者已经发冷，调快滴速会加重反应；先评估，再处理。",
            },
            {
                text: "去忙别的，有事患者会叫",
                ok: false,
                why: "输血反应可能进展很快，15 分钟观察不能省。",
            },
            {
                text: "只记录体温",
                ok: false,
                why: "生命体征和有无输血反应都要记录，不能只记体温。",
            },
        ],
    },
    {
        id: "reaction",
        icon: "🚨",
        title: "输血反应",
        scene: "患者突然寒战、高热，监护仪报警。血袋还剩一半。",
        question: "请按顺序排出前 4 个关键动作。",
        type: "order",
        source: "输血反应应急预案 §8",
        rule: "立即停止输血 → 更换输血器、改输生理盐水 → 报告医生和护士长 → 保留余血和血袋送检；同时准备抢救、吸氧、观察记录并上报。",
        items: [
            "立即停止输血",
            "更换输血器，改输生理盐水",
            "报告医生和护士长",
            "保留余血和血袋送检",
        ],
    },
    {
        id: "bag",
        icon: "♻️",
        title: "血袋回收",
        scene: "输血结束，患者生命体征平稳。空血袋还挂在输液架上。",
        question: "空血袋应该怎么处理？",
        type: "single",
        source: "输血查对 §6 / 输血流程 §7",
        rule: "输血毕，血袋用黄色垃圾袋包裹后送回血库保留 24 小时，以备迟发反应时追溯。",
        options: [
            {
                text: "黄色垃圾袋包裹，送回血库保留 24 小时",
                ok: true,
                why: "保留 24 小时是为了迟发反应时能追溯；黄色垃圾袋是包裹材料。",
            },
            {
                text: "直接丢进黄色垃圾桶",
                ok: false,
                why: "血袋要送回血库，不是当普通医疗废物丢掉。",
            },
            {
                text: "放药品冰箱留到明天",
                ok: false,
                why: "血袋不能放药品冰箱，应按规定包裹后送回血库。",
            },
            {
                text: "剪碎后按感染性废物处理",
                ok: false,
                why: "剪碎会破坏追溯信息，也违反血袋回收要求。",
            },
        ],
    },
];
