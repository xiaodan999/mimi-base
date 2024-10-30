import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, createFileRoute, redirect } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

import LoadingPage from "@/components/LoadingPage";
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
import { useAuth } from "@/lib/auth";

const FALLBACK = "/home";

export const Route = createFileRoute("/login")({
    validateSearch: z.object({
        redirect: z.string().optional().catch(""),
    }),
    beforeLoad: ({ context, search }) => {
        // console.log("run beforeLoad in /login", context.auth);
        if (context.auth.loading === null) return;
        if (context.auth.isAuthenticated) {
            throw redirect({ to: search.redirect || FALLBACK });
        }
    },
    component: function Component() {
        const router = useRouter();
        const { loading, isAuthenticated } = useAuth();
        useEffect(() => {
            if (!loading) router.invalidate();
        }, [loading, router]);

        const showLoading = isAuthenticated || loading;
        return showLoading ? <LoadingPage /> : <Login />;
    },
});

const formSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export function Login() {
    const router = useRouter();

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
            await router.invalidate();
        }
    }

    return (
        <div className="flex h-dvh w-dvw items-center justify-center">
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="min-w-96 space-y-8"
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
                            <Button className="w-full" type="submit">
                                登录
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
