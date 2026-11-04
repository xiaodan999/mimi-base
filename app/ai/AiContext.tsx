import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

// AI sheets live in the app shell, but the settings panel still uses the study
// design tokens (`st-*`), so load that stylesheet once for every page.
// Never put `.study-root` on a sheet wrapper: its `:where(button)` reset wipes
// the background/border of the shadcn buttons these sheets use.
import "@/app/study/study.css";

import AiSettingsSheet from "./AiSettings";
import {
    isAiConfigured,
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
