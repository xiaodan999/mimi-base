import { DEMOS } from "../demos";

/** 渲染 demos.ts 里的一枚内联 SVG 动画 */
export default function Demo({
    id,
    arg,
}: {
    id: string;
    arg?: string | string[];
}) {
    const render = DEMOS[id];
    if (!render) return null;
    let svg = "";
    try {
        svg = render(arg);
    } catch {
        return null;
    }
    return <div className="demo" dangerouslySetInnerHTML={{ __html: svg }} />;
}
