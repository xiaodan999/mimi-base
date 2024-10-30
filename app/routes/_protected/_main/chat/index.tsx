import { createFileRoute } from "@tanstack/react-router";

import XiaohaiTab from "@/components/XiaohaiTab";

export const Route = createFileRoute("/_protected/_main/chat/")({
    component: () => <XiaohaiTab />,
});
