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

import pb from "@/lib/pb";

import AiSettingsSheet from "./AiSettings";
import {
    isAiConfigured,
    migrateAiSettings,
    openCodeRelayBaseUrl,
    readAiSettings,
    writeAiSettings,
    type AiSettings,
} from "./config";
import { AiTasksProvider } from "./tasks";

type AiContextValue = {
    settings: AiSettings;
    configured: boolean;
    saveSettings: (settings: AiSettings) => void;
    settingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
};

const AiContext = createContext<AiContextValue | null>(null);

export function AiProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AiSettings>(() => {
        // 旧版本保存的 OpenCode Go 直连地址在浏览器里一定失败，加载时顺手
        // 换成当前 PocketBase 的中转地址，用户不用重新配置。
        const { settings: next, changed } = migrateAiSettings(
            readAiSettings(),
            openCodeRelayBaseUrl(pb.baseUrl),
        );
        if (changed) writeAiSettings(next);
        return next;
    });
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
            configured: isAiConfigured(settings),
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
