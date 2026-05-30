import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Kinetic OS" }] }),
  component: () => (
    <div className="flex-1 grid place-items-center p-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto size-10 rounded-md bg-muted grid place-items-center mb-4">
          <Inbox className="size-5 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Inbox</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Replies will land here once your sequences are sending. Connect a sender domain in settings to enable
          delivery.
        </p>
      </div>
    </div>
  ),
});
