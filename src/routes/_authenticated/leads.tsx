import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listLeads, createLead, enrichLead, deleteLead, importLeads } from "@/lib/leads.functions";
import { ensureWorkspace } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Sparkles, Trash2, Upload, Users } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Kinetic OS" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const list = useServerFn(listLeads);
  const create = useServerFn(createLead);
  const enrich = useServerFn(enrichLead);
  const del = useServerFn(deleteLead);
  const imp = useServerFn(importLeads);
  const ensure = useServerFn(ensureWorkspace);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: () => ensure() });
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => list() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", title: "", company: "", linkedin_url: "" });

  const addMut = useMutation({
    mutationFn: () => {
      if (!ws) throw new Error("No workspace");
      return create({
        data: {
          workspace_id: ws.id,
          full_name: form.full_name,
          email: form.email || undefined,
          title: form.title || undefined,
          company: form.company || undefined,
          linkedin_url: form.linkedin_url || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Lead added");
      qc.invalidateQueries({ queryKey: ["leads"] });
      setOpen(false);
      setForm({ full_name: "", email: "", title: "", company: "", linkedin_url: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const enrichMut = useMutation({
    mutationFn: (id: string) => enrich({ data: { id } }),
    onSuccess: () => {
      toast.success("Lead enriched");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Enrichment failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const onCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ws) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return toast.error("Empty CSV");
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      return {
        full_name: cells[idx("full_name")] || cells[idx("name")] || "Unknown",
        email: cells[idx("email")] || undefined,
        title: cells[idx("title")] || undefined,
        company: cells[idx("company")] || undefined,
        linkedin_url: cells[idx("linkedin_url")] || cells[idx("linkedin")] || undefined,
      };
    });
    try {
      const res = await imp({ data: { workspace_id: ws.id, leads: rows } });
      toast.success(`Imported ${res.count} leads`);
      qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold tracking-tight text-sm">Lead Engine</h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {leads.length} leads
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onCsv} />
          <Button size="sm" variant="outline" className="h-8" onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5 mr-1.5" /> Import CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="size-3.5 mr-1.5" /> New lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add lead</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {(
                  [
                    ["full_name", "Full name *"],
                    ["email", "Email"],
                    ["title", "Title"],
                    ["company", "Company"],
                    ["linkedin_url", "LinkedIn URL"],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={k}>{label}</Label>
                    <Input
                      id={k}
                      value={form[k]}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button disabled={!form.full_name || addMut.isPending} onClick={() => addMut.mutate()}>
                  Add lead
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          {isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded border border-border animate-pulse bg-muted/30" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-12 text-center">
              <div className="mx-auto size-10 rounded-md bg-muted grid place-items-center mb-4">
                <Users className="size-5 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold">No leads yet</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add a lead manually or import a CSV.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="grid grid-cols-[minmax(160px,1.4fr)_1fr_1fr_auto_auto] gap-3 px-4 py-2 border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Name</span>
                <span>Role</span>
                <span>Company</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
              {leads.map((l) => (
                <div
                  key={l.id}
                  className="grid grid-cols-[minmax(160px,1.4fr)_1fr_1fr_auto_auto] gap-3 items-center px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{l.full_name}</div>
                    {l.email && <div className="text-xs text-muted-foreground truncate">{l.email}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{l.title ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{l.company ?? "—"}</div>
                  <StatusChip status={l.status} />
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={enrichMut.isPending && enrichMut.variables === l.id}
                      onClick={() => enrichMut.mutate(l.id)}
                    >
                      <Sparkles className="size-3 mr-1 text-ai" />
                      Enrich
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => delMut.mutate(l.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-muted text-muted-foreground border-border",
    enriching: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    enriched: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
    unsubscribed: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest rounded border ${map[status] ?? map.new}`}
    >
      {status}
    </span>
  );
}
