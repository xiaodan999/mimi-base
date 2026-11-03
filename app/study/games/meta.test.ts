import { describe, expect, test } from "bun:test";

import { DAILY_BONUS_XP, bumpDaily, dailyTaskStatus, dayKey } from "../engine";
import { emptyProgress } from "../types";
import {
    evaluateBadges,
    gameXp,
    rankFor,
    recordGame,
    type GameResult,
} from "./meta";

const perfect: GameResult = {
    score: 100,
    stars: 3,
    correct: 8,
    total: 8,
    durationMs: 60_000,
    combo: 8,
    completed: true,
};

describe("rankFor", () => {
    test("maps xp to the right rank and next threshold", () => {
        expect(rankFor(0).rank.id).toBe("intern");
        expect(rankFor(149).rank.id).toBe("intern");
        expect(rankFor(150).rank.id).toBe("nurse");
        expect(rankFor(400).rank.id).toBe("senior");
        expect(rankFor(2200).rank.id).toBe("expert");
    });

    test("reports progress inside the current rank", () => {
        const mid = rankFor(275);
        expect(mid.rank.id).toBe("nurse");
        expect(mid.progress).toBeGreaterThan(0);
        expect(mid.progress).toBeLessThan(1);
        expect(mid.toNext).toBe(125);
        expect(rankFor(9999).progress).toBe(1);
    });
});

describe("gameXp", () => {
    test("rewards stars and score, but gives a small consolation on failure", () => {
        expect(gameXp(perfect)).toBe(55);
        expect(gameXp({ ...perfect, stars: 1, score: 60 })).toBe(33);
        expect(gameXp({ ...perfect, completed: false, stars: 0 })).toBe(10);
    });
});

describe("recordGame", () => {
    test("stores the best result and awards the first-game badge", () => {
        const outcome = recordGame(emptyProgress(), "ward-hazard", perfect);

        expect(outcome.progress.games["ward-hazard"].plays).toBe(1);
        expect(outcome.progress.games["ward-hazard"].best).toBe(100);
        expect(outcome.progress.games["ward-hazard"].stars).toBe(3);
        expect(outcome.progress.games["ward-hazard"].bestCombo).toBe(8);
        expect(outcome.progress.xp).toBe(55);
        expect(outcome.progress.daily.games).toBe(1);
        expect(outcome.unlocked.map((badge) => badge.id)).toContain(
            "first-game",
        );
        expect(outcome.isBest).toBe(true);
        expect(outcome.starsGained).toBe(true);
    });

    test("keeps the best score when a later run is worse", () => {
        const first = recordGame(emptyProgress(), "ward-hazard", perfect);
        const second = recordGame(first.progress, "ward-hazard", {
            ...perfect,
            score: 40,
            stars: 1,
        });

        expect(second.progress.games["ward-hazard"].plays).toBe(2);
        expect(second.progress.games["ward-hazard"].best).toBe(100);
        expect(second.progress.games["ward-hazard"].stars).toBe(3);
        expect(second.isBest).toBe(false);
        expect(second.starsGained).toBe(false);
        const firstGameBadges = second.unlocked.filter(
            (badge) => badge.id === "first-game",
        );
        expect(firstGameBadges).toHaveLength(0);
    });

    test("unlocks the 3-star badge only for the matching game", () => {
        const ward = recordGame(emptyProgress(), "ward-hazard", perfect);
        expect(ward.unlocked.map((badge) => badge.id)).toContain("sharp-eye");
        expect(ward.unlocked.map((badge) => badge.id)).not.toContain(
            "blood-master",
        );

        const blood = recordGame(ward.progress, "blood-room", perfect);
        expect(blood.unlocked.map((badge) => badge.id)).toContain(
            "blood-master",
        );
    });
});

describe("daily quest", () => {
    test("awards the bonus once when all three tasks are done", () => {
        let progress = emptyProgress();
        progress = bumpDaily(progress, { games: 1 });
        progress = bumpDaily(progress, { questions: 10, correct: 8 });
        progress = bumpDaily(progress, { cards: 1 });

        expect(progress.xp).toBe(DAILY_BONUS_XP);
        expect(progress.quest.awarded).toBe(1);

        const again = bumpDaily(progress, { questions: 1 });
        expect(again.xp).toBe(DAILY_BONUS_XP);
    });

    test("reports zeroed counters for a new day", () => {
        const progress = emptyProgress();
        progress.daily = {
            date: "2000-1-1",
            questions: 99,
            correct: 99,
            cards: 99,
            games: 99,
        };

        const tasks = dailyTaskStatus(progress);
        expect(tasks.every((task) => task.n === 0)).toBe(true);
        expect(tasks.every((task) => !task.done)).toBe(true);
        expect(dayKey()).not.toBe("2000-1-1");
    });

    test("keeps counters when bumping on the same day", () => {
        const progress = bumpDaily(emptyProgress(), {
            questions: 3,
            correct: 2,
        });
        const next = bumpDaily(progress, { questions: 3, correct: 1 });
        expect(next.daily.questions).toBe(6);
        expect(next.daily.correct).toBe(3);
    });
});

describe("evaluateBadges", () => {
    test("awards the seven-day streak badge", () => {
        const progress = emptyProgress();
        const days: string[] = [];
        const cursor = new Date();
        for (let i = 0; i < 7; i++) {
            const copy = new Date(cursor);
            copy.setDate(copy.getDate() - i);
            days.push(
                `${copy.getFullYear()}-${copy.getMonth() + 1}-${copy.getDate()}`,
            );
        }
        progress.days = days;

        const result = evaluateBadges(progress);
        expect(result.unlocked.map((badge) => badge.id)).toContain("streak-7");
        expect(result.progress.badges).toContain("streak-7");
    });

    test("unlocks specialty badges for the three new games", () => {
        const progress = emptyProgress();
        progress.games = {
            defib: { plays: 1, best: 100, stars: 3, last: 0 },
            skin: { plays: 1, best: 100, stars: 3, last: 0 },
            shift: { plays: 1, best: 85, stars: 2, last: 0 },
        };

        const result = evaluateBadges(progress);
        const ids = result.unlocked.map((badge) => badge.id);
        expect(ids).toContain("shock-master");
        expect(ids).toContain("skin-deep");
        expect(ids).toContain("night-shift");
    });

    test("returns the same object when nothing new is unlocked", () => {
        const result = evaluateBadges(emptyProgress());
        expect(result.unlocked).toHaveLength(0);
    });
});
