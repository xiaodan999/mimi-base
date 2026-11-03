/**
 * 《20:00 夜班》的病例脚本。
 *
 * 8 个事件在 6 分钟值班里按 spawnAt 依次出现，每个事件绑定病房场景里
 * 一个可点击的 object id，超时未处理会扣患者安全分。文案与依据沿用
 * 《夜巡》的《质控内容》体系，但改成正在发生的临床情境。
 */

import type { Hazard, HazardOption } from "../ward/hazards";

export type ShiftEventDef = {
    id: string;
    /** WardScene 里可点击的对象 id */
    object: string;
    title: string;
    /** 事件出现时的一句现场描述 */
    scene: string;
    icon: string;
    options: HazardOption[];
    /** 正确处理动作，用于结算复盘 */
    fix: string;
    source: string;
    /** 值班开始后第几秒出现 */
    spawnAt: number;
    /** 出现后允许处理的秒数 */
    deadline: number;
    /** 超时未处理扣除的患者安全分 */
    penalty: number;
};

/** 一整班的总时长（秒） */
export const SHIFT_TOTAL_SECONDS = 360;

/** 处理正确恢复的患者安全分 */
export const SHIFT_RESOLVE_SAFETY = 6;

/** 答错后再答对恢复的患者安全分 */
export const SHIFT_RETRY_SAFETY = 4;

/** 每次答错扣除的患者安全分 */
export const SHIFT_WRONG_SAFETY = 8;

export const SHIFT_EVENTS: ShiftEventDef[] = [
    {
        id: "shift-blood",
        object: "blood-bag",
        title: "输血 15 分钟后寒战高热",
        scene: "1 床输血 15 分钟后突然寒战、体温 39.2℃，血袋还挂在床旁。",
        icon: "🩸",
        spawnAt: 4,
        deadline: 36,
        penalty: 26,
        fix: "立即停止输血，更换输液器并用生理盐水维持通路，保留血袋和输血器送检，报告医生并记录生命体征。",
        source: "输血查对与流程 §6 / 输血不良反应处理",
        options: [
            {
                text: "立即停止输血，更换输液器，保留血袋并报告医生",
                ok: true,
                why: "输血反应首先要停止输血、保持静脉通路，并保留血袋和输血器送检，同时立即报告医生。",
            },
            {
                text: "调慢滴速，继续观察体温变化",
                ok: false,
                why: "继续输入会让反应加重，调慢滴速不能替代立即停止输血。",
            },
            {
                text: "先给退热药，等体温降下来再说",
                ok: false,
                why: "退热药会掩盖症状，延误识别溶血等严重输血反应。",
            },
        ],
    },
    {
        id: "shift-phone",
        object: "phone",
        title: "危急值：血钾 6.8",
        scene: "护士站电话响了，检验科报告 3 床血钾 6.8 mmol/L，要求立即处理。",
        icon: "☎️",
        spawnAt: 18,
        deadline: 36,
        penalty: 22,
        fix: "复述确认并登记危急值，立即通知主管医生确认签名，按医嘱处理并记录病情变化。",
        source: "危急值接获流程 §2",
        options: [
            {
                text: "复述并登记，立即通知主管医生，备好抢救物品",
                ok: true,
                why: "危急值必须复述确认、登记接收时间，并立即通知主管医生，不能等也不能只记便签。",
            },
            {
                text: "先记在便签上，等医生查房再说",
                ok: false,
                why: "便签不是正式登记，也容易丢失；危急值拖延可能直接危及生命。",
            },
            {
                text: "先按经验给患者口服降钾药",
                ok: false,
                why: "护士不能自行用药，必须由医生评估后下达医嘱。",
            },
        ],
    },
    {
        id: "shift-rail",
        object: "rail-a",
        title: "跌倒高危患者自己下床",
        scene: "2 床跌倒高危患者趁家属离开，扶着放下的床栏准备自己下床。",
        icon: "🛏️",
        spawnAt: 62,
        deadline: 34,
        penalty: 20,
        fix: "立即协助患者完成需求，拉起双侧床栏并确认锁扣，把呼叫器放到伸手可及处，加强巡视和交班。",
        source: "跌倒/坠床预防措施 §7",
        options: [
            {
                text: "立即上前搀扶，协助如厕并拉起床栏",
                ok: true,
                why: "跌倒高危患者离床必须有人协助，床栏和呼叫器是夜间最基础的物理防护。",
            },
            {
                text: "喊他别动，让他自己慢慢来",
                ok: false,
                why: "口头提醒不能替代搀扶，患者体位改变时可能来不及反应。",
            },
            {
                text: "先把床头摇高，让他坐得稳一点",
                ok: false,
                why: "摇高床头与下床安全无关，反而可能增加剪切力，必须先解决床栏和陪伴问题。",
            },
        ],
    },
    {
        id: "shift-hand",
        object: "hand-san",
        title: "手消空瓶，接触隔离患者",
        scene: "4 床是接触隔离患者，床尾的手消毒剂已经按不出液体。",
        icon: "🧴",
        spawnAt: 78,
        deadline: 32,
        penalty: 12,
        fix: "立即补充或更换手消毒剂，接触隔离患者前后按规范执行手卫生。",
        source: "感染控制 · 洗手时机 §2",
        options: [
            {
                text: "立即更换手消毒剂，接触前后规范手卫生",
                ok: true,
                why: "接触患者前后都要手卫生，设施缺失会让下一次接触直接跳过这一步。",
            },
            {
                text: "用清水冲一下手代替",
                ok: false,
                why: "清水不能替代手消毒剂，接触隔离患者后必须按规范执行手卫生。",
            },
            {
                text: "先接触完患者，等保洁来换",
                ok: false,
                why: "手卫生不能等，接触隔离患者前后都必须立即执行。",
            },
        ],
    },
    {
        id: "shift-med",
        object: "med-label",
        title: "高危药混在治疗车",
        scene: "治疗车上，胰岛素和浓氯化钾与普通药混放，没有任何高危标识。",
        icon: "💉",
        spawnAt: 128,
        deadline: 36,
        penalty: 16,
        fix: "立即贴高危药品标识并单独区域放置，配置和使用时双人核对。",
        source: "高危药品管理 §3 / §5",
        options: [
            {
                text: "贴高危标识，单独区域放置，配置时双人核对",
                ok: true,
                why: "高危药品要一眼可辨、单独区域放置，配置和使用时双人核对。",
            },
            {
                text: "口头提醒下一班注意",
                ok: false,
                why: "口头交班容易遗漏，标识和分区才是可追溯的防线。",
            },
            {
                text: "先给患者用，回头再补标识",
                ok: false,
                why: "用药前就必须完成高危药品识别，事后补标识不能消除已经发生的风险。",
            },
        ],
    },
    {
        id: "shift-narcotics",
        object: "narcotics",
        title: "麻精柜未锁，钥匙还在锁孔",
        scene: "夜班清点时发现麻精柜门开着，钥匙插在锁孔里，柜内药品还没核对。",
        icon: "🔐",
        spawnAt: 146,
        deadline: 34,
        penalty: 18,
        fix: "立即上锁，双人清点麻精药品并登记，钥匙由专人保管。",
        source: "麻醉药品和第一类精神药品管理 §2",
        options: [
            {
                text: "立即上锁，双人清点并登记，钥匙交专人保管",
                ok: true,
                why: "麻精药品实行五专：专人、专柜、专锁、专册登记、专用处方。",
            },
            {
                text: "先拔出钥匙放抽屉，柜门等会儿再关",
                ok: false,
                why: "拔钥匙不等于上锁，柜门开着就无法保证药品安全，必须立即锁闭。",
            },
            {
                text: "等下一班来了一起清点",
                ok: false,
                why: "麻精药品必须每班清点，不能把风险留给下一班。",
            },
        ],
    },
    {
        id: "shift-pca",
        object: "pca",
        title: "镇痛泵管道脱开",
        scene: "3 床镇痛泵报警，管道和泵体脱开，患者按了两次追加键还是喊疼。",
        icon: "📟",
        spawnAt: 214,
        deadline: 36,
        penalty: 20,
        fix: "重新连接管道，检查泵体和管道有无漏液，记录疼痛评分及恶心、镇静等副作用。",
        source: "PCA 镇痛泵管理 §3",
        options: [
            {
                text: "重新连接，检查泵体管道有无漏液，记录疼痛与副作用",
                ok: true,
                why: "PCA 是高危管道，要检查连接、泵体和管道有无漏液，并记录疼痛与副作用。",
            },
            {
                text: "直接把剂量调大",
                ok: false,
                why: "管道脱开时加量不会起效，还可能掩盖问题，必须先解决连接。",
            },
            {
                text: "关掉报警，让患者先忍一忍",
                ok: false,
                why: "报警是在提示问题，关掉报警等于关掉安全网。",
            },
        ],
    },
    {
        id: "shift-fire",
        object: "fire-door",
        title: "消防通道被堵，防火门敞开",
        scene: "走廊尽头，纸箱和轮椅堵住消防通道，防火门被绳子固定在敞开位置。",
        icon: "🚪",
        spawnAt: 286,
        deadline: 40,
        penalty: 28,
        fix: "立即清理消防通道，防火门保持常闭，确认灭火器和疏散指示可用。",
        source: "火灾应急预案 §1",
        options: [
            {
                text: "清理通道，解开绳子让防火门保持常闭",
                ok: true,
                why: "防火门要能阻隔烟火蔓延，通道被堵会直接延误疏散。",
            },
            {
                text: "把杂物挪到门后，门继续开着",
                ok: false,
                why: "门后堆物同样影响开门和疏散，防火门也必须保持常闭。",
            },
            {
                text: "等明天后勤上班再报修",
                ok: false,
                why: "火灾不挑时间，通道和防火门必须时刻处于可用状态。",
            },
        ],
    },
];

/** 把事件脚本映射成 WardScene 需要的 Hazard 结构 */
export function shiftHazard(
    event: ShiftEventDef,
    options: HazardOption[] = event.options,
): Hazard {
    return {
        id: event.id,
        object: event.object,
        title: event.title,
        prompt: event.scene,
        options,
        fix: event.fix,
        source: event.source,
    };
}
