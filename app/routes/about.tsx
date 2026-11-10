import { createFileRoute, Link } from "@tanstack/react-router";
import {
    ArrowLeft,
    ArrowUpRight,
    Check,
    ChevronDown,
    Copy,
    type LucideIcon,
    RefreshCw,
    Sparkles,
    Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { markUpdateSeen } from "@/app/about/seen";
import { type Update, UPDATES } from "@/app/about/updates";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { applyUpdate, checkForUpdate } from "@/lib/service-worker";
import { cn } from "@/lib/utils";
import {
    type DeployedVersion,
    fetchDeployedVersion,
    formatBuildTime,
    sameBuild,
    shortSha,
} from "@/lib/version";

export const Route = createFileRoute("/about")({
    component: About,
});

type UpdateState = "idle" | "checking" | "latest" | "available";

function About() {
    const [deployed, setDeployed] = useState<DeployedVersion | null>(null);
    const [state, setState] = useState<UpdateState>("idle");
    const [checking, setChecking] = useState(false);

    const latestUpdate = UPDATES[0]?.date;
    const [openDates, setOpenDates] = useState<Set<string>>(() =>
        latestUpdate ? new Set([latestUpdate]) : new Set(),
    );

    useEffect(() => {
        if (latestUpdate) markUpdateSeen(latestUpdate);
    }, [latestUpdate]);

    useEffect(() => {
        let cancelled = false;
        void fetchDeployedVersion().then((info) => {
            if (cancelled || !info) return;
            setDeployed(info);
            setState(
                sameBuild(info, { sha: APP_SHA }) ? "latest" : "available",
            );
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // The dev server never emits /version.json and does not register the
    // worker, so there is nothing to compare against there.
    const dev = import.meta.env.DEV;
    const buildLabel = dev ? "开发版" : shortSha(APP_SHA);
    const buildTime = deployed?.builtAt
        ? formatBuildTime(deployed.builtAt)
        : null;
    const installed = window.matchMedia("(display-mode: standalone)").matches;
    const offlineReady = Boolean(navigator.serviceWorker?.controller);

    const copyBuild = async () => {
        try {
            await navigator.clipboard.writeText(`秘密基地 构建 ${APP_SHA}`);
            toast.success("构建信息已复制");
        } catch {
            toast.error("复制失败");
        }
    };

    const runCheck = async () => {
        setChecking(true);
        try {
            await checkForUpdate();
            const info = await fetchDeployedVersion();
            if (!info) {
                toast.error("暂时无法检查更新，请稍后再试");
                setState("idle");
                return;
            }
            setDeployed(info);
            setState(
                sameBuild(info, { sha: APP_SHA }) ? "latest" : "available",
            );
        } finally {
            setChecking(false);
        }
    };

    const reload = () => {
        // A waiting worker reloads on `controllerchange`; otherwise a plain
        // reload is enough because navigations are network-first.
        if (!applyUpdate()) window.location.reload();
    };

    const allOpen = openDates.size === UPDATES.length;

    const toggleEntry = (date: string) => {
        setOpenDates((current) => {
            const next = new Set(current);
            if (next.has(date)) next.delete(date);
            else next.add(date);
            return next;
        });
    };

    const toggleAll = () => {
        setOpenDates(
            allOpen ? new Set() : new Set(UPDATES.map((update) => update.date)),
        );
    };

    return (
        // `html, body` are overflow-hidden and `#app` is a fixed-height box,
        // so a public page outside the `_main` shell must scroll itself.
        <main
            className="h-full overflow-y-auto overscroll-contain"
            data-scroll-restoration-id="about"
        >
            <div className="mx-auto w-full max-w-md px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
                <header className="flex items-center gap-1">
                    <Button
                        asChild
                        className="-ml-2 text-muted-foreground"
                        size="icon"
                        variant="ghost"
                    >
                        <Link to="/home" aria-label="返回首页">
                            <ArrowLeft className="size-5" aria-hidden="true" />
                        </Link>
                    </Button>
                    <h1 className="text-xl font-semibold tracking-tight">
                        关于
                    </h1>
                </header>

                <section className="mt-4 rounded-3xl border border-border/60 bg-card p-6 shadow-soft">
                    <div className="flex items-center gap-4">
                        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                            <Sparkles className="size-7" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold">秘密基地</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                记录生活的小窝
                            </p>
                        </div>
                    </div>

                    <dl className="mt-5 space-y-2 text-xs">
                        <Row label="当前构建">
                            <span className="font-mono">{buildLabel}</span>
                            <Button
                                aria-label="复制构建信息"
                                className="size-7 text-muted-foreground"
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                    void copyBuild();
                                }}
                            >
                                <Copy className="size-3.5" aria-hidden="true" />
                            </Button>
                        </Row>
                        <Row label="构建时间">{buildTime ?? "—"}</Row>
                        <Row label="运行方式">
                            {installed ? "已安装" : "浏览器"}
                        </Row>
                        <Row label="离线缓存">
                            {offlineReady ? "已启用" : "未启用"}
                        </Row>
                    </dl>

                    <div className="mt-5 rounded-2xl border border-border/60 bg-background p-3">
                        {dev ? (
                            <p className="text-xs leading-5 text-muted-foreground">
                                开发模式下不检查更新。
                            </p>
                        ) : state === "available" ? (
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs leading-5">
                                    有新版本可用，刷新后即可使用。
                                </p>
                                <Button size="sm" onClick={reload}>
                                    <RefreshCw
                                        className="mr-1 size-3.5"
                                        aria-hidden="true"
                                    />
                                    刷新
                                </Button>
                            </div>
                        ) : state === "latest" ? (
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Check
                                    className="size-3.5 text-primary"
                                    aria-hidden="true"
                                />
                                已是最新版本
                            </p>
                        ) : (
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs leading-5 text-muted-foreground">
                                    {checking
                                        ? "正在检查更新..."
                                        : "检查有没有新版本"}
                                </p>
                                <Button
                                    disabled={checking}
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        void runCheck();
                                    }}
                                >
                                    {checking ? (
                                        <LoadingSpinner
                                            className="mr-1"
                                            size={14}
                                        />
                                    ) : (
                                        <RefreshCw
                                            className="mr-1 size-3.5"
                                            aria-hidden="true"
                                        />
                                    )}
                                    检查更新
                                </Button>
                            </div>
                        )}
                    </div>
                </section>

                <section className="mt-4 rounded-3xl border border-border/60 bg-card p-5">
                    <h2 className="text-sm font-semibold">更新记录</h2>
                    <div className="mt-1 flex items-start justify-between gap-3">
                        <p className="text-xs leading-5 text-muted-foreground">
                            每次构建带来的变化都记在这里，最新的在最上面。
                        </p>
                        <Button
                            className="h-7 shrink-0 px-2 text-[11px]"
                            size="sm"
                            variant="ghost"
                            onClick={toggleAll}
                        >
                            {allOpen ? "收起全部" : "展开全部"}
                        </Button>
                    </div>
                    <div className="mt-4 space-y-5">
                        {groupByMonth(UPDATES).map((group) => (
                            <section
                                aria-labelledby={`updates-${group.key}`}
                                key={group.key}
                            >
                                <h3
                                    className="text-[11px] font-medium text-muted-foreground"
                                    id={`updates-${group.key}`}
                                >
                                    {group.label}
                                </h3>
                                <div className="relative mt-2">
                                    <span
                                        aria-hidden="true"
                                        className="absolute bottom-3 left-[5px] top-3 w-px bg-border"
                                    />
                                    <ol>
                                        {group.entries.map((update) => (
                                            <li
                                                className="relative pb-3 pl-6 last:pb-0"
                                                key={update.date}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className={cn(
                                                        "absolute left-0 top-4 size-[11px] rounded-full border-2 border-card",
                                                        update.date ===
                                                            latestUpdate
                                                            ? "bg-primary"
                                                            : "bg-muted-foreground/30",
                                                    )}
                                                />
                                                <UpdateEntry
                                                    latest={
                                                        update.date ===
                                                        latestUpdate
                                                    }
                                                    open={openDates.has(
                                                        update.date,
                                                    )}
                                                    update={update}
                                                    onToggle={() =>
                                                        toggleEntry(update.date)
                                                    }
                                                />
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            </section>
                        ))}
                    </div>
                </section>

                <section className="mt-4 rounded-3xl border border-border/60 bg-card p-5">
                    <h2 className="text-sm font-semibold">关于这个应用</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        秘密基地是一个只给亲近的人用的小空间：发照片、写动态、记账、学习，偶尔让
                        AI 帮点小忙。数据保存在自己的服务器上，AI 的 Key
                        只存在当前浏览器里。
                    </p>
                </section>
            </div>
        </main>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 items-center gap-1 text-right">
                {children}
            </dd>
        </div>
    );
}

function UpdateEntry({
    update,
    latest,
    open,
    onToggle,
}: {
    update: Update;
    latest: boolean;
    open: boolean;
    onToggle: () => void;
}) {
    const panelId = `update-panel-${update.date}`;
    const counts = [
        update.added?.length ? `新增 ${update.added.length}` : null,
        update.fixed?.length ? `修复 ${update.fixed.length}` : null,
        update.changed?.length ? `调整 ${update.changed.length}` : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <article
            className={cn(
                "overflow-hidden rounded-2xl border bg-background transition-colors",
                latest ? "border-primary/30" : "border-border/60",
                latest && open && "bg-primary/[0.03]",
            )}
        >
            <button
                aria-controls={panelId}
                aria-expanded={open}
                className="flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left"
                type="button"
                onClick={onToggle}
            >
                <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                            {update.title ?? update.date}
                        </span>
                        {latest && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary">
                                新
                            </span>
                        )}
                    </span>
                    {update.summary && (
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {update.summary}
                        </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{formatUpdateDay(update.date)}</span>
                        {counts && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span>{counts}</span>
                            </>
                        )}
                    </span>
                </span>
                <ChevronDown
                    aria-hidden="true"
                    className={cn(
                        "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-180",
                    )}
                />
            </button>

            <div
                aria-hidden={!open}
                className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
                id={panelId}
            >
                <div className="overflow-hidden">
                    <div className="px-3.5 pb-3.5">
                        {update.highlight && (
                            <div className="mt-1 rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
                                <p className="flex items-center gap-1 text-[10px] font-medium text-primary">
                                    <Sparkles
                                        aria-hidden="true"
                                        className="size-3"
                                    />
                                    这次的重点
                                </p>
                                <p className="mt-1 text-sm leading-6">
                                    {update.highlight}
                                </p>
                            </div>
                        )}
                        <UpdateGroup
                            icon={Sparkles}
                            items={withoutHighlight(
                                update.added,
                                update.highlight,
                            )}
                            title="新增"
                        />
                        <UpdateGroup
                            icon={Wrench}
                            items={withoutHighlight(
                                update.fixed,
                                update.highlight,
                            )}
                            title="修复"
                        />
                        <UpdateGroup
                            icon={RefreshCw}
                            items={withoutHighlight(
                                update.changed,
                                update.highlight,
                            )}
                            title="调整"
                        />
                        {update.links?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {update.links.map((link) => (
                                    <Button
                                        asChild
                                        className="h-8"
                                        key={`${link.to}-${link.label}`}
                                        size="sm"
                                        variant="outline"
                                    >
                                        <Link
                                            tabIndex={open ? undefined : -1}
                                            to={link.to}
                                        >
                                            {link.label}
                                            <ArrowUpRight
                                                aria-hidden="true"
                                                className="ml-1 size-3.5"
                                            />
                                        </Link>
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </article>
    );
}

function UpdateGroup({
    title,
    icon: Icon,
    items,
}: {
    title: string;
    icon: LucideIcon;
    items?: string[];
}) {
    if (!items?.length) return null;
    return (
        <div className="mt-3">
            <p className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Icon aria-hidden="true" className="size-3" />
                {title} · {items.length}
            </p>
            <ul className="mt-1.5 space-y-1">
                {items.map((item) => (
                    <li key={item} className="flex gap-2 text-xs leading-5">
                        <span
                            aria-hidden="true"
                            className="mt-[7px] size-1 shrink-0 rounded-full bg-primary/60"
                        />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function withoutHighlight(items?: string[], highlight?: string) {
    return items?.filter((item) => item !== highlight);
}

function formatUpdateDay(date: string): string {
    const [, month, day] = date.split("-");
    return `${Number(month)} 月 ${Number(day)} 日`;
}

function formatUpdateMonth(key: string): string {
    const [year, month] = key.split("-");
    return `${year} 年 ${Number(month)} 月`;
}

function groupByMonth(updates: Update[]) {
    const groups: { key: string; label: string; entries: Update[] }[] = [];
    for (const update of updates) {
        const key = update.date.slice(0, 7);
        const last = groups[groups.length - 1];
        if (last?.key === key) {
            last.entries.push(update);
        } else {
            groups.push({
                key,
                label: formatUpdateMonth(key),
                entries: [update],
            });
        }
    }
    return groups;
}
