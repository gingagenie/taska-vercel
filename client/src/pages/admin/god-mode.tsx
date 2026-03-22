import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Clock, Ban, CheckCircle, Users, RefreshCw } from "lucide-react";

type Org = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  trial_expires_at: string | null;
  disabled: boolean | null;
  user_count: number;
  owner_email: string | null;
};

function trialStatus(org: Org): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (org.disabled) return { label: "Disabled", variant: "destructive" };
  if (!org.trial_expires_at) return { label: "No Trial", variant: "outline" };
  const expires = new Date(org.trial_expires_at);
  const now = new Date();
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: "Expired", variant: "destructive" };
  if (daysLeft <= 5) return { label: `${daysLeft}d left`, variant: "secondary" };
  return { label: `${daysLeft}d left`, variant: "default" };
}

export default function GodMode() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [trialOrgId, setTrialOrgId] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState("30");
  const [search, setSearch] = useState("");

  // Create org form state
  const [form, setForm] = useState({
    org_name: "",
    email: "",
    password: "",
    trial_days: "30",
  });

  const { data: orgs = [], isLoading, refetch } = useQuery<Org[]>({
    queryKey: ["/api/admin/godmode/orgs"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/admin/godmode/orgs", {
        ...data,
        trial_days: parseInt(data.trial_days),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Org created ✅" });
      setCreateOpen(false);
      setForm({ org_name: "", email: "", password: "", trial_days: "30" });
      qc.invalidateQueries({ queryKey: ["/api/admin/godmode/orgs"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const trialMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) =>
      apiRequest("PATCH", `/api/admin/godmode/orgs/${id}/trial`, { trial_days: days }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Trial updated ✅" });
      setTrialOrgId(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/godmode/orgs"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disableMutation = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/godmode/orgs/${id}/disable`, { disabled }).then((r) => r.json()),
    onSuccess: (_, vars) => {
      toast({ title: vars.disabled ? "Org disabled" : "Org re-enabled" });
      qc.invalidateQueries({ queryKey: ["/api/admin/godmode/orgs"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.owner_email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = orgs.filter((o) => !o.disabled && o.trial_expires_at && new Date(o.trial_expires_at) > new Date()).length;
  const expiredCount = orgs.filter((o) => o.trial_expires_at && new Date(o.trial_expires_at) <= new Date()).length;
  const disabledCount = orgs.filter((o) => o.disabled).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚡ God Mode</h1>
          <p className="text-gray-500 text-sm mt-1">Manage trial orgs and users</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Org
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Total Orgs</p>
            <p className="text-2xl font-bold">{orgs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Active Trials</p>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Expired</p>
            <p className="text-2xl font-bold text-orange-500">{expiredCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Disabled</p>
            <p className="text-2xl font-bold text-red-500">{disabledCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by org name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Org</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-center">Users</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                    No orgs found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((org) => {
                  const status = trialStatus(org);
                  return (
                    <TableRow key={org.id} className={org.disabled ? "opacity-50" : ""}>
                      <TableCell>
                        <div className="font-medium">{org.name}</div>
                        <div className="text-xs text-gray-400">{org.slug}</div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {org.owner_email ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="flex items-center justify-center gap-1 text-sm">
                          <Users className="w-3 h-3" /> {org.user_count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {org.trial_expires_at
                          ? new Date(org.trial_expires_at).toLocaleDateString("en-AU")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTrialOrgId(org.id);
                              setTrialDays("30");
                            }}
                          >
                            <Clock className="w-3 h-3 mr-1" /> Trial
                          </Button>
                          <Button
                            size="sm"
                            variant={org.disabled ? "outline" : "destructive"}
                            onClick={() =>
                              disableMutation.mutate({ id: org.id, disabled: !org.disabled })
                            }
                          >
                            {org.disabled ? (
                              <><CheckCircle className="w-3 h-3 mr-1" /> Enable</>
                            ) : (
                              <><Ban className="w-3 h-3 mr-1" /> Disable</>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Org Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Org</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Business Name</label>
              <Input
                value={form.org_name}
                onChange={(e) => setForm({ ...form, org_name: e.target.value })}
                placeholder="Smith Plumbing"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john@smithplumbing.com.au"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Temporary password"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Trial Days</label>
              <Input
                type="number"
                value={form.trial_days}
                onChange={(e) => setForm({ ...form, trial_days: e.target.value })}
                min="1"
                max="365"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.org_name || !form.email || !form.password}
            >
              {createMutation.isPending ? "Creating..." : "Create Org"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Trial Dialog */}
      <Dialog open={!!trialOrgId} onOpenChange={() => setTrialOrgId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Trial Period</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <label className="text-sm font-medium">Days from now</label>
            <Input
              type="number"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              min="1"
              max="365"
            />
            <p className="text-xs text-gray-400">
              Expires:{" "}
              {new Date(
                Date.now() + parseInt(trialDays || "0") * 24 * 60 * 60 * 1000
              ).toLocaleDateString("en-AU")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialOrgId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                trialMutation.mutate({ id: trialOrgId!, days: parseInt(trialDays) })
              }
              disabled={trialMutation.isPending}
            >
              {trialMutation.isPending ? "Saving..." : "Set Trial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
