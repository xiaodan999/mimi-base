/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_POCKETBASE_URL: string;
}

declare const APP_VERSION: string;
declare const APP_SHA: string;

// The PWA share target hands a draft through history state (/share → thread).
declare module "@tanstack/history" {
    interface HistoryState {
        draft?: string;
    }
}
