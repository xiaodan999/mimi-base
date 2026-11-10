/**
 * 学习基地唯一还在使用的内联 SVG 动画：压疮分层剖面。
 *
 * 以前这里有 21 个 SVG demo，其中 20 个没有任何引用（React widgets 已经把它们
 * 重写了一遍），却全部被打进 bundle。现在只保留 SkinWidget 用到的 skin。
 * 它返回一段 SVG 字符串，由 SkinWidget 渲染；颜色走 CSS 变量跟随主题。
 *
 * 注：SkinWidget 通过 `components/SvgMarkup.tsx` 注入这枚 SVG（内容是本文件
 * 里完全可信的硬编码字符串，不含任何用户输入）；题库文本一律走
 * `rich-text.tsx` 的 `renderRichText`。
 */
/* biome-ignore-all lint/suspicious/noExplicitAny: 演示函数的参数由调用方随意传入，取用前都按字符串处理 */
type DemoFn = (...args: any[]) => string;

/* ---- 压疮分层剖面 ---- */
function skin(stage: string): string {
    const L = {
        epi: "#fbcfe8",
        der: "#f9a8d4",
        sub: "#fde68a",
        mus: "#fca5a5",
        bone: "#e5e7eb",
    };
    const crater: Record<string, string> = {
        1: `<ellipse cx="160" cy="40" rx="34" ry="7" fill="#ef4444" opacity=".55"/>`,
        2: `<path d="M126,40 Q160,86 194,40 Z" fill="#f87171"/><path d="M126,40 Q160,86 194,40" fill="none" stroke="#dc2626" stroke-width="2"/>`,
        3: `<path d="M120,40 Q160,128 200,40 Z" fill="#f87171"/><path d="M136,96 Q160,116 184,96 Q160,106 136,96Z" fill="#fbbf24"/>`,
        4: `<path d="M116,40 Q160,158 204,40 Z" fill="#f87171"/><ellipse cx="160" cy="150" rx="16" ry="6" fill="#d1d5db"/><path d="M140,110 Q160,126 180,110 Q160,120 140,110Z" fill="#fbbf24"/>`,
        d: `<ellipse cx="160" cy="46" rx="30" ry="16" fill="#7c3aed" opacity=".65"/><ellipse cx="160" cy="46" rx="12" ry="7" fill="#4c1d95" opacity=".6"/>`,
        u: `<path d="M120,40 Q160,120 200,40 Z" fill="#f87171"/><path d="M120,40 Q160,64 200,40 Q160,52 120,40Z" fill="#78350f"/>`,
    };
    const txt: Record<string, string> = {
        1: "Ⅰ期 指压不变白红斑",
        2: "Ⅱ期 部分皮层缺损/水泡",
        3: "Ⅲ期 全层缺损至皮下脂肪",
        4: "Ⅳ期 深达骨骼/肌腱/肌肉",
        d: "深部组织损伤（DTPI）",
        u: "不可分期（焦痂/腐肉覆盖）",
    };
    return `<svg viewBox="0 0 320 176" class="dm">
  <rect x="70" y="26" width="180" height="14" fill="${L.epi}"/>
  <rect x="70" y="40" width="180" height="34" fill="${L.der}"/>
  <rect x="70" y="74" width="180" height="40" fill="${L.sub}"/>
  <rect x="70" y="114" width="180" height="34" fill="${L.mus}"/>
  <rect x="70" y="148" width="180" height="16" fill="${L.bone}"/>
  <g opacity=".35" font-size="7.5" fill="#334155">
    <text x="74" y="36">表皮</text><text x="74" y="60">真皮</text><text x="74" y="96">皮下脂肪</text><text x="74" y="134">肌肉</text><text x="74" y="159">骨</text>
  </g>
  ${crater[stage] || ""}
  <g class="blink" stroke="#dc2626" stroke-width="1.6" fill="none" stroke-linecap="round">
    <path d="M258 30v26m-4-5l4 5 4-5"/><path d="M258 100v26m-4-5l4 5 4-5"/>
  </g>
  <text x="276" y="46" font-size="8" fill="#dc2626">压</text>
  <text x="276" y="56" font-size="8" fill="#dc2626">力</text>
  <text x="160" y="174" font-size="10" font-weight="700" fill="var(--ink)" text-anchor="middle">${txt[stage]}</text>
</svg>`;
}

export const DEMOS: Record<string, DemoFn> = {
    skin: (stage) => skin(stage),
};
