import { Suspense, lazy } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import CardsSection from "@/app/study/components/CardsSection";
import ExamSection from "@/app/study/components/ExamSection";
import MemoSection from "@/app/study/components/MemoSection";
import QuizSection from "@/app/study/components/QuizSection";
import { useStudy } from "@/app/study/components/StudyContext";
import TermsSection from "@/app/study/components/TermsSection";
import WrongSection from "@/app/study/components/WrongSection";
import GameHub from "@/app/study/games/GameHub";
import BloodRoomGame from "@/app/study/games/blood/BloodRoomGame";
import { getGame, isGameUnlocked } from "@/app/study/games/registry";

// three.js 只给实战用，单独切出去，别拖慢知识卡 / 刷题
const WardHazardGame = lazy(
    () => import("@/app/study/games/ward/WardHazardGame"),
);
const DefibGame = lazy(() => import("@/app/study/games/defib/DefibGame"));
const SkinGame = lazy(() => import("@/app/study/games/skin/SkinGame"));
const ShiftGame = lazy(() => import("@/app/study/games/shift/ShiftGame"));

export const Route = createFileRoute(
    "/_protected/_main/study/$subjectId/$section",
)({
    validateSearch: (
        search: Record<string, unknown>,
    ): { m?: string; quick?: number; game?: string; card?: string } => ({
        m: typeof search.m === "string" ? search.m : undefined,
        quick: search.quick === 1 || search.quick === "1" ? 1 : undefined,
        game: typeof search.game === "string" ? search.game : undefined,
        card: typeof search.card === "string" ? search.card : undefined,
    }),
    component: Section,
});

function GameLoading() {
    return (
        <div className="game-loading">
            <span className="game-loading-spin" aria-hidden="true" />
            <b>正在准备 3D 场景…</b>
            <span>第一次进入要加载 three.js，之后会快很多</span>
        </div>
    );
}

function BossLocked() {
    const { subject } = useStudy();
    return (
        <div className="game-loading" style={{ padding: 24 }}>
            <div style={{ fontSize: 34 }}>🌙</div>
            <b>20:00 夜班还没开放</b>
            <span>先拿到「夜巡 2 星 + 输血密室 2 星」，综合病例才会解锁。</span>
            <div className="gr-actions">
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "games" }}
                    search={{ game: "ward-hazard" }}
                    className="g-btn primary"
                >
                    去夜巡
                </Link>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "games" }}
                    search={{ game: "blood-room" }}
                    className="g-btn ghost"
                >
                    去输血密室
                </Link>
            </div>
        </div>
    );
}

function Section() {
    const { section } = Route.useParams();
    const { m, quick, game, card } = Route.useSearch();
    const { progress } = useStudy();

    switch (section) {
        case "cards":
            return <CardsSection moduleId={m} focusCard={card} />;
        case "quiz":
            return <QuizSection quick={Boolean(quick)} />;
        case "games":
            if (game === "ward-hazard") {
                return (
                    <Suspense fallback={<GameLoading />}>
                        <WardHazardGame />
                    </Suspense>
                );
            }
            if (game === "blood-room") return <BloodRoomGame />;
            if (game === "defib") {
                return (
                    <Suspense fallback={<GameLoading />}>
                        <DefibGame />
                    </Suspense>
                );
            }
            if (game === "skin") {
                return (
                    <Suspense fallback={<GameLoading />}>
                        <SkinGame />
                    </Suspense>
                );
            }
            if (game === "shift") {
                const boss = getGame("shift");
                if (boss && !isGameUnlocked(boss, progress)) {
                    return <BossLocked />;
                }
                return (
                    <Suspense fallback={<GameLoading />}>
                        <ShiftGame />
                    </Suspense>
                );
            }
            return <GameHub />;
        case "exam":
            return <ExamSection />;
        case "terms":
            return <TermsSection />;
        case "wrong":
            return <WrongSection />;
        case "memo":
            return <MemoSection />;
        default:
            return (
                <div className="st-empty">
                    <div className="ei">🚧</div>
                    <div className="text-[15px] font-extrabold">
                        这个板块还在施工
                    </div>
                    <div className="st-tiny mt-2">回到首页看看别的吧</div>
                </div>
            );
    }
}
