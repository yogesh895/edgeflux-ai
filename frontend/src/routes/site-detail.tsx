import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/site-detail")({
  beforeLoad: () => {
    throw redirect({ to: "/site/$siteId", params: { siteId: "s06" } });
  },
});
