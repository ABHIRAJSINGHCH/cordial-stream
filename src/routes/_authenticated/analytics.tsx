import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Kinetic OS" }] }),
  component: () => (
    <div className="flex-1 grid place-items-center p-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto size-10 rounded-md bg-muted grid place-items-center mb-4">
          <BarChart3 className="size-5 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Workspace-wide performance reports are coming online. Open a campaign to see live per-sequence metrics.
        </p>
      </div>
    </div>
  ),
});
