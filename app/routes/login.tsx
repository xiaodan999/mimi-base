import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { useAuth } from "@/lib/auth";

const FALLBACK = "/home";

export const Route = createFileRoute("/login")({
    // Keep this route definition free of zod so the login chunk is not part
    // of the initial bundle (the route tree imports this module at startup).
    validateSearch: (search: Record<string, unknown>) => ({
        redirect: typeof search.redirect === "string" ? search.redirect : "",
    }),
    beforeLoad: async ({ context, search }) => {
        // Wait for the session restore so a signed-in user never sees the
        // login form flash before the redirect.
        const { status } = await context.auth.waitForAuth();
        if (status === "authenticated") {
            throw redirect({ to: search.redirect || FALLBACK });
        }
    },
    component: Login,
});

function Login() {
    const navigate = useNavigate();
    const search = Route.useSearch();

    const formSchema = z.object({
        email: z.email(),
        password: z.string().min(1, "请输入密码"),
    });

    const { login } = useAuth();
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        const { error } = await login(values);
        if (!error) {
            // `login` waits for the profile fetch, so the guard on the target
            // route already sees the authenticated state.
            await navigate({ to: search.redirect || FALLBACK });
            return;
        }
        form.setError("password", {
            message: error.message,
            type: "value",
        });
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
                                disabled={form.formState.isSubmitting}
                                loading={form.formState.isSubmitting}
                            >
                                登录
                            </LoadingButton>
                        </CardFooter>
                    </Card>
                </form>
            </Form>
        </main>
    );
}
