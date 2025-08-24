import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

export default function MemberEditModal({
  member, open, onOpenChange,
}: { member: any|null; open: boolean; onOpenChange: (v:boolean)=>void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(""); 
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("technician");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  useEffect(()=> {
    if (member) {
      setName(member.name || "");
      setEmail(member.email || "");
      setRole(member.role || "technician");
    }
  }, [member]);

  async function save() {
    if (!member) return;
    setSaving(true); setErr(null);
    try {
      await api(`/api/members/${member.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, email, role }),
      });
      qc.invalidateQueries({ queryKey: ["/api/members"] });
      onOpenChange(false);
    } catch (e:any) {
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !member) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 sm:p-6">
        <div className="text-lg font-semibold mb-4">Edit Member</div>
        {err && <div className="text-sm text-red-600 mb-2">{err}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-sm">Name</label>
            <Input value={name} onChange={(e)=>setName(e.target.value)} data-testid="input-member-name" />
          </div>
          <div>
            <label className="text-sm">Email</label>
            <Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} data-testid="input-member-email" />
          </div>
          <div>
            <label className="text-sm">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="technician">Technician</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={()=>onOpenChange(false)} data-testid="button-cancel-edit">Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-member">{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}