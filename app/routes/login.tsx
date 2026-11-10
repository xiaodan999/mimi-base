import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { ensureDevSession, useAuth } from "@/lib/auth";
import { DEV_ACCOUNTS, type DevAccount } from "@/lib/dev-accounts";
import { toInternalHref } from "@/lib/redirect";

const FALLBACK = "/home";

/** In-app target for the current `?redirect=` value. */
function loginTarget(redirectTo: string) {
    return toInternalHref(redirectTo, window.location.origin) ?? FALLBACK;
}

export const Route = createFileRoute("/login")({
    // Keep this route definition free of zod so the login chunk is not part
    // of the initial bundle (the route tree imports this module at startup).
    validateSearch: (search: Record<string, unknown>) => {
        const redirect =
            typeof search.redirect === "string" ? search.redirect : "";
        return typeof search.dev === "string" && search.dev
            ? { redirect, dev: search.dev }
            : { redirect };
    },
    beforeLoad: async ({ context, search }) => {
        // A dev key signs in before the form renders, so a magic URL lands on
        // the target page directly. The production account list is empty, so
        // this branch is a no-op outside the dev server.
        if (search.dev) {
            const result = await ensureDevSession(context.auth, search.dev);
            if (result.ok) {
                throw redirect({
                    href: loginTarget(search.redirect),
                    replace: true,
                });
            }
        }

        // Wait for the session restore so a signed-in user never sees the
        // login form flash before the redirect.
        const { status } = await context.auth.waitForAuth();
        if (status === "authenticated") {
            throw redirect({ href: loginTarget(search.redirect) });
        }
    },
    component: Login,
});

function Login() {
    const navigate = useNavigate();
    const search = Route.useSearch();
    const { login } = useAuth();
    const [devPending, setDevPending] = useState<string | null>(null);

    const formSchema = z.object({
        email: z.email(),
        password: z.string().min(1, "请输入密码"),
    });

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    const busy = form.formState.isSubmitting || devPending !== null;

    async function onSubmit(values: z.infer<typeof formSchema>) {
        const { error } = await login(values);
        if (!error) {
            // `login` waits for the profile fetch, so the guard on the target
            // route already sees the authenticated state.
            await navigate({ href: loginTarget(search.redirect) });
            return;
        }
        form.setError("password", {
            message: error.message,
            type: "value",
        });
    }

    async function onDevLogin(account: DevAccount) {
        setDevPending(account.key);
        try {
            const { error } = await login({
                email: account.email,
                password: account.password,
            });
            if (error) {
                toast.error(error.message);
                return;
            }
            await navigate({
                href: loginTarget(search.redirect),
                replace: true,
            });
        } finally {
            setDevPending(null);
        }
    }

    return (
        <main className="flex h-full w-full overflow-y-auto">
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="m-auto w-full max-w-sm space-y-8 p-4"
                >
                    <Card className="w-full max-w-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl">
                                进入秘密基地
                            </CardTitle>
                            <CardDescription>
                                输入你的邮箱和密码
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-2">
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>邮箱</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="123@qq.com"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="grid gap-2">
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>密码</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <LoadingButton
                                className="w-full"
                                type="submit"
                                disabled={busy}
                                loading={form.formState.isSubmitting}
                            >
                                登录
                            </LoadingButton>
                        </CardFooter>
                    </Card>

                    {import.meta.env.DEV && DEV_ACCOUNTS.length > 0 ? (
                        <Card className="w-full max-w-sm border-dashed">
                            <CardHeader>
                                <CardTitle className="text-base">
                                    开发账号
                                </CardTitle>
                                <CardDescription>
                                    一键进入；也可以在任意页面地址后加{" "}
                                    <code className="font-mono">?dev=test</code>
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-2">
                                {DEV_ACCOUNTS.map((account) => (
                                    <div
                                        key={account.key}
                                        className="flex items-center justify-between gap-3 rounded-md border p-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">
                                                {account.name}
                                            </p>
                                            <p className="truncate font-mono text-xs text-muted-foreground">
                                                {account.email} /{" "}
                                                {account.password}
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            aria-label={`以${account.name}登录`}
                                            disabled={busy}
                                            onClick={() =>
                                                void onDevLogin(account)
                                            }
                                        >
                                            {devPending === account.key
                                                ? "登录中…"
                                                : "登录"}
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ) : null}
                </form>
            </Form>
        </main>
    );
}
