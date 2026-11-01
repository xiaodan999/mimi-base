/**
 * 学习基地的 21 个内联 SVG 动画演示。
 * 每个函数返回一段 <svg> 字符串，由 <Demo /> 通过 dangerouslySetInnerHTML 渲染。
 * 颜色全部走 CSS 变量（var(--ink) 等），跟随 study.css 的主题。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type DemoFn = (...args: any[]) => string;
const D: Record<string, DemoFn> = {};

/* ---- 1 身份识别：腕带 + 双人核对 ---- */
D.wristband = () => `
<svg viewBox="0 0 320 176" class="dm">
  <defs><linearGradient id="wbg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#0284c7"/></linearGradient></defs>
  <rect x="26" y="64" width="118" height="48" rx="24" fill="var(--card2)" stroke="var(--line)" stroke-width="1.5"/>
  <rect x="76" y="58" width="24" height="60" rx="8" fill="url(#wbg)"/>
  <text x="88" y="88" font-size="7.5" fill="#fff" text-anchor="middle" letter-spacing="3" transform="rotate(-90 88 88)">腕带</text>
  <g class="pop" style="animation-delay:.15s">
    <rect x="172" y="34" width="128" height="30" rx="10" fill="var(--card)" stroke="var(--line)"/>
    <text x="184" y="53" font-size="10.5" fill="var(--ink)">① 姓名</text>
    <circle cx="286" cy="49" r="8.5" fill="#16a34a"/>
    <path d="M282.5 49l2.5 2.5 4-4.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </g>
  <g class="pop" style="animation-delay:.7s">
    <rect x="172" y="72" width="128" height="30" rx="10" fill="var(--card)" stroke="var(--line)"/>
    <text x="184" y="91" font-size="10.5" fill="var(--ink)">② 住院号</text>
    <circle cx="286" cy="87" r="8.5" fill="#16a34a"/>
    <path d="M282.5 87l2.5 2.5 4-4.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </g>
  <g class="pop" style="animation-delay:1.25s">
    <rect x="160" y="112" width="140" height="30" rx="10" fill="none" stroke="var(--brand)" stroke-dasharray="5 4" stroke-width="1.5"/>
    <text x="230" y="131" font-size="10" fill="var(--brand)" text-anchor="middle">反问式：您叫什么名字？</text>
  </g>
  <text x="88" y="136" font-size="9.5" fill="var(--ink3)" text-anchor="middle">两种以上方法</text>
  <text x="88" y="150" font-size="9.5" fill="var(--ink3)" text-anchor="middle">禁止只叫床号</text>
</svg>`;

/* ---- 2 手术安全核查：三个时点 ---- */
D.surgery3 = () => {
    const rows = [
        ["①", "麻醉实施前", "身份 · 术式 · 部位 · 知情同意"],
        ["②", "手术开始前（切皮前）", "部位标记 · 影像资料 · 器械"],
        ["③", "患者离室前", "标本 · 器械敷料清点 · 去向"],
    ];
    return `<svg viewBox="0 0 320 176" class="dm">
  <line x1="26" y1="30" x2="26" y2="150" stroke="var(--line)" stroke-width="3" stroke-linecap="round"/>
  <circle r="5.5" fill="var(--m1)">
    <animateMotion dur="4.5s" repeatCount="indefinite" path="M26,30 L26,90 L26,150"/>
  </circle>
  ${rows
      .map(
          (r, i) => `
  <g class="pop" style="animation-delay:${0.2 + i * 0.55}s">
    <rect x="42" y="${18 + i * 50}" width="264" height="40" rx="12" fill="var(--card)" stroke="var(--line)"/>
    <circle cx="60" cy="${38 + i * 50}" r="11" fill="var(--m1)" opacity=".14"/>
    <text x="60" y="${42 + i * 50}" font-size="11" fill="var(--m1)" text-anchor="middle" font-weight="700">${r[0]}</text>
    <text x="78" y="${34 + i * 50}" font-size="10.5" fill="var(--ink)" font-weight="700">${r[1]}</text>
    <text x="78" y="${49 + i * 50}" font-size="8.8" fill="var(--ink3)">${r[2]}</text>
  </g>`,
      )
      .join("")}
  <text x="160" y="170" font-size="8.5" fill="var(--ink3)" text-anchor="middle">三方（手术医师·麻醉师·护士）共同核查并签名</text>
</svg>`;
};

/* ---- 3 危急值仪表盘 ---- */
D.gauge = (label, value, unit, pct) => {
    const a = -90 + pct * 180;
    return `<svg viewBox="0 0 320 196" class="dm">
  <text x="160" y="14" font-size="8.8" fill="var(--no)" text-anchor="middle">⚠ 立即报告 · 复述 · 登记 · 处理</text>
  <path d="M72,116 A88,88 0 0 1 116,40" fill="none" stroke="#22c55e" stroke-width="12" stroke-linecap="round" opacity=".85"/>
  <path d="M122,34 A88,88 0 0 1 198,34" fill="none" stroke="#f59e0b" stroke-width="12" stroke-linecap="round" opacity=".85"/>
  <path d="M204,40 A88,88 0 0 1 248,116" fill="none" stroke="#ef4444" stroke-width="12" stroke-linecap="round" opacity=".9"/>
  <g style="transform-origin:160px 116px;--a:${a}deg;animation:d-needle 2.6s cubic-bezier(.22,1,.36,1) both">
    <line x1="160" y1="116" x2="160" y2="58" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="160" cy="116" r="6.5" fill="var(--ink)"/>
  </g>
  <text x="160" y="152" font-size="26" font-weight="800" fill="var(--no)" text-anchor="middle" class="fade" style="animation-delay:.9s">${value}</text>
  <text x="160" y="167" font-size="8.8" fill="var(--ink3)" text-anchor="middle">${unit}</text>
  <text x="160" y="186" font-size="11" font-weight="700" fill="var(--ink)" text-anchor="middle">${label}</text>
</svg>`;
};

/* ---- 4 通用纵向流程 ---- */
D.flow = (steps: string[]) => {
    const n = steps.length,
        top = 10,
        gap = Math.min(30, 158 / n);
    return `<svg viewBox="0 0 320 ${top * 2 + gap * n}" class="dm">
  <line x1="22" y1="${top + 8}" x2="22" y2="${top + gap * (n - 1) + 8}" stroke="var(--line)" stroke-width="2.5" stroke-linecap="round"/>
  ${steps
      .map((s, i) => {
          const y = top + i * gap;
          const fs = s.length > 17 ? 8.6 : s.length > 13 ? 9.2 : 10;
          return `<g class="fade" style="animation-delay:${i * 0.22}s">
      <circle cx="22" cy="${y + 8}" r="8.5" fill="var(--brand)" opacity="${0.35 + i * 0.1}"/>
      <text x="22" y="${y + 11.5}" font-size="8.5" fill="#fff" text-anchor="middle" font-weight="700">${i + 1}</text>
      <text x="38" y="${y + 11.5}" font-size="${fs}" fill="var(--ink)">${s}</text>
    </g>`;
      })
      .join("")}
</svg>`;
};

/* ---- 5 跌倒评分累加 ---- */
D.fall = () => {
    const items: [string, number][] = [
        ["年龄＞65岁", 1],
        ["一年内跌倒史", 1],
        ["无家人陪伴", 1],
        ["视力障碍", 1],
        ["体能虚弱/步态不稳", 3],
        ["头晕/体位性低血压", 2],
        ["特殊药物", 1],
    ];
    return `<svg viewBox="0 0 320 190" class="dm">
  <text x="12" y="14" font-size="9.5" fill="var(--ink3)">危险因子</text>
  <text x="250" y="14" font-size="9.5" fill="var(--ink3)">分值</text>
  ${items
      .map((it, i) => {
          const y = 26 + i * 20;
          const w = (it[1] / 3) * 88;
          return `<g>
      <text x="12" y="${y + 8}" font-size="8.8" fill="var(--ink)">${it[0]}</text>
      <rect x="186" y="${y}" width="88" height="11" rx="5.5" fill="var(--bg2)"/>
      <rect class="grow" x="186" y="${y}" width="${w}" height="11" rx="5.5" fill="${it[1] >= 3 ? "#ef4444" : it[1] === 2 ? "#f59e0b" : "#38bdf8"}" style="animation-delay:${0.15 + i * 0.12}s"/>
      <text x="284" y="${y + 9}" font-size="9" fill="var(--ink2)" font-weight="700">${it[1]}</text>
    </g>`;
      })
      .join("")}
  <rect x="8" y="170" width="304" height="0" fill="none"/>
  <rect x="8" y="168" width="304" height="16" rx="8" fill="var(--no-bg)"/>
  <text x="160" y="179.5" font-size="9" fill="var(--no)" text-anchor="middle" font-weight="700">累计 ≥4 分 = 高危 → 挂警示牌 · 每日评估 · 签告知书</text>
</svg>`;
};

/* ---- 6 Braden 六维雷达 ---- */
D.braden = () => {
    const cx = 150,
        cy = 94,
        R = 54;
    const axes: [string, number][] = [
        ["感觉", 4],
        ["湿度", 3],
        ["活动能力", 2],
        ["移动能力", 2],
        ["营养", 3],
        ["摩擦/剪切", 3],
    ];
    const ang = (i: number) => ((-90 + i * 60) * Math.PI) / 180;
    const pt = (i: number, r: number): [number, number] => [
        cx + r * Math.cos(ang(i)),
        cy + r * Math.sin(ang(i)),
    ];
    const ring = (r: number) =>
        axes
            .map((_, i) =>
                pt(i, r)
                    .map((v) => v.toFixed(1))
                    .join(","),
            )
            .join(" ");
    const poly = axes
        .map((a, i) =>
            pt(i, (a[1] / 4) * R)
                .map((v) => v.toFixed(1))
                .join(","),
        )
        .join(" ");
    const labels = axes
        .map((a, i) => {
            const [x, y] = pt(i, R + 21);
            const anchor =
                i === 0 || i === 3
                    ? "middle"
                    : i === 1 || i === 2
                      ? "start"
                      : "end";
            return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="8.5" fill="var(--ink2)" text-anchor="${anchor}">${a[0]} ${a[1]}</text>`;
        })
        .join("");
    return `<svg viewBox="0 0 320 176" class="dm">
  <polygon points="${ring(R)}" fill="none" stroke="var(--line)" stroke-width="1"/>
  <polygon points="${ring(R * 0.66)}" fill="none" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>
  <polygon points="${ring(R * 0.33)}" fill="none" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>
  ${axes
      .map((_, i) => {
          const [x, y] = pt(i, R);
          return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`;
      })
      .join("")}
  <polygon points="${poly}" fill="color-mix(in srgb, var(--m2) 30%, transparent)" stroke="var(--m2)" stroke-width="2"
    style="transform-box:fill-box;transform-origin:center;animation:d-pop .8s cubic-bezier(.34,1.4,.64,1) both"/>
  ${labels}
  <text x="286" y="30" font-size="9" fill="var(--ink3)" text-anchor="middle">满分</text>
  <text x="286" y="48" font-size="16" font-weight="800" fill="var(--m2)" text-anchor="middle">23</text>
  <text x="286" y="140" font-size="8.5" fill="var(--ink3)" text-anchor="middle">≤12 高危</text>
  <text x="286" y="152" font-size="8.5" fill="var(--ink3)" text-anchor="middle">≤9 极高危</text>
</svg>`;
};

/* ---- 7 压疮分层剖面 ---- */
D.skin = (stage: string) => {
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
};

/* ---- 8 约束 2 小时 ---- */
D.clock2h = () => `
<svg viewBox="0 0 320 176" class="dm">
  <circle cx="92" cy="88" r="56" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>
  ${[...Array(12)]
      .map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          return `<line x1="${(92 + 44 * Math.sin(a)).toFixed(1)}" y1="${(88 - 44 * Math.cos(a)).toFixed(1)}" x2="${(92 + 50 * Math.sin(a)).toFixed(1)}" y2="${(88 - 50 * Math.cos(a)).toFixed(1)}" stroke="var(--line)" stroke-width="2"/>`;
      })
      .join("")}
  <g style="transform-origin:92px 88px;animation:spin 6s linear infinite">
    <line x1="92" y1="88" x2="92" y2="52" stroke="var(--brand)" stroke-width="3" stroke-linecap="round"/>
  </g>
  <circle cx="92" cy="88" r="4" fill="var(--brand)"/>
  <path d="M92,88 L128,64" stroke="var(--no)" stroke-width="2.5" stroke-linecap="round"/>
  <text x="92" y="70" font-size="8" fill="var(--ink3)" text-anchor="middle">2h</text>
  <g class="fade">
    <rect x="164" y="34" width="140" height="34" rx="11" fill="var(--card)" stroke="var(--line)"/>
    <text x="234" y="55" font-size="9.5" fill="var(--ink)" text-anchor="middle">每 2 小时放松 3–5 分钟</text>
    <rect x="164" y="76" width="140" height="34" rx="11" fill="var(--card)" stroke="var(--line)"/>
    <text x="234" y="97" font-size="9.5" fill="var(--ink)" text-anchor="middle">评估皮肤 · 血运 · 记录</text>
    <rect x="164" y="118" width="140" height="34" rx="11" fill="var(--warn-bg)" stroke="none"/>
    <text x="234" y="139" font-size="9.5" fill="var(--warn)" text-anchor="middle" font-weight="700">需知情同意书</text>
  </g>
</svg>`;

/* ---- 9 疼痛 NRS ---- */
D.pain = () => `
<svg viewBox="0 0 320 176" class="dm">
  <defs><linearGradient id="pg" x1="0" x2="1">
    <stop offset="0" stop-color="#22c55e"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>
  ${[0, 1, 2, 3, 4, 5]
      .map((i) => {
          const x = 22 + i * 56;
          return `<g opacity="${i <= 4 ? 1 : 0.5}">
      <circle cx="${x}" cy="46" r="20" fill="var(--card)" stroke="var(--line)"/>
      <circle cx="${x}" cy="42" r="2.4" fill="#334155"/><circle cx="${x + 7}" cy="42" r="2.4" fill="#334155"/>
      <path d="M${x - 6},${i < 2 ? 53 : i < 4 ? 57 : 58} q6,${i < 2 ? 6 : i < 4 ? 2 : -5} 12,0" stroke="#334155" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>`;
      })
      .join("")}
  <rect x="24" y="96" width="272" height="14" rx="7" fill="url(#pg)"/>
  <g style="--dx:196px;animation:d-slide 3.2s cubic-bezier(.34,1.3,.64,1) both">
    <circle cx="30" cy="103" r="12" fill="#fff" stroke="var(--ink)" stroke-width="3"/>
  </g>
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `<text x="${30 + i * 25.6}" y="128" font-size="8.5" fill="var(--ink3)" text-anchor="middle">${i}</text>`).join("")}
  <text x="30" y="148" font-size="8.5" fill="var(--ink3)">无痛</text>
  <text x="288" y="148" font-size="8.5" fill="var(--ink3)" text-anchor="end">剧痛</text>
  <rect x="24" y="156" width="128" height="15" rx="7" fill="var(--warn-bg)"/>
  <text x="88" y="167" font-size="8.5" fill="var(--warn)" text-anchor="middle" font-weight="700">≥4 分通知医生</text>
  <rect x="160" y="156" width="136" height="15" rx="7" fill="var(--no-bg)"/>
  <text x="228" y="167" font-size="8.5" fill="var(--no)" text-anchor="middle" font-weight="700">≥7 分按急诊处理</text>
</svg>`;

/* ---- 10 七步洗手法 ---- */
D.hands = () => {
    const steps = ["内", "外", "夹", "弓", "大", "立", "腕"];
    const desc = [
        "掌心相对搓",
        "手心对手背",
        "十指交叉搓",
        "弯曲指关节",
        "旋转搓拇指",
        "指尖搓掌心",
        "搓手腕",
    ];
    return `<svg viewBox="0 0 320 176" class="dm">
  <g transform="translate(160,74)">
    <g>
      <rect x="-46" y="-14" width="40" height="52" rx="14" fill="var(--card2)" stroke="var(--brand)" stroke-width="1.6" opacity=".9"/>
      <rect x="6" y="-14" width="40" height="52" rx="14" fill="var(--card2)" stroke="var(--brand)" stroke-width="1.6" opacity=".9"/>
      ${[-8, 0, 8].map((d) => `<line x1="-40" y1="${d + 4}" x2="-14" y2="${d + 4}" stroke="var(--brand)" stroke-width="1.4" opacity=".5"/>`).join("")}
      ${[-8, 0, 8].map((d) => `<line x1="12" y1="${d + 4}" x2="38" y2="${d + 4}" stroke="var(--brand)" stroke-width="1.4" opacity=".5"/>`).join("")}
    </g>
    <circle r="52" fill="none" stroke="var(--brand)" stroke-width="1.2" stroke-dasharray="6 8" opacity=".5" style="transform-box:fill-box;transform-origin:center;animation:spin 9s linear infinite"/>
  </g>
  ${steps
      .map((s, i) => {
          const x = 20 + i * 41;
          return `<g class="hl" style="animation-delay:${i * 0.857}s">
      <circle cx="${x + 13}" cy="140" r="14" fill="var(--brand)"/>
      <text x="${x + 13}" y="144.5" font-size="11" fill="#fff" text-anchor="middle" font-weight="700">${s}</text>
      <text x="${x + 13}" y="167" font-size="7" fill="var(--ink3)" text-anchor="middle">${desc[i]}</text>
    </g>`;
      })
      .join("")}
  <text x="160" y="20" font-size="9.5" fill="var(--ink2)" text-anchor="middle">每步 ≥15 秒 · 来回 ≥5 次 · 全程 40–60 秒</text>
</svg>`;
};

/* ---- 11 手卫生五时刻 ---- */
D.moments = () => {
    const pts: [number, number, string][] = [
        [160, 40, "接触患者前"],
        [250, 78, "无菌操作前"],
        [216, 140, "接触体液后"],
        [104, 140, "接触患者后"],
        [70, 78, "接触周围物品后"],
    ];
    return `<svg viewBox="0 0 320 176" class="dm">
  <rect x="120" y="86" width="80" height="34" rx="6" fill="var(--card2)" stroke="var(--line)"/>
  <rect x="120" y="72" width="80" height="14" rx="7" fill="var(--brand)" opacity=".25"/>
  <circle cx="150" cy="64" r="9" fill="var(--card2)" stroke="var(--line)"/>
  <rect x="176" y="92" width="50" height="20" rx="10" fill="var(--brand)" opacity=".18"/>
  ${pts
      .map(
          (p, i) => `<g class="blink" style="animation-delay:${i * 0.44}s">
    <circle cx="${p[0]}" cy="${p[1]}" r="13" fill="var(--m4)" opacity=".2"/>
    <circle cx="${p[0]}" cy="${p[1]}" r="10" fill="var(--m4)"/>
    <text x="${p[0]}" y="${p[1] + 3.6}" font-size="9.5" fill="#fff" text-anchor="middle" font-weight="700">${i + 1}</text>
    <text x="${p[0]}" y="${p[1] + (p[1] < 90 ? -17 : 25)}" font-size="7.8" fill="var(--ink2)" text-anchor="middle">${p[2]}</text>
  </g>`,
      )
      .join("")}
  <text x="160" y="172" font-size="8.5" fill="var(--ink3)" text-anchor="middle">两前三后 · 接触患者黏膜/破损皮肤前也算「无菌操作前」</text>
</svg>`;
};

/* ---- 12 输血 ---- */
D.blood = () => `
<svg viewBox="0 0 320 176" class="dm">
  <rect x="24" y="14" width="52" height="66" rx="9" fill="#fecaca" stroke="#dc2626" stroke-width="1.6"/>
  <rect x="24" y="46" width="52" height="34" rx="8" fill="#dc2626"/>
  <text x="50" y="34" font-size="8" fill="#7f1d1d" text-anchor="middle" font-weight="700">O Rh+</text>
  <path d="M44 80v20a6 6 0 0 0 12 0V80" fill="none" stroke="var(--line)" stroke-width="2"/>
  <ellipse cx="50" cy="92" rx="5" ry="7" fill="#dc2626">
    <animate attributeName="ry" values="7;3;7" dur="1.4s" repeatCount="indefinite"/>
  </ellipse>
  ${[0, 1, 2].map((i) => `<circle cx="50" cy="100" r="2.6" fill="#dc2626" style="animation:d-drip 1.6s linear infinite;animation-delay:${i * 0.53}s"/>`).join("")}
  <path d="M50 108 Q50 140 110 140 L150 140" fill="none" stroke="var(--line)" stroke-width="2.5"/>
  <rect x="150" y="128" width="26" height="24" rx="12" fill="var(--card2)" stroke="var(--line)"/>
  <g>
    <rect x="196" y="26" width="110" height="26" rx="9" fill="var(--ok-bg)"/><text x="251" y="43" font-size="9" fill="var(--ok)" text-anchor="middle" font-weight="700">三查 ✓</text>
    <rect x="196" y="58" width="110" height="26" rx="9" fill="var(--ok-bg)"/><text x="251" y="75" font-size="9" fill="var(--ok)" text-anchor="middle" font-weight="700">九对 ✓</text>
    <rect x="196" y="90" width="110" height="26" rx="9" fill="var(--warn-bg)"/><text x="251" y="107" font-size="8.6" fill="var(--warn)" text-anchor="middle" font-weight="700">30 分钟内输注</text>
    <rect x="196" y="122" width="110" height="26" rx="9" fill="var(--no-bg)"/><text x="251" y="139" font-size="8.6" fill="var(--no)" text-anchor="middle" font-weight="700">4 小时内输完</text>
  </g>
  <text x="50" y="168" font-size="8" fill="var(--ink3)" text-anchor="middle">血袋 24h</text>
  <text x="251" y="168" font-size="8" fill="var(--ink3)" text-anchor="middle">前后生理盐水冲管</text>
</svg>`;

/* ---- 13 火灾 RACB ---- */
D.fire = () => {
    const q: [string, string, string, number][] = [
        ["R", "救援", "Rescue", 0],
        ["A", "报警", "Alarm", 1],
        ["C", "限制", "Confine", 2],
        ["B", "灭火/疏散", "Evacuate", 3],
    ];
    return `<svg viewBox="0 0 320 176" class="dm">
  ${q
      .map((it) => {
          const x = 14 + (it[3] % 2) * 148,
              y = 12 + Math.floor(it[3] / 2) * 78;
          return `<g class="fade" style="animation-delay:${it[3] * 0.35}s">
      <rect x="${x}" y="${y}" width="140" height="70" rx="14" fill="var(--card)" stroke="var(--line)"/>
      <text x="${x + 14}" y="${y + 30}" font-size="20" font-weight="800" fill="var(--m1)">${it[0]}</text>
      <text x="${x + 40}" y="${y + 28}" font-size="11" fill="var(--ink)" font-weight="700">${it[1]}</text>
      <text x="${x + 40}" y="${y + 43}" font-size="8" fill="var(--ink3)">${it[2]}</text>
      <text x="${x + 14}" y="${y + 60}" font-size="7.8" fill="var(--ink2)">${["先救人", "119 讲清楼层火势", "关门断电断氧", "高层/病重先撤"][it[3]]}</text>
    </g>`;
      })
      .join("")}
  <g class="flame" transform="translate(160,88)">
    <path d="M0,-26 C10,-10 18,0 12,12 C8,22 -8,22 -12,12 C-18,0 -10,-10 0,-26Z" fill="#f97316" opacity=".9"/>
    <path d="M0,-10 C5,0 8,6 5,12 C2,18 -2,18 -5,12 C-8,6 -5,0 0,-10Z" fill="#fde047"/>
  </g>
</svg>`;
};

/* ---- 14 心电监护五色导联 ---- */
D.ecg = () => {
    const leads: [number, number, string, string, string][] = [
        [120, 58, "#ffffff", "#94a3b8", "白 右臂"],
        [200, 58, "#111827", "#94a3b8", "黑 左臂"],
        [134, 124, "#22c55e", "#22c55e", "绿 右腿"],
        [186, 124, "#ef4444", "#ef4444", "红 左腿"],
        [160, 88, "#92400e", "#92400e", "棕 胸导"],
    ];
    return `<svg viewBox="0 0 320 176" class="dm">
  <circle cx="160" cy="26" r="14" fill="var(--card2)" stroke="var(--line)"/>
  <path d="M132 44 Q160 34 188 44 L196 130 Q160 146 124 130 Z" fill="var(--card2)" stroke="var(--line)"/>
  <path d="M160 44v100" stroke="var(--line)" stroke-dasharray="2 3"/>
  ${leads
      .map(
          (l, i) => `<g class="blink" style="animation-delay:${i * 0.3}s">
    <circle cx="${l[0]}" cy="${l[1]}" r="9" fill="${l[2]}" stroke="${l[3]}" stroke-width="1.6"/>
    <circle cx="${l[0]}" cy="${l[1]}" r="14" fill="none" stroke="${l[3]}" stroke-width="1" opacity=".4" class="ring" style="animation-delay:${i * 0.3}s"/>
  </g>`,
      )
      .join("")}
  ${leads.map((l) => `<text x="${l[0]}" y="${l[1] + (l[1] < 70 ? -15 : 22)}" font-size="7.5" fill="var(--ink2)" text-anchor="middle">${l[4]}</text>`).join("")}
  <rect x="12" y="146" width="296" height="26" rx="8" fill="#0b1220" opacity=".92"/>
  <polyline class="ecg" points="16,159 46,159 52,152 58,166 64,159 96,159 104,148 112,170 120,159 152,159 158,152 164,166 170,159 202,159 210,148 218,170 226,159 258,159 264,152 270,166 276,159 306,159" fill="none" stroke="#4ade80" stroke-width="1.8" stroke-linejoin="round"/>
</svg>`;
};

/* ---- 15 除颤电极 ---- */
D.defib = () => `
<svg viewBox="0 0 320 176" class="dm">
  <path d="M96 40 Q160 22 224 40 L236 148 Q160 166 84 148 Z" fill="var(--card2)" stroke="var(--line)"/>
  <path d="M160 40v108" stroke="var(--line)" stroke-dasharray="2 3"/>
  <g opacity="1" style="animation:d-fade 6s infinite">
    <rect x="86" y="44" width="30" height="40" rx="9" fill="var(--m5)" opacity=".85"/>
    <rect x="196" y="92" width="30" height="40" rx="9" fill="var(--m5)" opacity=".85"/>
    <text x="101" y="36" font-size="7.5" fill="var(--ink2)" text-anchor="middle">胸骨右缘第2肋间</text>
    <text x="211" y="146" font-size="7.5" fill="var(--ink2)" text-anchor="middle">左腋前线第5肋间</text>
  </g>
  <g class="flame" transform="translate(160,92)">
    <path d="M-6,-16 L6,-16 L0,-4 L8,-4 L-7,16 L-1,2 L-9,2 Z" fill="#facc15"/>
  </g>
  <text x="160" y="24" font-size="9" fill="var(--ink2)" text-anchor="middle">左右位（前侧位）</text>
  <text x="160" y="170" font-size="8.5" fill="var(--ink3)" text-anchor="middle">双相波 120–200J（按厂家推荐）· 单相波 360J</text>
</svg>`;

/* ---- 16 三凹征 ---- */
D.breath = () => `
<svg viewBox="0 0 320 176" class="dm">
  <path d="M150 26 q14 0 14 16 v10 h14 q22 4 26 30 l6 56 q-30 12 -60 12 t-60 -12 l6 -56 q4 -26 26 -30 h14 v-10 q0 -16 14 -16z" fill="var(--card2)" stroke="var(--line)"/>
  <g class="indent" style="animation-delay:0s"><circle cx="150" cy="62" r="9" fill="none" stroke="#ef4444" stroke-width="2"/></g>
  <g class="indent" style="animation-delay:.2s"><circle cx="124" cy="76" r="8" fill="none" stroke="#ef4444" stroke-width="2"/></g>
  <g class="indent" style="animation-delay:.4s"><circle cx="112" cy="98" r="8" fill="none" stroke="#ef4444" stroke-width="2"/></g>
  <text x="252" y="60" font-size="8.5" fill="var(--ink2)">胸骨上窝</text>
  <text x="252" y="82" font-size="8.5" fill="var(--ink2)">锁骨上窝</text>
  <text x="252" y="104" font-size="8.5" fill="var(--ink2)">肋间隙</text>
  <text x="252" y="126" font-size="8.5" fill="#ef4444" font-weight="700">吸气时凹陷</text>
  <text x="160" y="170" font-size="8.5" fill="var(--ink3)" text-anchor="middle">提示上气道部分梗阻 → 吸气性呼吸困难</text>
</svg>`;

/* ---- 17 冰箱温控 ---- */
D.fridge = () => `
<svg viewBox="0 0 320 176" class="dm">
  <rect x="18" y="14" width="86" height="146" rx="12" fill="var(--card)" stroke="var(--line)" stroke-width="1.6"/>
  <line x1="18" y1="76" x2="104" y2="76" stroke="var(--line)"/>
  <rect x="90" y="40" width="4" height="24" rx="2" fill="var(--ink3)"/>
  <rect x="90" y="92" width="4" height="24" rx="2" fill="var(--ink3)"/>
  <text x="61" y="120" font-size="15" font-weight="800" fill="var(--brand)" text-anchor="middle">2–8</text>
  <text x="61" y="134" font-size="8" fill="var(--ink3)" text-anchor="middle">℃</text>
  <rect x="122" y="26" width="186" height="122" rx="10" fill="var(--bg2)"/>
  <rect x="122" y="46" width="186" height="82" fill="color-mix(in srgb, var(--brand) 12%, transparent)"/>
  <line x1="122" y1="46" x2="308" y2="46" stroke="var(--brand)" stroke-dasharray="4 3"/>
  <line x1="122" y1="128" x2="308" y2="128" stroke="var(--brand)" stroke-dasharray="4 3"/>
  <text x="126" y="42" font-size="7.5" fill="var(--brand)">8℃</text>
  <text x="126" y="140" font-size="7.5" fill="var(--brand)">2℃</text>
  <polyline class="draw" points="122,96 148,92 168,88 188,150 208,140 232,104 262,90 308,86" fill="none" stroke="var(--no)" stroke-width="2.2" stroke-linejoin="round"/>
  <circle cx="188" cy="150" r="3.5" fill="var(--no)" class="blink"/>
  <text x="188" y="166" font-size="7.5" fill="var(--no)" text-anchor="middle">异常→30min 观察</text>
  <text x="308" y="166" font-size="7.5" fill="var(--ink3)" text-anchor="end">每月除霜 ≥1 次</text>
</svg>`;

/* ---- 18 ADL 十项 ---- */
D.adl = () => {
    const items = [
        "大便",
        "小便",
        "修饰",
        "用厕",
        "进食",
        "床椅",
        "步行",
        "穿衣",
        "上楼",
        "洗澡",
    ];
    return `<svg viewBox="0 0 320 176" class="dm">
  ${items
      .map((s, i) => {
          const x = 16 + (i % 5) * 59,
              y = 18 + Math.floor(i / 5) * 62;
          return `<g class="pop" style="animation-delay:${i * 0.08}s">
      <rect x="${x}" y="${y}" width="52" height="50" rx="11" fill="var(--card)" stroke="var(--line)"/>
      <circle cx="${x + 26}" cy="${y + 20}" r="11" fill="var(--brand)" opacity=".14"/>
      <text x="${x + 26}" y="${y + 24}" font-size="10" fill="var(--brand)" text-anchor="middle" font-weight="700">${i + 1}</text>
      <text x="${x + 26}" y="${y + 43}" font-size="8.5" fill="var(--ink2)" text-anchor="middle">${s}</text>
    </g>`;
      })
      .join("")}
  <rect x="16" y="142" width="288" height="26" rx="9" fill="var(--bg2)"/>
  <text x="160" y="159" font-size="8.5" fill="var(--ink2)" text-anchor="middle">总分 100：≤40 重度 · 41–60 中度 · 61–99 轻度 · 100 自理</text>
</svg>`;
};

/* ---- 19 五专 ---- */
D.locks = () => {
    const items = ["专人", "专柜", "专锁", "专册", "专用处方"];
    return `<svg viewBox="0 0 320 176" class="dm">
  ${items
      .map((s, i) => {
          const x = 22 + i * 58;
          return `<g class="fade" style="animation-delay:${i * 0.22}s">
      <rect x="${x}" y="52" width="42" height="34" rx="7" fill="var(--m3)" opacity=".9"/>
      <path d="M${x + 13},52 v-9 a8,8 0 0 1 16,0 v9" fill="none" stroke="var(--m3)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${x + 21}" cy="66" r="4" fill="#fff"/>
      <rect x="${x + 19.5}" y="66" width="3" height="9" fill="#fff"/>
      <text x="${x + 21}" y="104" font-size="8.5" fill="var(--ink)" text-anchor="middle" font-weight="700">${s}</text>
    </g>`;
      })
      .join("")}
  <text x="160" y="30" font-size="11" font-weight="800" fill="var(--m3)" text-anchor="middle">麻醉药品 · 第一类精神药品</text>
  <text x="160" y="128" font-size="8.5" fill="var(--ink2)" text-anchor="middle">保险箱双人双锁 · 每班清点 · 双签名</text>
  <text x="160" y="146" font-size="8.5" fill="var(--ink2)" text-anchor="middle">空安瓿交回 · 残余液双人处置记录</text>
  <text x="160" y="164" font-size="8.5" fill="var(--ink3)" text-anchor="middle">钥匙与密码分开保管</text>
</svg>`;
};

/* ---- 20 抢救车四固定 ---- */
D.cart = () => {
    const items = ["定人保管", "定点放置", "定数量品种", "定期维修消毒"];
    return `<svg viewBox="0 0 320 176" class="dm">
  <rect x="112" y="34" width="96" height="86" rx="8" fill="var(--card)" stroke="var(--m5)" stroke-width="2"/>
  <line x1="112" y1="62" x2="208" y2="62" stroke="var(--m5)" stroke-width="1.6" opacity=".6"/>
  <line x1="112" y1="92" x2="208" y2="92" stroke="var(--m5)" stroke-width="1.6" opacity=".6"/>
  <circle cx="106" cy="130" r="7" fill="var(--m5)"/><circle cx="214" cy="130" r="7" fill="var(--m5)"/>
  <rect x="126" y="44" width="26" height="12" rx="2" fill="var(--no)" opacity=".7"/>
  <rect x="126" y="70" width="18" height="16" rx="2" fill="var(--brand)" opacity=".5"/>
  <rect x="150" y="70" width="18" height="16" rx="2" fill="var(--brand)" opacity=".5"/>
  <text x="160" y="24" font-size="9.5" fill="var(--m5)" text-anchor="middle" font-weight="700">抢救车「四固定」</text>
  ${items
      .map((s, i) => {
          const pos = (
              [
                  [12, 40, "start"],
                  [212, 40, "start"],
                  [12, 108, "start"],
                  [212, 108, "start"],
              ] as [number, number, string][]
          )[i];
          return `<g class="pop" style="animation-delay:${i * 0.25}s">
      <circle cx="${pos[0] + 6}" cy="${pos[1] - 3}" r="3.5" fill="var(--m5)"/>
      <text x="${pos[0] + 14}" y="${pos[1]}" font-size="9" fill="var(--ink)" font-weight="700">${s}</text>
    </g>`;
      })
      .join("")}
  <text x="160" y="166" font-size="8.5" fill="var(--ink3)" text-anchor="middle">用后及时补充 · 班班交接 · 封条管理</text>
</svg>`;
};

/* ---- 21 心肺复苏 ---- */
D.cpr = () => `
<svg viewBox="0 0 320 176" class="dm">
  <rect x="96" y="60" width="128" height="52" rx="14" fill="var(--card2)" stroke="var(--line)"/>
  <g class="cmp">
    <rect x="136" y="34" width="48" height="26" rx="7" fill="var(--brand)" opacity=".9"/>
    <circle cx="150" cy="30" r="7" fill="var(--brand)"/>
    <circle cx="170" cy="30" r="7" fill="var(--brand)"/>
  </g>
  <path d="M112 128 h96" stroke="var(--line)" stroke-width="3" stroke-linecap="round"/>
  <text x="160" y="150" font-size="9.5" fill="var(--ink2)" text-anchor="middle">按压深度 5–6cm · 频率 100–120 次/分</text>
  <text x="160" y="166" font-size="9.5" fill="var(--no)" text-anchor="middle" font-weight="700">按压:通气 = 30:2 · 尽早除颤</text>
  <text x="160" y="22" font-size="10" fill="var(--m6)" text-anchor="middle" font-weight="700">胸外按压</text>
</svg>`;

export const DEMOS: Record<string, DemoFn> = {
    wristband: () => D.wristband(),
    surgery3: () => D.surgery3(),
    gauge: () => D.gauge("血钾 K⁺", "6.8", "mmol/L", 0.93),
    flow: (a) =>
        D.flow(Array.isArray(a) && a.length ? a : ["步骤一", "步骤二"]),
    fall: () => D.fall(),
    braden: () => D.braden(),
    skin: (s) => D.skin(s),
    clock2h: () => D.clock2h(),
    pain: () => D.pain(),
    hands: () => D.hands(),
    moments: () => D.moments(),
    blood: () => D.blood(),
    fire: () => D.fire(),
    ecg: () => D.ecg(),
    defib: () => D.defib(),
    breath: () => D.breath(),
    fridge: () => D.fridge(),
    adl: () => D.adl(),
    locks: () => D.locks(),
    cart: () => D.cart(),
    cpr: () => D.cpr(),
};
