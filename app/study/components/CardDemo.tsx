import { Suspense } from "react";

import type { Card } from "../types";
import GenericRecall from "./widgets/GenericRecall";
import { WIDGETS } from "./widgets/registry";

/**
 * 知识卡顶部的互动区。
 * 有演示 id 的卡走对应的 React 互动组件（按需加载）；没有演示的卡用「关键词回忆」。
 */
export default function CardDemo({ card }: { card: Card }) {
    const Widget = card.demo ? WIDGETS[card.demo] : undefined;

    return (
        <div className="demo iw-wrap">
            {Widget ? (
                <Suspense
                    fallback={<div className="iw st-tiny">互动加载中…</div>}
                >
                    <Widget card={card} />
                </Suspense>
            ) : (
                <GenericRecall card={card} />
            )}
        </div>
    );
}
