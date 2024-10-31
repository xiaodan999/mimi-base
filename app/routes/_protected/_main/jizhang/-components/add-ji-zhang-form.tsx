import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
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
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

import { useAddJiZhang } from "../-data";

export default function AddJiZhangForm() {
    const [open, setOpen] = React.useState(false);
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const close = () => setOpen(false);
    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline">开始记账</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>开始记账</DialogTitle>
                        <DialogDescription>请如实交代</DialogDescription>
                    </DialogHeader>
                    <AddForm onSuccess={close} />
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>
                <Button variant="outline">开始记账</Button>
            </DrawerTrigger>
            <DrawerContent>
                <DrawerHeader className="text-left">
                    <DrawerTitle>开始记账</DrawerTitle>
                    <DrawerDescription>请如实交代</DrawerDescription>
                </DrawerHeader>
                <AddForm className="px-4" onSuccess={close} />
                <DrawerFooter className="pt-2">
                    <DrawerClose asChild>
                        <Button variant="outline">放弃</Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}

const formSchema = z.object({
    itemName: z.string().min(2).max(50),
    price: z
        .union([
            z.string().transform((x) => x.replace(/[^0-9.-]+/g, "")),
            z.number(),
        ])
        .pipe(z.coerce.number().min(0.0001).max(999999999)),
});

function AddForm({
    className,
    onSuccess,
}: {
    className?: string;
    onSuccess: () => void;
}) {
    const mutation = useAddJiZhang();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            itemName: "",
            price: 0,
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        await mutation.mutateAsync(values);
        onSuccess();
    }

    return (
        <Form {...form}>
            <form
                className={cn("grid items-start gap-4", className)}
                onSubmit={form.handleSubmit(onSubmit)}
            >
                <FormField
                    control={form.control}
                    name="itemName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>项目</FormLabel>
                            <FormControl>
                                <Input placeholder="你花了啥..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>价格</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    value={field.value.toString()}
                                    onChange={(e) => {
                                        field.onChange(
                                            parseFloat(e.target.value),
                                        );
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <LoadingButton type="submit" loading={form.formState.isLoading}>
                    记录
                </LoadingButton>
            </form>
        </Form>
    );
}
