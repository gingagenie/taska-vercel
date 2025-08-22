import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { membersApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MembersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: list = [], isLoading } = useQuery({ queryKey: ["/api/members"], queryFn: membersApi.getAll });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = (list as any[]).filter((u) =>
    [u.name, u.email, u.role, u.phone].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  const handleDelete = async (member: any) => {
    if (!confirm(`Delete ${member.name || member.email}?`)) return;
    try {
      await membersApi.remove(member.id);
      qc.invalidateQueries({ queryKey: ["/api/members"] });
      toast({
        title: "Member deleted",
        description: "The team member has been removed successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete member",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Team Members</h1>
        <div className="flex gap-2">
          <Input 
            className="w-64" 
            placeholder="Search name, email, role…" 
            value={q} 
            onChange={(e)=>setQ(e.target.value)}
            data-testid="input-members-search"
          />
          <Button 
            onClick={()=>setOpen(true)}
            data-testid="button-add-member"
          >
            Add Member
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-500">
            Loading members...
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm" data-testid="table-members">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr className="[&>th]:px-4 [&>th]:py-3">
                <th className="text-left">Name</th>
                <th className="text-left">Email</th>
                <th className="text-left">Role</th>
                <th className="text-left">Phone</th>
                <th className="text-left w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u:any) => (
                <tr key={u.id} className="hover:bg-gray-50" data-testid={`row-member-${u.id}`}>
                  <td className="px-4 py-3" data-testid={`text-member-name-${u.id}`}>
                    {u.name || "—"}
                  </td>
                  <td className="px-4 py-3" data-testid={`text-member-email-${u.id}`}>
                    {u.email}
                  </td>
                  <td className="px-4 py-3" data-testid={`text-member-role-${u.id}`}>
                    {u.role || "—"}
                  </td>
                  <td className="px-4 py-3" data-testid={`text-member-phone-${u.id}`}>
                    {u.phone || "—"}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600"
                      onClick={() => handleDelete(u)}
                      data-testid={`button-delete-member-${u.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500" data-testid="text-no-members">
                    {q ? "No members match your search" : "No members found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AddMemberModal 
        open={open} 
        onOpenChange={setOpen} 
        onSaved={() => qc.invalidateQueries({ queryKey: ["/api/members"] })} 
      />
    </div>
  );
}

function AddMemberModal({ open, onOpenChange, onSaved }: { open:boolean; onOpenChange:(v:boolean)=>void; onSaved:()=>void; }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await membersApi.create({ email, name, role, phone });
      onOpenChange(false);
      onSaved();
      setEmail(""); setName(""); setRole(""); setPhone("");
      toast({
        title: result.created ? "Member added" : "Member updated",
        description: result.created 
          ? "New team member has been added successfully." 
          : "Existing member information has been updated.",
      });
    } catch (e:any) {
      toast({
        title: "Error",
        description: e.message || "Failed to add member",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>Email *</Label>
            <Input 
              value={email} 
              onChange={(e)=>setEmail(e.target.value)} 
              placeholder="brad@company.com"
              data-testid="input-member-email"
            />
          </div>
          <div>
            <Label>Name</Label>
            <Input 
              value={name} 
              onChange={(e)=>setName(e.target.value)} 
              placeholder="Brad Smith"
              data-testid="input-member-name"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Input 
              value={role} 
              onChange={(e)=>setRole(e.target.value)} 
              placeholder="Technician"
              data-testid="input-member-role"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input 
              value={phone} 
              onChange={(e)=>setPhone(e.target.value)} 
              placeholder="+61 400 123 456"
              data-testid="input-member-phone"
            />
          </div>
        </div>
        <div className="pt-3 flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={()=>onOpenChange(false)} 
            disabled={saving}
            data-testid="button-cancel-member"
          >
            Cancel
          </Button>
          <Button 
            onClick={save} 
            disabled={saving || !email}
            data-testid="button-save-member"
          >
            {saving ? "Saving…" : "Add member"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}