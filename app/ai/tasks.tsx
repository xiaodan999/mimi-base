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
import {
    markInterruptibleRestored,
    readInterruptibleTasks,
} from "./interrupted";
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
    retry: (idOrKey: string) => void;
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

    // 上次页面被杀（Android 把后台标签回收）时没跑完的任务：从本地台账
    // 恢复成「被中断」的行，能续跑的一键继续。只提醒一次。
    useEffect(() => {
        // 今日小结已改为本地计算，旧版本留下的「daily:」条目不再恢复。
        const entries = readInterruptibleTasks().filter(
            (entry) => !entry.key.startsWith("daily:"),
        );
        const count = store.restoreInterrupted(entries);
        if (count === 0) return;
        const fresh = entries.some((entry) => entry.restoredAt == null);
        markInterruptibleRestored(entries.map((entry) => entry.id));
        if (!fresh) return;
        toast(`上次有 ${count} 个任务没跑完`, {
            description: "到任务中心看看，能续跑的可以直接继续",
            duration: 8000,
            action: { label: "查看", onClick: () => setSheetOpen(true) },
        });
    }, [store]);

    useEffect(() => {
        if (sheetOpen) return;

        const fresh = tasks.filter(
            (task) =>
                (task.status === "done" || task.status === "error") &&
                !task.seen &&
                !notifiedRef.current.has(task.id),
        );
        if (fresh.length === 0) return;

        for (const task of fresh) {
            notifiedRef.current.add(task.id);
            const open = () => setSheetOpen(true);

            if (task.status === "done") {
                toast.success(`「${task.title}」完成了`, {
                    description: task.summary,
                    duration: 8000,
                    action: { label: "查看", onClick: open },
                });
                // 是否「后台才通知」由 notify.ts 统一判断
                if (notifyEnabled) {
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
                // 是否「后台才通知」由 notify.ts 统一判断
                if (notifyEnabled) {
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
            retry: store.retry,
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
            !task.seen &&
            (task.status === "done" ||
                task.status === "error" ||
                task.status === "interrupted"),
    ).length;

    return (
        <AiTasksContext.Provider value={value}>
            {children}
            <AiTaskCenter
                tasks={tasks}
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                onCancel={store.cancel}
                onRetry={store.retry}
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
