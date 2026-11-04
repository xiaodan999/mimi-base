import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { Move, ZoomIn } from "lucide-react";
import { toast } from "sonner";

import { CircleRing } from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { clampOffset, coverScale, cropRect, type CropOffset } from "./crop";

const VIEWPORT = 264;
const OUTPUT = 512;

type LoadedImage = {
    element: HTMLImageElement;
    url: string;
};

type AvatarCropperProps = {
    file: File | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    ring: { circleUrl: string; preset: string };
    busy?: boolean;
    onConfirm: (blob: Blob) => Promise<void>;
};

export default function AvatarCropper({
    file,
    open,
    onOpenChange,
    ring,
    busy = false,
    onConfirm,
}: AvatarCropperProps) {
    const [image, setImage] = useState<LoadedImage | null>(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
    const drag = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        origin: CropOffset;
    } | null>(null);

    useEffect(() => {
        if (!file) {
            setImage(null);
            return;
        }

        const url = URL.createObjectURL(file);
        const element = new Image();
        let cancelled = false;

        element.onload = () => {
            if (!cancelled) setImage({ element, url });
        };
        element.onerror = () => {
            if (!cancelled) setImage(null);
        };
        element.src = url;

        return () => {
            cancelled = true;
            URL.revokeObjectURL(url);
        };
    }, [file]);

    useEffect(() => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
    }, [file]);

    const geometry = useMemo(
        () => ({
            viewport: VIEWPORT,
            naturalWidth: image?.element.naturalWidth ?? 0,
            naturalHeight: image?.element.naturalHeight ?? 0,
            zoom,
        }),
        [image, zoom],
    );

    const scale = coverScale(
        VIEWPORT,
        geometry.naturalWidth,
        geometry.naturalHeight,
    );

    const updateZoom = (next: number) => {
        setZoom(next);
        setOffset((current) =>
            clampOffset(
                current,
                VIEWPORT,
                geometry.naturalWidth,
                geometry.naturalHeight,
                next,
            ),
        );
    };

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!image || busy) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin: offset,
        };
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = drag.current;
        if (!state || state.pointerId !== event.pointerId) return;
        setOffset(
            clampOffset(
                {
                    x: state.origin.x + (event.clientX - state.startX),
                    y: state.origin.y + (event.clientY - state.startY),
                },
                VIEWPORT,
                geometry.naturalWidth,
                geometry.naturalHeight,
                zoom,
            ),
        );
    };

    const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId === event.pointerId) {
            drag.current = null;
        }
    };

    const handleConfirm = async () => {
        if (!image || busy) return;

        const { sx, sy, sw, sh } = cropRect(geometry, offset);
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT;
        canvas.height = OUTPUT;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("当前浏览器不支持图片裁剪");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image.element, sx, sy, sw, sh, 0, 0, OUTPUT, OUTPUT);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, "image/webp", 0.92);
        });
        if (!blob) throw new Error("头像导出失败");

        await onConfirm(blob);
    };

    const drawnWidth = geometry.naturalWidth * scale * zoom;
    const drawnHeight = geometry.naturalHeight * scale * zoom;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm rounded-2xl">
                <DialogHeader>
                    <DialogTitle>调整头像</DialogTitle>
                    <DialogDescription>
                        拖动调整位置，滑动滑块缩放，确认后上传。
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center gap-4">
                    <div
                        className="relative touch-none overflow-hidden rounded-full bg-muted"
                        style={{ width: VIEWPORT, height: VIEWPORT }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                    >
                        {image ? (
                            <img
                                alt="头像裁剪预览"
                                className="pointer-events-none absolute max-w-none select-none"
                                draggable={false}
                                src={image.url}
                                style={{
                                    width: drawnWidth,
                                    height: drawnHeight,
                                    left:
                                        (VIEWPORT - drawnWidth) / 2 + offset.x,
                                    top:
                                        (VIEWPORT - drawnHeight) / 2 + offset.y,
                                }}
                            />
                        ) : (
                            <div className="grid h-full w-full place-items-center">
                                <LoadingSpinner size={22} />
                            </div>
                        )}
                        <CircleRing
                            circleUrl={ring.circleUrl}
                            preset={ring.preset}
                            className="absolute inset-0 h-full w-full"
                        />
                    </div>

                    <div className="flex w-full items-center gap-3 text-muted-foreground">
                        <Move className="size-4 shrink-0" aria-hidden="true" />
                        <ZoomIn
                            className="size-4 shrink-0"
                            aria-hidden="true"
                        />
                        <input
                            aria-label="缩放头像"
                            className="w-full accent-primary"
                            max={4}
                            min={1}
                            onChange={(event) =>
                                updateZoom(Number(event.target.value))
                            }
                            step={0.01}
                            type="range"
                            value={zoom}
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        disabled={busy}
                        onClick={() => onOpenChange(false)}
                        type="button"
                        variant="outline"
                    >
                        取消
                    </Button>
                    <Button
                        disabled={!image || busy}
                        onClick={() => {
                            handleConfirm().catch((error: unknown) => {
                                toast.error(
                                    error instanceof Error
                                        ? error.message
                                        : "头像处理失败",
                                );
                            });
                        }}
                        type="button"
                    >
                        {busy ? <LoadingSpinner size={14} /> : "保存头像"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
