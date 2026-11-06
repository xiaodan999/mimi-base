import { createFileRoute } from "@tanstack/react-router";

import StudyHub from "@/app/study/components/StudyHub";

// 完整的 study.css 由 StudyHub.tsx（本路由的 lazy 组件）引入，这样它会落在
// /study 的异步 CSS chunk 里，而不是被 routeTree 静态提升进首屏 CSS。
export const Route = createFileRoute("/_protected/_main/study/")({
    component: StudyHub,
});
