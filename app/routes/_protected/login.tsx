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
import { Label } from "@/components/ui/label";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import { useForm } from "react-hook-form";

const FALLBACK = "/home";
export const Route = createFileRoute("/_protected/login")({
	validateSearch: z.object({
		redirect: z.string().optional().catch(""),
	}),
	beforeLoad: ({ context, search }) => {
		console.log(context);
		if (context.auth.isAuthenticated) {
			throw redirect({ to: search.redirect || FALLBACK });
		}
	},
	component: Login,
});

import { z } from "zod";

const formSchema = z.object({
	email: z.string().email(),
	password: z.string(),
});

export const loginFn = createServerFn(
	"POST",
	async (
		payload: {
			email: string;
			password: string;
		},
		{ request },
	) => {
		const supabase = getSupabaseServerClient();
		const { data, error } = await supabase.auth.signInWithPassword({
			email: payload.email,
			password: payload.password,
		});
		if (error) {
			return {
				error: true,
				message: error.message,
			};
		}
		return { error: false, message: "Successfully logged in", data };
	},
);

export function Login() {
	const router = useRouter();
	// 1. Define your form.
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	// 2. Define a submit handler.
	async function onSubmit(values: z.infer<typeof formSchema>) {
		// Do something with the form values.
		// ✅ This will be type-safe and validated.
		const { error } = await loginFn(values);
		if (!error) {
			await router.invalidate();
		}
	}
	return (
		<div className="w-dvw h-dvh flex justify-center items-center">
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="space-y-8 min-w-96"
				>
					<Card className="w-full max-w-sm">
						<CardHeader>
							<CardTitle className="text-2xl">进入秘密基地</CardTitle>
							<CardDescription>输入你的邮箱和密码</CardDescription>
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
												<Input placeholder="123@qq.com" {...field} />
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
												<Input type="password" {...field} />
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