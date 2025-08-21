import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { api } from "@/lib/api";

export default function JobEdit() {
  const [match, params] = useRoute("/jobs/:id/edit");
  const [, navigate] = useLocation();
  const jobId = params?.id as string;

  const [title, setTitle] = useState(""); 
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("new");
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const j = await api(`/jobs/${jobId}`);
        setTitle(j.title || ""); setDescription(j.description || "");
        setStatus(j.status || "new");
        setScheduledAt(j.scheduled_at || null);
        setCustomerId(j.customer_id || null);
        setCustomers(await api("/jobs/customers"));
      } catch (e:any) { setErr(e.message || "Failed to load"); }
      finally { setLoading(false); }
    })();
  }, [jobId]);

  async function save() {
    setSaving(true); setErr(null);
    try {
      await api(`/jobs/${jobId}`, {
        method: "PUT",
        body: JSON.stringify({ title, description, status, scheduledAt, customerId })
      });
      navigate(`/jobs/${jobId}`);
    } catch (e:any) { setErr(e.message || "Failed to save"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Edit Job</h1>
      <label className="block text-sm font-medium">Title</label>
      <input className="w-full border rounded p-2" value={title} onChange={e=>setTitle(e.target.value)} />

      <label className="block text-sm font-medium mt-4">Description</label>
      <textarea className="w-full border rounded p-2" rows={4} value={description} onChange={e=>setDescription(e.target.value)} />

      <label className="block text-sm font-medium mt-4">Status</label>
      <select className="w-full border rounded p-2" value={status} onChange={e=>setStatus(e.target.value)}>
        <option value="new">new</option>
        <option value="scheduled">scheduled</option>
        <option value="in_progress">in_progress</option>
        <option value="done">done</option>
        <option value="cancelled">cancelled</option>
      </select>

      <label className="block text-sm font-medium mt-4">Scheduled At</label>
      <input className="w-full border rounded p-2" placeholder="YYYY-MM-DD HH:MM:SS" value={scheduledAt ?? ""} onChange={e=>setScheduledAt(e.target.value||null)} />

      <label className="block text-sm font-medium mt-4">Customer</label>
      <select className="w-full border rounded p-2" value={customerId ?? ""} onChange={e=>setCustomerId(e.target.value || null)}>
        <option value="">— None —</option>
        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <button onClick={save} disabled={saving} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
