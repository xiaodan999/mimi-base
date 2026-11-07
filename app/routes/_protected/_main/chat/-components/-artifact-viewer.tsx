import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { Download, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import {
    artifactFileName,
    prepareHtmlPreview,
    prettyJson,
    textArtifactInfo,
    type TextArtifactKind,
} from "@/app/chat/artifacts";
import type { ChatArtifactPart, SandboxFiles } from "@/app/chat/types";
import ImageViewer from "@/app/feed/components/image-viewer";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { getFileUrl } from "@/lib/pb";

import { MarkdownView } from "./-markdown";

type ArtifactPreview =
    | { type: "image"; name: string; url: string }
    | {
          type: TextArtifactKind;
          name: string;
          mime: string;
          source: string;
      };

export type ArtifactActions = {
    /** Open a file from `sandbox_files` (text, HTML, SVG, ...). */
    openSandboxFile: (path: string) => void;
    /** Open an artifact part; sandbox parts resolve their text snapshot. */
    openArtifact: (part: ChatArtifactPart) => void;
    downloadSandboxFile: (path: string) => void;
    downloadArtifact: (part: ChatArtifactPart) => void;
    /** Protected-file URL for a binary artifact, rebuilt with a fresh token. */
    artifactUrl: (part: ChatArtifactPart) => string;
};

const noop = () => {};

const ArtifactActionsContext = createContext<ArtifactActions>({
    openSandboxFile: noop,
    openArtifact: noop,
    downloadSandboxFile: noop,
    downloadArtifact: noop,
    artifactUrl: () => "",
});

const SandboxFilesContext = createContext<SandboxFiles>({});

export function useArtifactActions(): ArtifactActions {
    return useContext(ArtifactActionsContext);
}

/** Latest snapshot, used by the artifact cards to resolve their text. */
export function useSandboxFiles(): SandboxFiles {
    return useContext(SandboxFilesContext);
}

function saveBlob(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifactFileName(name);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadUrl(name: string, url: string) {
    if (!url) throw new Error("文件地址还没准备好");
    // The protected-file URL carries its token in the query string, so a
    // plain fetch works without the PocketBase auth header.
    const response = await fetch(url);
    if (!response.ok) throw new Error("下载失败");
    saveBlob(name, await response.blob());
}

/**
 * Full-screen viewer for sandbox text artifacts and uploaded images.
 *
 * HTML/SVG render in `<iframe sandbox="">` (no scripts, opaque origin) with
 * an injected CSP; markdown uses the static renderer; everything else is a
 * scrollable `<pre>`. Images reuse the feed's gesture viewer.
 */
export function ArtifactPreviewProvider({
    files,
    children,
}: {
    files: SandboxFiles;
    children: ReactNode;
}) {
    const [preview, setPreview] = useState<ArtifactPreview | null>(null);

    const artifactUrl = useCallback((part: ChatArtifactPart): string => {
        if (part.source !== "file") return "";
        return getFileUrl(
            {
                id: part.artifactId,
                collectionId: part.collectionId || undefined,
                collectionName: "chat_artifacts",
            },
            part.file,
        );
    }, []);

    const openSandboxFile = useCallback(
        (path: string) => {
            const source = files[path];
            if (source === undefined) {
                toast.error("这个文件已经从沙箱里删除了");
                return;
            }
            const info = textArtifactInfo(path);
            setPreview({
                type: info.kind,
                name: info.name,
                mime: info.mime,
                source,
            });
        },
        [files],
    );

    const openArtifact = useCallback(
        (part: ChatArtifactPart) => {
            if (part.source === "sandbox") {
                openSandboxFile(part.path);
                return;
            }
            const url = artifactUrl(part);
            if (!url) {
                toast.error("图片地址还没准备好，稍后再试");
                return;
            }
            setPreview({ type: "image", name: part.name, url });
        },
        [artifactUrl, openSandboxFile],
    );

    const downloadSandboxFile = useCallback(
        (path: string) => {
            const source = files[path];
            if (source === undefined) {
                toast.error("这个文件已经从沙箱里删除了");
                return;
            }
            const info = textArtifactInfo(path);
            saveBlob(
                info.name,
                new Blob([source], { type: `${info.mime};charset=utf-8` }),
            );
        },
        [files],
    );

    const downloadArtifact = useCallback(
        (part: ChatArtifactPart) => {
            if (part.source === "sandbox") {
                downloadSandboxFile(part.path);
                return;
            }
            void toast.promise(downloadUrl(part.name, artifactUrl(part)), {
                loading: "正在准备下载…",
                success: "已开始下载",
                error: "下载失败",
            });
        },
        [artifactUrl, downloadSandboxFile],
    );

    const actions = useMemo<ArtifactActions>(
        () => ({
            openSandboxFile,
            openArtifact,
            downloadSandboxFile,
            downloadArtifact,
            artifactUrl,
        }),
        [
            artifactUrl,
            downloadArtifact,
            downloadSandboxFile,
            openArtifact,
            openSandboxFile,
        ],
    );

    return (
        <SandboxFilesContext.Provider value={files}>
            <ArtifactActionsContext.Provider value={actions}>
                {children}
                {preview?.type === "image" ? (
                    <ImageViewer
                        images={[{ name: preview.name, url: preview.url }]}
                        index={0}
                        open
                        onOpenChange={(open) => {
                            if (!open) setPreview(null);
                        }}
                    />
                ) : preview ? (
                    <Dialog
                        open
                        onOpenChange={(open) => {
                            if (!open) setPreview(null);
                        }}
                    >
                        <DialogContent
                            showCloseButton={false}
                            overlayClassName="bg-black/70"
                            className="flex h-[100dvh] w-screen max-w-none !animate-none flex-col gap-0 rounded-none border-0 bg-background p-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none sm:rounded-none"
                        >
                            <DialogTitle className="sr-only">
                                {preview.name}
                            </DialogTitle>
                            <DialogDescription className="sr-only">
                                文件预览，脚本不会运行
                            </DialogDescription>
                            <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="关闭预览"
                                    onClick={() => setPreview(null)}
                                >
                                    <X className="size-4" />
                                </Button>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                        {preview.name}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <ShieldCheck
                                            className="size-3"
                                            aria-hidden
                                        />
                                        隔离预览 · 脚本已禁用
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="下载文件"
                                    onClick={() =>
                                        saveBlob(
                                            preview.name,
                                            new Blob([preview.source], {
                                                type: `${preview.mime};charset=utf-8`,
                                            }),
                                        )
                                    }
                                >
                                    <Download className="size-4" />
                                </Button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden bg-white">
                                {preview.type === "html" ||
                                preview.type === "svg" ? (
                                    <iframe
                                        title={preview.name}
                                        sandbox=""
                                        referrerPolicy="no-referrer"
                                        srcDoc={prepareHtmlPreview(
                                            preview.source,
                                        )}
                                        className="h-full w-full border-0 bg-white"
                                    />
                                ) : preview.type === "markdown" ? (
                                    <div className="h-full overflow-y-auto bg-background px-4 py-5">
                                        <MarkdownView text={preview.source} />
                                    </div>
                                ) : (
                                    <div className="h-full overflow-auto bg-background p-3">
                                        <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed">
                                            {preview.type === "json"
                                                ? prettyJson(preview.source)
                                                : preview.source}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                ) : null}
            </ArtifactActionsContext.Provider>
        </SandboxFilesContext.Provider>
    );
}
