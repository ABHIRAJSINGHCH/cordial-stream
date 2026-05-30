import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ensureWorkspace, updateWorkspace } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Kinetic OS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const ensure = useServerFn(ensureWorkspace);
  const update = useServerFn(updateWorkspace);
  const qc = useQueryClient();
  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: () => ensure() });
  const [form, setForm] = useState({ name: "", sender_name: "", sender_email: "", daily_send_cap: 50 });

  useEffect(() => {
    if (ws) {
      setForm({
        name: ws.name,
        sender_name: ws.sender_name ?? "",
        sender_email: ws.sender_email ?? "",
        daily_send_cap: ws.daily_send_cap ?? 50,
      });
    }
  }, [ws]);

  const save = useMutation({
    mutationFn: () => {
      if (!ws) throw new Error("No workspace");
      return update({
        data: {
          id: ws.id,
          name: form.name,
          sender_name: form.sender_name || undefined,
          sender_email: form.sender_email || undefined,
          daily_send_cap: form.daily_send_cap,
        },
      });
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <header className="h-14 border-b border-border flex items-center px-4 md:px-6 shrink-0">
        <h1 className="font-semibold text-sm tracking-tight">Settings</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-xl mx-auto space-y-8">
          <div className="space-y-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Workspace
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sender_name">Sender name</Label>
                <Input
                  id="sender_name"
                  value={form.sender_name}
                  onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sender_email">Sender email</Label>
                <Input
                  id="sender_email"
                  type="email"
                  value={form.sender_email}
                  onChange={(e) => setForm({ ...form, sender_email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap">Daily send cap (per workspace)</Label>
              <Input
                id="cap"
                type="number"
                min={1}
                max={1000}
                value={form.daily_send_cap}
                onChange={(e) => setForm({ ...form, daily_send_cap: Number(e.target.value) })}
              />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
