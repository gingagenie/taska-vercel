import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { invoicesApi, customersApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LineItemsEditor } from "@/components/line-items-editor";

export default function InvoiceEdit() {
  const [isNewMatch] = useRoute("/invoices/new");
  const [isEditMatch, params] = useRoute("/invoices/:id/edit");
  const [, nav] = useLocation();
  const id = params?.id;

  const [title,setTitle] = useState(""); const [customerId,setCustomerId] = useState("");
  const [notes,setNotes] = useState(""); const [status,setStatus] = useState("draft");
  const [items,setItems] = useState<any[]>([]); const [customers,setCustomers] = useState<any[]>([]);
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [err,setErr]=useState<string|null>(null);

  useEffect(()=>{(async()=>{
    try{
      const cs = await customersApi.getAll(); setCustomers(cs||[]);
      if (id) {
        const i = await invoicesApi.get(id);
        setTitle(i.title||""); setCustomerId(i.customer_id||""); setNotes(i.notes||""); setStatus(i.status||"draft"); setItems(i.items||[]);
      }
    } catch(e:any){ setErr(e.message); } finally { setLoading(false); }
  })()},[id]);

  async function saveHeader(){
    setSaving(true); setErr(null);
    try{
      if (id){
        await invoicesApi.update(id,{ title, customerId, notes, status });
        nav(`/invoices/${id}`);
      } else {
        const r = await invoicesApi.create({ title, customerId, notes });
        nav(`/invoices/${r.id}/edit`);
      }
    }catch(e:any){ setErr(e.message||"Failed"); } finally{ setSaving(false); }
  }

  if (loading) return <div className="page">Loading…</div>;

  return (
    <div className="page space-y-6">
      <div className="header-row">
        <h1 className="text-2xl font-bold">{id ? "Edit Invoice" : "New Invoice"}</h1>
        <div className="header-actions"><Button onClick={saveHeader} disabled={saving} data-mobile-full="true">{saving?"Saving…":"Save"}</Button></div>
      </div>

      {err && <div className="text-red-600">{err}</div>}

      <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="form-grid">
          <div className="col-span-2"><Input placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} /></div>
          <div>
            <label className="block text-sm font-medium mb-1">Customer</label>
            <select className="w-full border rounded p-2" value={customerId} onChange={(e)=>setCustomerId(e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select className="w-full border rounded p-2" value={status} onChange={(e)=>setStatus(e.target.value)}>
              <option value="draft">draft</option><option value="sent">sent</option>
              <option value="paid">paid</option><option value="void">void</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {id && (
        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <CardContent className="card-pad">
            <LineItemsEditor
              items={items}
              onAdd={async (d)=>{ const r = await invoicesApi.addItem(id, d); const i = await invoicesApi.get(id); setItems(i.items||[]); }}
              onUpdate={async (itemId, patch)=>{ await invoicesApi.updateItem(id, itemId, patch); const i = await invoicesApi.get(id); setItems(i.items||[]); }}
              onDelete={async (itemId)=>{ await invoicesApi.deleteItem(id, itemId); const i = await invoicesApi.get(id); setItems(i.items||[]); }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}