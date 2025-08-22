import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { equipmentApi } from "@/lib/api";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EquipmentModal } from "@/components/modals/equipment-modal";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Edit, MoreHorizontal, Trash2, AlertTriangle } from "lucide-react";

function addrLine(e: any) {
  return e.customer_address || "";
}

export default function EquipmentPage() {
  const { data: list = [], isLoading } = useQuery({ 
    queryKey: ["/api/equipment"], 
    queryFn: equipmentApi.getAll 
  });
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editEquipment, setEditEquipment] = useState<any>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const filtered = (list as any[]).filter((e) =>
    [e.name, e.make, e.model, e.serial, e.customer_name, addrLine(e)]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  if (isLoading) {
    return <div className="p-6">Loading equipment...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Equipment</h1>
        <div className="flex gap-2">
          <Input 
            className="w-72" 
            placeholder="Search name, make, model, serial…" 
            value={q} 
            onChange={(e)=>setQ(e.target.value)} 
            data-testid="input-search-equipment"
          />
          <Button 
            onClick={()=>setOpen(true)}
            data-testid="button-new-equipment"
          >
            New Equipment
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              {q ? "No equipment matches your search" : "No equipment found. Create your first piece of equipment!"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((e: any) => (
            <Card key={e.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="font-semibold text-lg">
                        {e.name || "Unnamed Equipment"}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Make & Model</div>
                        <div className="font-medium">
                          {[e.make, e.model].filter(Boolean).join(" ") || "—"}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-gray-500">Serial</div>
                        <div className="font-medium">{e.serial || "—"}</div>
                      </div>
                      
                      <div>
                        <div className="text-gray-500">Customer</div>
                        <div className="font-medium">{e.customer_name}</div>
                        {e.customer_address && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <MapPin className="h-3 w-3" />
                            {e.customer_address}
                          </div>
                        )}
                      </div>
                    </div>

                    {e.notes && (
                      <div className="text-sm">
                        <div className="text-gray-500">Notes</div>
                        <div className="font-medium">{e.notes}</div>
                      </div>
                    )}
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 opacity-70 hover:opacity-100"
                        data-testid={`button-actions-equipment-${e.id}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => setEditEquipment(e)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-700"
                        onClick={() => setConfirmId(e.id)}
                        data-testid={`button-delete-equipment-${e.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EquipmentModal 
        open={open} 
        onOpenChange={setOpen} 
        onSaved={() => setOpen(false)}
      />
      
      <EquipmentModal 
        open={!!editEquipment} 
        onOpenChange={(v) => !v && setEditEquipment(null)} 
        equipment={editEquipment}
        onSaved={(updated) => {
          setEditEquipment(null);
        }}
      />

      <Dialog open={!!confirmId} onOpenChange={(v) => { if (!v) { setConfirmId(null); setDeleteErr(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirm Delete
            </DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this equipment? This cannot be undone.</p>
          {deleteErr && <div className="text-sm text-red-600 mt-2">{deleteErr}</div>}
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setConfirmId(null); setDeleteErr(null); }} 
              disabled={deleting}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirmId) return;
                setDeleting(true);
                setDeleteErr(null);
                try {
                  await equipmentApi.delete(confirmId);
                  // refresh list
                  await qc.invalidateQueries({ queryKey: ["/api/equipment"] });
                  setConfirmId(null);
                } catch (e: any) {
                  // show server message (409 when linked to jobs)
                  setDeleteErr(e?.message || "Failed to delete");
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              data-testid="button-confirm-delete"
            >
              {deleting ? "Deleting…" : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" /> 
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}