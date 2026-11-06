import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
    component: About,
});

function About() {
    return (
        <main className="mx-auto max-w-md p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] text-center">
            <h1 className="text-xl font-semibold">关于秘密基地</h1>
            <p className="mt-3 text-sm text-muted-foreground">
                一个用来记录照片、动态和日常开销的小天地。
            </p>
        </main>
    );
}
