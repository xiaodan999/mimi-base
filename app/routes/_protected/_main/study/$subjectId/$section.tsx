import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { lazy, type ReactNode, Suspense } from "react";

import { useStudy } from "@/app/study/components/StudyContext";
import { getGame, isGameUnlocked } from "@/app/study/games/registry";

// 每个板块、每个实战都是独立 chunk；games.css 也由这些 lazy chunk 自带，
// 不再被 section 路由静态拖进来（打开知识卡 / 刷题时不会下载 1743 行游戏样式）。
const CardsSection = lazy(() => import("@/app/study/components/CardsSection"));
const ExamSection = lazy(() => import("@/app/study/components/ExamSection"));
const MemoSection = lazy(() => import("@/app/study/components/MemoSection"));
const QuizSection = lazy(() => import("@/app/study/components/QuizSection"));
const TermsSection = lazy(() => import("@/app/study/components/TermsSection"));
const WrongSection = lazy(() => import("@/app/study/components/WrongSection"));
const GameHub = lazy(() => import("@/app/study/games/GameHub"));
const WardHazardGame = lazy(
    () => import("@/app/study/games/ward/WardHazardGame"),
);
const BloodRoomGame = lazy(
    () => import("@/app/study/games/blood/BloodRoomGame"),
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

function SectionLoading() {
    return (
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted-foreground">
            <Loader2
                className="size-6 animate-spin text-primary"
                aria-hidden="true"
            />
            <b className="text-sm font-bold">正在加载…</b>
            <span className="text-xs">第一次进入会多花一点点时间</span>
        </div>
    );
}

function BossLocked() {
    const { subject } = useStudy();
    return (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <div className="text-4xl">🌙</div>
            <b className="text-sm font-extrabold">20:00 夜班还没开放</b>
            <span className="text-xs text-muted-foreground">
                先拿到「夜巡 2 星 + 输血密室 2 星」，综合病例才会解锁。
            </span>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "games" }}
                    search={{ game: "ward-hazard" }}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                >
                    去夜巡
                </Link>
                <Link
                    to="/study/$subjectId/$section"
                    params={{ subjectId: subject.id, section: "games" }}
                    search={{ game: "blood-room" }}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-bold"
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

    let content: ReactNode;
    switch (section) {
        case "cards":
            content = <CardsSection moduleId={m} focusCard={card} />;
            break;
        case "quiz":
            content = <QuizSection quick={Boolean(quick)} />;
            break;
        case "games":
            if (game === "ward-hazard") {
                content = <WardHazardGame />;
            } else if (game === "blood-room") {
                content = <BloodRoomGame />;
            } else if (game === "defib") {
                content = <DefibGame />;
            } else if (game === "skin") {
                content = <SkinGame />;
            } else if (game === "shift") {
                const boss = getGame("shift");
                content =
                    boss && !isGameUnlocked(boss, progress) ? (
                        <BossLocked />
                    ) : (
                        <ShiftGame />
                    );
            } else {
                content = <GameHub />;
            }
            break;
        case "exam":
            content = <ExamSection />;
            break;
        case "terms":
            content = <TermsSection />;
            break;
        case "wrong":
            content = <WrongSection />;
            break;
        case "memo":
            content = <MemoSection />;
            break;
        default:
            content = (
                <div className="st-empty">
                    <div className="ei">🚧</div>
                    <div className="text-[15px] font-extrabold">
                        这个板块还在施工
                    </div>
                    <div className="st-tiny mt-2">回到首页看看别的吧</div>
                </div>
            );
    }

    return <Suspense fallback={<SectionLoading />}>{content}</Suspense>;
}
