/**
 * What changed in each build, newest first. This is the in-app update log —
 * no version bump involved; entries are identified by the day they shipped.
 *
 * Entries are compiled into the bundle, so whatever is listed here is exactly
 * what the running build includes. Keep the bullets user-facing (Chinese,
 * no file paths); `date` is also the "seen" marker on the profile page.
 * Pair every entry with a `CHANGELOG.md` bullet (see AGENTS.md → Update log).
 */
export type Update = {
    /** `YYYY-MM-DD`; also identifies the entry for the unseen dot. */
    date: string;
    /** Optional short headline, e.g. 关于页上线. */
    title?: string;
    added?: string[];
    fixed?: string[];
    changed?: string[];
};

export const UPDATES: Update[] = [
    {
        date: "2026-11-06",
        title: "关于页上线",
        added: [
            "新增「关于」页：查看当前构建、检查更新，并浏览历次变化。",
            "首页底部和个人资料页都可以进入「关于」。",
        ],
        fixed: [
            "检查更新时不再读到被缓存住的旧构建信息。",
            "修复「关于」页在电脑上无法滚动到底部的问题。",
        ],
        changed: [
            "更新记录可以折叠，默认展开最新一条，更早的收起来。",
            "个人资料页去掉了左上角的返回箭头，从底部导航进入时不再像还能返回上一页。",
        ],
    },
];
