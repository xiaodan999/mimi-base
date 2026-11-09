import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

// AI sheets live in the app shell and reuse the study design tokens (`st-*`).
// Load only the small token subset here — the full 3515-line study.css is
// imported by the /study routes themselves, so no other page ships it.
// Never put `.study-root` on a sheet wrapper: its `:where(button)` reset wipes
// the background/border of the shadcn buttons these sheets use.
import "@/app/study/ai-tokens.css";

import ENV from "@/lib/env";
import pb from "@/lib/pb";

import AiSettingsSheet from "./AiSettings";
import {
    openCodeRelayBaseUrl,
    readAiSettings,
    writeAiSettings,
    type AiSettings,
} from "./config";
import { setAiRelayBaseUrlProvider } from "./endpoint";
import { setAiAuthTokenProvider } from "./pb-token";
import { AiTasksProvider } from "./tasks";

type AiContextValue = {
    settings: AiSettings;
    saveSettings: (settings: AiSettings) => void;
    settingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
};

const AiContext = createContext<AiContextValue | null>(null);

// 中转需要 PB 令牌和当前部署的中转地址，但 client.ts 不能依赖 lib/pb.ts
// （加载时校验环境变量，会破坏 AI 单元测试）。由 Provider 注入一次，
// 闭包里每次取最新值。
setAiAuthTokenProvider(() => pb.authStore.token);
setAiRelayBaseUrlProvider(() => openCodeRelayBaseUrl(ENV.API_ORIGIN));

export function AiProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AiSettings>(() =>
        readAiSettings(),
    );
    const [settingsOpen, setSettingsOpen] = useState(false);

    const saveSettings = useCallback((next: AiSettings) => {
        setSettings(next);
        writeAiSettings(next);
    }, []);

    const openSettings = useCallback(() => setSettingsOpen(true), []);
    const closeSettings = useCallback(() => setSettingsOpen(false), []);

    const value = useMemo(
        () => ({
            settings,
            saveSettings,
            settingsOpen,
            openSettings,
            closeSettings,
        }),
        [settings, saveSettings, settingsOpen, openSettings, closeSettings],
    );

    return (
        <AiContext.Provider value={value}>
            <AiTasksProvider notifyEnabled={settings.notify}>
                {children}
                <AiSettingsSheet
                    open={settingsOpen}
                    settings={settings}
                    onClose={closeSettings}
                    onSave={(next) => {
                        saveSettings(next);
                        closeSettings();
                    }}
                />
            </AiTasksProvider>
        </AiContext.Provider>
    );
}

export function useAi() {
    const ctx = useContext(AiContext);
    if (!ctx) throw new Error("useAi 必须在 AiProvider 内使用");
    return ctx;
}
