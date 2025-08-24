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
    <div className="fixed inset-0 z-50">
      {/* dim background + click to close */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      {/* centered container */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="
            w-[92vw] sm:w-full sm:max-w-md
            max-h-[85vh] rounded-2xl bg-white shadow-xl
            flex flex-col
          "
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b">
            <div className="text-lg font-semibold">Edit Member</div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {err && <div className="text-sm text-red-600 mb-3">{err}</div>}

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
                  <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technician">Technician</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* spacer so content never hides under footer */}
            <div className="h-3" />
          </div>

          {/* Sticky footer with safe-area bottom padding */}
          <div
            className="
              border-t px-5 py-3
              pb-[max(env(safe-area-inset-bottom),12px)]
              bg-white rounded-b-2xl
            "
          >
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={()=>onOpenChange(false)} data-testid="button-cancel-edit">Cancel</Button>
              <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-member">
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}