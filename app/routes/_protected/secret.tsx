import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/secret")({
    component: Secret,
});

function Secret() {
    return (
        <main className="mx-auto max-w-md p-6 text-center">
            <h1 className="text-xl font-semibold">小秘密</h1>
            <p className="mt-3 text-sm text-muted-foreground">
                这里还没有内容，先去首页看看吧。
            </p>
        </main>
    );
}
