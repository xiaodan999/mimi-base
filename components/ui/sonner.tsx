"use client";

import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/lib/theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
	const { resolvedTheme } = useTheme();

	return (
		<Sonner
			theme={resolvedTheme}
			position="top-center"
			offset="calc(1rem + env(safe-area-inset-top))"
			className="toaster group"
			toastOptions={{
				classNames: {
					toast:
						"group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
					description: "group-[.toast]:text-muted-foreground",
					actionButton:
						"group-[.toast]:bg-primary group-[.toast]:text-primary-foreground active:opacity-80",
					cancelButton:
						"group-[.toast]:bg-muted group-[.toast]:text-muted-foreground active:opacity-80",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
