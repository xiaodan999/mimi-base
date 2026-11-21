import { useAui } from "@assistant-ui/react";
import { useEffect, useRef, useState } from "react";

import { FILE_ACCEPT, type PendingAttachment } from "@/app/chat/attachments";

import { AttachmentSheet } from "./-attachment-sheet";
import { ChatComposer } from "./-chat-composer";
import { PostsImagePicker } from "./-posts-image-picker";

/** One-shot composer prefill for the share-target handoff. */
function ComposerSeed({ draft }: { draft: string }) {
    const aui = useAui();
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current || draft === "") return;
        seeded.current = true;
        aui.composer.setText(draft);
        // Strip the state so going back/forward does not re-seed an old draft.
        window.history.replaceState({}, "");
    }, [aui, draft]);
    return null;
}

type Props = {
    images: string[];
    addingImages: boolean;
    docs: readonly PendingAttachment[];
    disabled: boolean;
    inputPending: boolean;
    running: boolean;
    contextUsed: number;
    contextTotal: number;
    visionEnabled: boolean;
    initialDraft: string;
    onRemoveImage: (index: number) => void;
    onRemoveDoc: (index: number) => void;
    onSendAttachmentsOnly: () => void;
    onStop: () => void;
    onAddImages: (files: FileList | null) => void;
    onAddDocs: (files: FileList | null) => void;
    onPickedImage: (dataUrl: string) => void;
};

/**
 * Composer wiring: the input itself, hidden file inputs, the attachment and
 * post-image sheets, and the share-target draft seed.
 */
export default function ThreadComposer({
    images,
    addingImages,
    docs,
    disabled,
    inputPending,
    running,
    contextUsed,
    contextTotal,
    visionEnabled,
    initialDraft,
    onRemoveImage,
    onRemoveDoc,
    onSendAttachmentsOnly,
    onStop,
    onAddImages,
    onAddDocs,
    onPickedImage,
}: Props) {
    const [attachOpen, setAttachOpen] = useState(false);
    const [postsOpen, setPostsOpen] = useState(false);
    const docInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    return (
        <>
            <ChatComposer
                images={images}
                addingImages={addingImages}
                docs={docs}
                disabled={disabled}
                inputPending={inputPending}
                running={running}
                contextUsage={{
                    used: contextUsed,
                    total: contextTotal,
                }}
                onOpenAttach={() => setAttachOpen(true)}
                onRemoveImage={onRemoveImage}
                onRemoveDoc={onRemoveDoc}
                onSendAttachmentsOnly={onSendAttachmentsOnly}
                onStop={onStop}
            />

            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    onAddImages(event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={docInputRef}
                type="file"
                accept={FILE_ACCEPT}
                multiple
                className="hidden"
                onChange={(event) => {
                    onAddDocs(event.target.files);
                    event.target.value = "";
                }}
            />
            <AttachmentSheet
                open={attachOpen}
                onOpenChange={setAttachOpen}
                visionEnabled={visionEnabled}
                addingImages={addingImages}
                onPickAlbum={() => imageInputRef.current?.click()}
                onPickPosts={() => setPostsOpen(true)}
                onPickFiles={() => docInputRef.current?.click()}
            />
            <PostsImagePicker
                open={postsOpen}
                onOpenChange={setPostsOpen}
                onPicked={onPickedImage}
            />
            <ComposerSeed draft={initialDraft} />
        </>
    );
}
