/**
 * 学习基地内容的交叉引用校验（纯函数）。
 *
 * 内容目前还是硬编码 TS：bank[].card 指向知识卡 id，GAMES[].cards 指向知识卡
 * id，hazards[].object / 事件 object 指向 3D 场景里的可点击对象 id。改动内容时
 * 很容易写错一个字而在运行时才炸。validate.test.ts 在 bun test 里喂真实数据，
 * 任何悬空引用都会让测试失败 —— 相当于构建期的引用校验。
 *
 * 迁移到 runtime JSON/CMS 后，同一个函数直接对解析后的对象跑一遍即可。
 */

/** 内容结构版本；将来改动数据形状时手动 +1，提醒同步迁移逻辑。 */
export const STUDY_CONTENT_SCHEMA_VERSION = 1;

export type ValidationInput = {
    cards: readonly { id: string }[];
    /** bank[].card 可选；有值就必须能找到对应知识卡 */
    bank: readonly { id: string; card?: string }[];
    games: readonly { id: string; cards: readonly string[] }[];
    hazards: readonly { id: string; object: string }[];
    /** 3D 场景里所有可点击对象 id（来自 SCENE_LABELS 的 key） */
    sceneObjectIds: readonly string[];
};

export type ValidationProblem = {
    /** 哪一类引用：bank.card / game.cards / hazard.object */
    kind: "bank.card" | "game.cards" | "hazard.object";
    /** 出错的记录 id */
    ref: string;
    /** 找不到目标的那个值 */
    target: string;
};

export function validateStudyContent(
    input: ValidationInput,
): ValidationProblem[] {
    const problems: ValidationProblem[] = [];
    const cardIds = new Set(input.cards.map((card) => card.id));
    const sceneIds = new Set(input.sceneObjectIds);

    for (const item of input.bank) {
        if (item.card && !cardIds.has(item.card)) {
            problems.push({
                kind: "bank.card",
                ref: item.id,
                target: item.card,
            });
        }
    }
    for (const game of input.games) {
        for (const card of game.cards) {
            if (!cardIds.has(card)) {
                problems.push({
                    kind: "game.cards",
                    ref: game.id,
                    target: card,
                });
            }
        }
    }
    for (const hazard of input.hazards) {
        if (!sceneIds.has(hazard.object)) {
            problems.push({
                kind: "hazard.object",
                ref: hazard.id,
                target: hazard.object,
            });
        }
    }
    return problems;
}
