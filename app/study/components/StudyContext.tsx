import { type ReactNode, createContext, useContext } from "react";

import { useStudyProgress } from "../progress";
import type { Progress, StudySubject } from "../types";

type StudyContextValue = {
    subject: StudySubject;
    progress: Progress;
    update: (mutate: (current: Progress) => Progress) => void;
    reset: () => void;
    saving: boolean;
    loading: boolean;
};

const StudyContext = createContext<StudyContextValue | null>(null);

export function StudyProvider({
    subject,
    children,
}: {
    subject: StudySubject;
    children: ReactNode;
}) {
    const { progress, update, reset, saving, loading } = useStudyProgress(
        subject.id,
    );

    return (
        <StudyContext.Provider
            value={{ subject, progress, update, reset, saving, loading }}
        >
            {children}
        </StudyContext.Provider>
    );
}

export function useStudy() {
    const ctx = useContext(StudyContext);
    if (!ctx) throw new Error("useStudy 必须在 StudyProvider 内使用");
    return ctx;
}
