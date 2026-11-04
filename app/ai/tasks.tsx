import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { toast } from "sonner";

import { AiTaskCenter, AiTaskPill } from "./AiTaskCenter";
import { writeAiCache } from "./cache";
import { showSystemNotification } from "./notify";
import {
    createAiTaskStore,
    type AiTask,
    type StartAiTaskOptions,
} from "./task-store";

type AiTasksValue = {
    tasks: AiTask[];
    runTask: <T>(options: StartAiTaskOptions<T>) => Promise<T>;
    cancel: (idOrKey: string) => void;
    dismiss: (id: string) => void;
    clearFinished: () => void;
    getResult: <T>(key: string) => T | undefined;
    find: (key: string) => AiTask | undefined;
    attend: (group: string) => () => void;
    openTasks: () => void;
    sheetOpen: boolean;
};

const AiTasksContext = createContext<AiTasksValue | null>(null);

/**
 * App 级 AI 任务管理器。放在 AiProvider 里，跨页面一直存活；
 * 组件关掉后请求继续跑，完成时写缓存并通知。
 */
export function AiTasksProvider({
    children,
    notifyEnabled,
}: {
    children: ReactNode;
    notifyEnabled: boolean;
}) {
    const storeRef = useRef<ReturnType<typeof createAiTaskStore> | null>(null);
    if (!storeRef.current) {
        storeRef.current = createAiTaskStore({ saveCache: writeAiCache });
    }
    const store = storeRef.current;
    const tasks = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );
    const [sheetOpen, setSheetOpen] = useState(false);
    const notifiedRef = useRef(new Set<string>());

    // 任务中心打开着就说明用户在看，完成的任务直接算已读
    useEffect(() => {
        if (sheetOpen) store.markAllSeen();
    }, [sheetOpen, tasks, store]);

    useEffect(() => {
        if (sheetOpen) return;

        const fresh = tasks.filter(
            (task) =>
                (task.status === "done" || task.status === "error") &&
                !task.seen &&
                !notifiedRef.current.has(task.id),
        );
        if (fresh.length === 0) return;

        const hidden =
            typeof document !== "undefined" &&
            document.visibilityState !== "visible";

        for (const task of fresh) {
            notifiedRef.current.add(task.id);
            const open = () => setSheetOpen(true);

            if (task.status === "done") {
                toast.success(`「${task.title}」完成了`, {
                    description: task.summary,
                    duration: 8000,
                    action: { label: "查看", onClick: open },
                });
                if (notifyEnabled && hidden) {
                    showSystemNotification(
                        `「${task.title}」完成了`,
                        task.summary || "点开秘密基地看看结果",
                        task.id,
                    );
                }
            } else {
                toast.error(`「${task.title}」失败了`, {
                    description: task.error,
                    duration: 8000,
                    action: { label: "查看", onClick: open },
                });
                if (notifyEnabled && hidden) {
                    showSystemNotification(
                        `「${task.title}」失败了`,
                        task.error || "点开秘密基地看看",
                        task.id,
                    );
                }
            }
        }
    }, [tasks, sheetOpen, notifyEnabled]);

    // 离开受保护的 App 壳（比如退出登录）时中止所有请求
    useEffect(() => () => store.abortAll(), [store]);

    const value = useMemo<AiTasksValue>(
        () => ({
            tasks,
            runTask: store.start,
            cancel: store.cancel,
            dismiss: store.dismiss,
            clearFinished: store.clearFinished,
            getResult: store.getResult,
            find: store.find,
            attend: store.attend,
            openTasks: () => setSheetOpen(true),
            sheetOpen,
        }),
        [tasks, sheetOpen, store],
    );

    const running = tasks.filter((task) => task.status === "running").length;
    const unseen = tasks.filter(
        (task) =>
            !task.seen && (task.status === "done" || task.status === "error"),
    ).length;

    return (
        <AiTasksContext.Provider value={value}>
            {children}
            <AiTaskCenter
                tasks={tasks}
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                onCancel={store.cancel}
                onDismiss={store.dismiss}
                onClearFinished={store.clearFinished}
            />
            <AiTaskPill
                running={running}
                unseen={unseen}
                onOpen={() => setSheetOpen(true)}
            />
        </AiTasksContext.Provider>
    );
}

export function useAiTasks() {
    const ctx = useContext(AiTasksContext);
    if (!ctx) throw new Error("useAiTasks 必须在 AiTasksProvider 内使用");
    return ctx;
}
