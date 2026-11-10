import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "mimi-theme";

type ThemeContextValue = {
    mode: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setMode: (mode: ThemeMode) => void;
    toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ResolvedTheme {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function readMode(): ThemeMode {
    if (typeof window === "undefined") return "system";
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        if (value === "light" || value === "dark" || value === "system") {
            return value;
        }
    } catch {
        // Private mode / storage disabled.
    }
    return "system";
}

const THEME_COLORS: Record<ResolvedTheme, string> = {
    light: "#c5f4d2",
    dark: "#0e1512",
};

function applyTheme(theme: ResolvedTheme) {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    // The two <meta name="theme-color"> tags are keyed to the OS
    // prefers-color-scheme, not the app's .dark class. Overwrite both with the
    // resolved theme so a manual toggle also updates the status bar (the
    // pre-paint script in index.html does the same on first load).
    const color = THEME_COLORS[theme];
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.setAttribute("content", color);
    });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<ThemeMode>(readMode);
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
        mode === "system" ? systemTheme() : mode,
    );

    // Apply whenever the explicit mode changes.
    useEffect(() => {
        const next = mode === "system" ? systemTheme() : mode;
        setResolvedTheme(next);
        applyTheme(next);
    }, [mode]);

    // Follow the OS while in "system" mode.
    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => {
            if (mode !== "system") return;
            const next = systemTheme();
            setResolvedTheme(next);
            applyTheme(next);
        };
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, [mode]);

    // Keep multiple tabs in sync.
    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key === STORAGE_KEY) setModeState(readMode());
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const setMode = useCallback((next: ThemeMode) => {
        setModeState(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Ignore storage failures; the in-memory mode still applies.
        }
    }, []);

    const toggle = useCallback(() => {
        setMode(resolvedTheme === "dark" ? "light" : "dark");
    }, [resolvedTheme, setMode]);

    const value = useMemo(
        () => ({ mode, resolvedTheme, setMode, toggle }),
        [mode, resolvedTheme, setMode, toggle],
    );

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
    return ctx;
}
