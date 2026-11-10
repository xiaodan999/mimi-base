import AiSheet from "@/app/ai/AiSheet";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { type PostData } from "../data";
import ImageViewer from "./image-viewer";
import PostComposerForm from "./PostComposerForm";
import { useCaptionTask } from "./useCaptionTask";
import { usePostDraft } from "./usePostDraft";

type PostComposerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** When set, the composer edits this post instead of creating one. */
    editing?: PostData | null;
};

/**
 * Thin composition shell: the draft lives in `usePostDraft`, the AI caption
 * task in `useCaptionTask`, and the visible form in `PostComposerForm` /
 * `PostComposerImages`. This component just wires them together and owns the
 * drawers/overlays that sit outside the form's portal.
 */
export default function PostComposer({
    open,
    onOpenChange,
    editing = null,
}: PostComposerProps) {
    const draft = usePostDraft({ open, editing, onOpenChange });
    const caption = useCaptionTask({
        open,
        text: draft.text,
        setText: draft.setText,
        layout: draft.layout,
        images: draft.images,
        video: draft.video,
        seededKey: draft.seededKey,
    });

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            draft.setPreviewIndex(null);
            // The caption sheet lives outside the drawer's portal; leaving it
            // open would strand a dead sheet over the feed.
            caption.setCaptionOpen(false);
            // An edit re-seeds from the saved post next time it opens, so a
            // copied draft can never drift away from the record.
            if (editing) draft.setSeededKey(null);
        }
        onOpenChange(next);
    };

    return (
        <>
            <Drawer open={open} onOpenChange={handleOpenChange}>
                {/* On tablets/desktop the sheet floats as a centered card
                    instead of stretching edge to edge, and the drag handle is
                    hidden because the close button is the obvious affordance
                    with a mouse. `overflow-clip` (not `hidden`): hidden still
                    lets focus scrollIntoView scroll this container, which
                    pushes the header out of the sheet when the draft grows.
                    The primitive's handle is replaced by one inside the header
                    so the tint reaches the sheet's top edge. */}
                <DrawerContent className="kb-max-h mx-auto w-full max-w-2xl overflow-clip rounded-t-3xl border-x-0 border-b-0 border-t border-border/70 p-0 shadow-lift md:mb-5 md:rounded-3xl md:border md:[--kb-max-offset:28px] [&>div:first-child]:hidden">
                    <PostComposerForm
                        draft={draft}
                        caption={caption}
                        open={open}
                        onClose={() => handleOpenChange(false)}
                    />
                </DrawerContent>
            </Drawer>

            {draft.previewIndex !== null && (
                <ImageViewer
                    images={draft.images.map((image) => ({
                        name: image.url,
                        url: image.url,
                    }))}
                    index={draft.previewIndex}
                    open
                    onOpenChange={(next) => {
                        if (!next) draft.setPreviewIndex(null);
                    }}
                />
            )}

            <AiSheet
                open={caption.captionOpen}
                onClose={() => caption.setCaptionOpen(false)}
                title="AI 配文"
                subtitle={
                    draft.images.length > 0
                        ? `参考了 ${Math.min(draft.images.length, 3)} 张照片`
                        : draft.video
                          ? "视频不会发给 AI，只参考你写的文字"
                          : "参考你写的半句话"
                }
            >
                <div className="space-y-2 pb-2">
                    {caption.captionLoading && (
                        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-6 text-sm text-muted-foreground">
                            <LoadingSpinner size={16} />
                            AI 正在看照片...
                        </div>
                    )}

                    {caption.captionError && (
                        <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
                            {caption.captionError}
                            <button
                                type="button"
                                className="ml-1 font-semibold underline"
                                onClick={() =>
                                    void caption.suggestCaptions({
                                        force: true,
                                    })
                                }
                            >
                                重试
                            </button>
                        </div>
                    )}

                    {caption.captions.map((item) => (
                        <button
                            key={`${item.style}-${item.text}`}
                            type="button"
                            onClick={() => caption.applyCaption(item.text)}
                            className="w-full rounded-2xl border border-border/60 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
                        >
                            <span className="text-[11px] font-semibold text-primary">
                                {item.style}
                            </span>
                            <span className="mt-1 block text-sm leading-6">
                                {item.text}
                            </span>
                        </button>
                    ))}

                    {!caption.captionLoading && (
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() =>
                                void caption.suggestCaptions({ force: true })
                            }
                        >
                            换一批
                        </Button>
                    )}

                    <p className="pt-1 text-center text-[10px] text-muted-foreground">
                        点一句填进输入框，还能继续改
                    </p>
                </div>
            </AiSheet>
        </>
    );
}
