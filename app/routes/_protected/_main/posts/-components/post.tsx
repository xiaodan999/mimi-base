import { format } from "date-fns/esm";
import { Ellipsis, Heart, MessageCircle } from "lucide-react";

import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";

import { PostData } from "../-data";

export default function Post({ author, text, createdAt, metrics }: PostData) {
    return (
        <article className="px-4 py-3">
            <div className="row flex gap-2">
                {/* profile image */}
                <TouXiang
                    circleUrl={author.circle}
                    size={40}
                    touXiangUrl={author.tou_xiang}
                />
                {/* main content */}
                <div className="flex-1">
                    {/* author info */}
                    <div className="row mb-[2px] flex h-5 justify-between font-bold leading-5">
                        <div>
                            <span>{author.user_name}</span>
                        </div>
                        <Button
                            type="button"
                            className="size-5 p-0"
                            variant="ghost"
                        >
                            <Ellipsis
                                onClick={() => {
                                    console.log("click dots");
                                }}
                            />
                        </Button>
                    </div>
                    {/* text */}
                    <div>{text}</div>
                    {/* images */}
                    <div className="mt-2">
                        <time
                            className="text-sm font-normal text-muted-foreground"
                            dateTime={new Date().toISOString()}
                        >
                            {format(
                                new Date(createdAt),
                                "yyyy年MM月dd日 HH:mm",
                            )}
                        </time>
                    </div>
                    {/* interactions */}
                    <div className="mt-3 flex flex-row justify-start gap-4">
                        <Button
                            type="button"
                            className="h-5 p-0"
                            variant="ghost"
                        >
                            <MessageCircle className="size-4" />
                            <span className="pl-1 leading-4">
                                {metrics.replyCount}
                            </span>
                        </Button>

                        <Button
                            type="button"
                            className="h-5 p-0"
                            variant="ghost"
                        >
                            <Heart className="size-4" />
                            <span className="pl-1 leading-4">
                                {metrics.likeCount}
                            </span>
                        </Button>
                    </div>
                </div>
            </div>
        </article>
    );
}
