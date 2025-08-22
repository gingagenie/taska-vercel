import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function JobEdit() {
  const [match, params] = useRoute("/jobs/:id/edit");
  const [, navigate] = useLocation();
  const jobId = params?.id as string;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("new");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await api(`/api/jobs/${jobId}`);
        if (!alive) return;
        setTitle(j.title || "");
        setDescription(j.description || "");
        setStatus(j.status || "new");
        setScheduledAt(j.scheduled_at || "");
        setCustomerId(j.customer_id || "");

        const cs = await api(`/api/jobs/customers`);
        if (!alive) return;
        setCustomers(cs || []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [jobId]);

  function normalizeDate(v: string | null | undefined): string | null {
    if (!v) return null;
    if (v.includes("T")) {
      const [d, t] = v.split("T");
      const tt = t.length === 5 ? `${t}:00` : t; // HH:MM -> HH:MM:SS
      return `${d} ${tt}`.slice(0, 19);
    }
    return v;
  }

  async function save() {
    if (!title.trim()) {
      setErr("Title is required");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api(`/api/jobs/${jobId}`, {
        method: "PUT",
        body: JSON.stringify({
          title,
          description,
          status,
          scheduledAt: scheduledAt ? scheduledAt.replace("T", " ") + (scheduledAt.length === 16 ? ":00" : "") : null,
          customerId: customerId || null,
        }),
      });
      navigate(`/jobs/${jobId}`);
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Job</h1>

        {/* Use a button that navigates instead of <a> inside <Link> */}
        <Button variant="outline" onClick={() => navigate(`/jobs/${jobId}`)}>
          Back to job
        </Button>
      </div>

      {err && <div className="text-red-600">{err}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              className="w-full border rounded p-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="new">new</option>
              <option value="scheduled">scheduled</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Scheduled At</label>
            <Input
              placeholder="YYYY-MM-DD HH:MM:SS or 2025-08-22T10:00"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Customer</label>
            <select
              className="w-full border rounded p-2"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">— None —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={() => navigate(`/jobs/${jobId}`)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
