import { Ellipsis, Heart, MessageCircle, User } from "lucide-react";

import { Button } from "@/components/ui/button";

// import TouXiang from "@/components/TouXiang";

export default function Post() {
    return (
        <article className="px-4 py-3">
            <div className="row flex gap-2">
                {/* profile image */}
                <User className="size-10" />
                {/* main content */}
                <div className="flex-1">
                    {/* author info */}
                    <div className="row mb-[2px] flex h-5 justify-between font-bold leading-5">
                        <div>
                            <span>小海</span>
                        </div>
                        <Button className="size-5 p-0" variant="ghost">
                            <Ellipsis
                                onClick={() => {
                                    console.log("click dots");
                                }}
                            />
                        </Button>
                    </div>
                    {/* text */}
                    <div>
                        Been enjoying using the Grok 2 model. Now on Perplexity
                        iOS app too for Pro users. (Restart app if you don’t see
                        it on “Settings-AI Model”)
                    </div>
                    {/* images */}
                    <div className="mt-2">
                        <time
                            className="text-sm font-normal text-muted-foreground"
                            dateTime={new Date().toISOString()}
                        >
                            2024年11月22日 13:21
                        </time>
                    </div>
                    {/* interactions */}
                    <div className="mt-3 flex flex-row justify-start gap-4">
                        <Button className="h-5 p-0" variant="ghost">
                            <MessageCircle className="size-4" />
                            <span className="pl-1 leading-4">18</span>
                        </Button>

                        <Button className="h-5 p-0" variant="ghost">
                            <Heart className="size-4" />
                            <span className="pl-1 leading-4">3</span>
                        </Button>
                    </div>
                </div>
            </div>
        </article>
    );
}
