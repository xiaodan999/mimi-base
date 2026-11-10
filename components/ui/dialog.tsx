"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { useBackDismiss } from "@/lib/useBackDismiss";
import { cn } from "@/lib/utils";

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

/**
 * Radix root plus back-gesture dismissal: on mobile the edge swipe is a
 * history navigation, so an open dialog swallows it and closes instead of
 * leaving the page underneath.
 */
const Dialog = ({
	open,
	defaultOpen = false,
	onOpenChange,
	...props
}: DialogProps) => {
	const [uncontrolledOpen, setUncontrolledOpen] =
		React.useState(defaultOpen);
	const isOpen = open ?? uncontrolledOpen;
	const handleOpenChange = React.useCallback(
		(next: boolean) => {
			if (open === undefined) setUncontrolledOpen(next);
			onOpenChange?.(next);
		},
		[open, onOpenChange],
	);

	useBackDismiss(isOpen, () => handleOpenChange(false));

	return (
		<DialogPrimitive.Root
			open={isOpen}
			onOpenChange={handleOpenChange}
			{...props}
		/>
	);
};

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			"fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className,
		)}
		{...props}
	/>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<
	typeof DialogPrimitive.Content
> & {
	/** For screens drawing their own backdrop, e.g. the image viewer. */
	overlayClassName?: string;
	/** Hide the built-in top-right close button (e.g. media-only previews). */
	showCloseButton?: boolean;
	/**
	 * Phones get a bottom sheet (edge-to-edge, rounded top, slide-up) and
	 * `sm` and up keep the regular centered dialog. The caller owns the inner
	 * padding/safe area for the sheet layout; this only slides the surface.
	 */
	mobileSheet?: boolean;
};

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	DialogContentProps
>(
	(
		{
			className,
			children,
			overlayClassName,
			showCloseButton = true,
			mobileSheet = false,
			...props
		},
		ref,
	) => (
		<DialogPortal>
			<DialogOverlay className={overlayClassName} />
			<DialogPrimitive.Content
				ref={ref}
				className={cn(
					"fixed z-50 grid w-full bg-background duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
					mobileSheet
						? "inset-x-0 bottom-0 max-w-none translate-x-0 translate-y-0 gap-0 rounded-t-[1.75rem] border-x-0 border-b-0 p-0 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] data-[state=open]:[animation-duration:300ms] data-[state=closed]:[animation-duration:200ms] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-w-sm sm:translate-x-[-50%] sm:translate-y-[-50%] sm:gap-4 sm:rounded-2xl sm:border sm:p-6 sm:shadow-lg sm:data-[state=open]:[animation-duration:200ms] sm:data-[state=closed]:[animation-duration:150ms] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95"
						: "left-[50%] top-[50%] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
						<X className="h-4 w-4" />
						<span className="sr-only">关闭</span>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col space-y-1.5 text-center sm:text-left",
			className,
		)}
		{...props}
	/>
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
			className,
		)}
		{...props}
	/>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			"text-lg font-semibold leading-none tracking-tight",
			className,
		)}
		{...props}
	/>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
	Dialog,
	DialogPortal,
	DialogOverlay,
	DialogClose,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
	DialogDescription,
};
