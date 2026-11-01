import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import AiSettingsSheet from "./AiSettings";
import {
    isAiConfigured,
    readAiSettings,
    writeAiSettings,
    type AiSettings,
} from "./config";

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
        </AiContext.Provider>
    );
}

export function useAi() {
    const ctx = useContext(AiContext);
    if (!ctx) throw new Error("useAi 必须在 AiProvider 内使用");
    return ctx;
}
