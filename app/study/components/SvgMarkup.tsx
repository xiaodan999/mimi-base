/**
 * 渲染本仓库代码里拼出来的 SVG 字符串。
 *
 * 这是学习模块里唯一保留 `dangerouslySetInnerHTML` 的地方：`svg` 只能来自
 * `demos.ts` 等本地生成器，绝不接受题库、卡片或任何运行时内容。字符串内容
 * 一律走 `rich-text.tsx` 的 `renderRichText`。
 */
export function SvgMarkup({
    svg,
    className,
}: {
    svg: string;
    className?: string;
}) {
    return (
        <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />
    );
}
