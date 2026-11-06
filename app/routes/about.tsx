import { type ReactNode, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
    ArrowLeft,
    Check,
    ChevronDown,
    Copy,
    RefreshCw,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { markUpdateSeen } from "@/app/about/seen";
import { UPDATES } from "@/app/about/updates";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { applyUpdate, checkForUpdate } from "@/lib/service-worker";
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
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        每次构建带来的变化都记在这里，最新的在最上面；点开可以看更早的记录。
                    </p>
                    <div className="mt-4 space-y-2">
                        {UPDATES.map((update, index) => (
                            <details
                                key={update.date}
                                className="group rounded-2xl border border-border/60 bg-background px-3 py-2.5"
                                open={index === 0}
                            >
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                                    <span className="text-sm font-semibold">
                                        {update.title ?? update.date}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-2">
                                        {update.title && (
                                            <span className="text-[11px] text-muted-foreground">
                                                {update.date}
                                            </span>
                                        )}
                                        <ChevronDown
                                            aria-hidden="true"
                                            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                                        />
                                    </span>
                                </summary>
                                <div className="mt-1">
                                    <UpdateGroup
                                        title="新增"
                                        items={update.added}
                                    />
                                    <UpdateGroup
                                        title="修复"
                                        items={update.fixed}
                                    />
                                    <UpdateGroup
                                        title="调整"
                                        items={update.changed}
                                    />
                                </div>
                            </details>
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

function UpdateGroup({ title, items }: { title: string; items?: string[] }) {
    if (!items?.length) return null;
    return (
        <div className="mt-2">
            <p className="text-[11px] font-medium text-muted-foreground">
                {title}
            </p>
            <ul className="mt-1 space-y-1">
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
