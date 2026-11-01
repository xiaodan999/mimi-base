import { createFileRoute } from "@tanstack/react-router";

import CardsSection from "@/app/study/components/CardsSection";
import ExamSection from "@/app/study/components/ExamSection";
import MemoSection from "@/app/study/components/MemoSection";
import QuizSection from "@/app/study/components/QuizSection";
import TermsSection from "@/app/study/components/TermsSection";
import WrongSection from "@/app/study/components/WrongSection";

export const Route = createFileRoute(
    "/_protected/_main/study/$subjectId/$section",
)({
    validateSearch: (
        search: Record<string, unknown>,
    ): { m?: string; quick?: number } => ({
        m: typeof search.m === "string" ? search.m : undefined,
        quick: search.quick === 1 || search.quick === "1" ? 1 : undefined,
    }),
    component: Section,
});

function Section() {
    const { section } = Route.useParams();
    const { m, quick } = Route.useSearch();

    switch (section) {
        case "cards":
            return <CardsSection moduleId={m} />;
        case "quiz":
            return <QuizSection quick={Boolean(quick)} />;
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
