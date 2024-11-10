import { useState } from "react";
import clsx from "clsx";

import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { toastPromise } from "@/lib/toast-promise";

import { useNewPostMutation } from "../-data";

type NewPostProps = {
    onClose?: () => void;
    onSuccess?: () => void;
};

export default function NewPost({
    onClose = () => {},
    onSuccess = () => {},
}: NewPostProps) {
    const { user } = useAuth();
    const newPostMutation = useNewPostMutation();
    const [text, setText] = useState("");
    return (
        <div className="p-4">
            <div className="mb-4 flex justify-between">
                <Button variant="ghost" size="sm" onClick={onClose}>
                    X
                </Button>
                <Button
                    size="sm"
                    className="px-6"
                    disabled={text.length === 0 || newPostMutation.isPending}
                    onClick={async () => {
                        await toastPromise(
                            newPostMutation.mutateAsync({ text }),
                            {
                                loading: "发布新帖子中...",
                                success: "成功发布了一个帖子",
                                error: "发布失败",
                            },
                        );

                        onSuccess();
                    }}
                >
                    {newPostMutation.isPending && (
                        <LoadingSpinner className="absolute" size={16} />
                    )}
                    <span
                        className={clsx({
                            ["invisible"]: newPostMutation.isPending,
                        })}
                    >
                        发布
                    </span>
                </Button>
            </div>
            <div className="flex gap-2">
                <TouXiang
                    className="flex-shrink-0"
                    circleUrl={user.circle}
                    touXiangUrl={user.tou_xiang}
                    size={40}
                />
                <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-[200px]"
                    placeholder="记录一下"
                />
            </div>
        </div>
    );
}
