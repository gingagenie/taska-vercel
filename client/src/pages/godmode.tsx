// client/src/pages/godmode.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, Clock, Ban, CheckCircle, Users, 
  RefreshCw, LogOut, Key, ChevronDown, ChevronUp 
} from "lucide-react";

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

function daysLeft(expires: string | null): number | null {
  if (!expires) return null;
  return Math.ceil((new Date(expires).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function TrialBadge({ org }: { org: Org }) {
  if (org.disabled) return <span className="px-2 py-1 rounded text-xs bg-red-900 text-red-200">Disabled</span>;
  const days = daysLeft(org.trial_expires_at);
  if (days === null) return <span className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-300">No trial</span>;
  if (days < 0) return <span className="px-2 py-1 rounded text-xs bg-red-900 text-red-200">Expired</span>;
  if (days <= 5) return <span className="px-2 py-1 rounded text-xs bg-yellow-800 text-yellow-200">{days}d left</span>;
  return <span className="px-2 py-1 rounded text-xs bg-green-900 text-green-200">{days}d left</span>;
}

// Login screen
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      await apiRequest("POST", "/api/godmode/login", { password });
      onLogin();
    } catch (e: any) {
      setError("Wrong password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-2">⚡</div>
          <h1 className="text-2xl font-bold text-white">God Mode</h1>
          <p className="text-gray-400 text-sm mt-1">Taska admin access</p>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? "Checking..." : "Enter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Org card
function OrgCard({ org, onRefetch }: { org: Org; onRefetch: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [trialDays, setTrialDays] = useState("30");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function setTrial() {
    try {
      await apiRequest("PATCH", `/api/godmode/orgs/${org.id}/trial`, { trial_days: parseInt(trialDays) });
      setMsg("Trial updated ✅");
      onRefetch();
    } catch (e: any) { setMsg("Failed ❌"); }
    setTimeout(() => setMsg(""), 3000);
  }

  async function toggleDisable() {
    try {
      await apiRequest("PATCH", `/api/godmode/orgs/${org.id}/disable`, { disabled: !org.disabled });
      onRefetch();
    } catch (e: any) { setMsg("Failed ❌"); setTimeout(() => setMsg(""), 3000); }
  }

  async function resetPassword() {
    if (!newPassword) return;
    try {
      await apiRequest("PATCH", `/api/godmode/orgs/${org.id}/reset-password`, { password: newPassword });
      setMsg("Password reset ✅");
      setNewPassword("");
    } catch (e: any) { setMsg("Failed ❌"); }
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <div className={`bg-gray-900 border rounded-xl overflow-hidden ${org.disabled ? "border-red-800 opacity-60" : "border-gray-700"}`}>
      {/* Header row */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="font-semibold text-white">{org.name}</div>
            <div className="text-xs text-gray-400">{org.owner_email || "—"}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TrialBadge org={org} />
          <span className="text-gray-400 text-xs flex items-center gap-1">
            <Users className="w-3 h-3" />{org.user_count}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Expanded actions */}
      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4 bg-gray-950">
          <div className="text-xs text-gray-500">
            Created: {new Date(org.created_at).toLocaleDateString("en-AU")}
            {org.trial_expires_at && (
              <> &nbsp;·&nbsp; Expires: {new Date(org.trial_expires_at).toLocaleDateString("en-AU")}</>
            )}
          </div>

          {/* Set trial */}
          <div>
            <div className="text-xs text-gray-400 mb-1 font-medium">Set Trial</div>
            <div className="flex gap-2">
              <input
                type="number"
                value={trialDays}
                onChange={e => setTrialDays(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm w-20 focus:outline-none focus:border-blue-500"
                min="1"
              />
              <span className="text-gray-400 text-sm self-center">days from now</span>
              <button
                onClick={setTrial}
                className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded transition-colors flex items-center gap-1"
              >
                <Clock className="w-3 h-3" /> Set
              </button>
            </div>
          </div>

          {/* Reset password */}
          <div>
            <div className="text-xs text-gray-400 mb-1 font-medium">Reset Password</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="New password"
                className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm flex-1 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={resetPassword}
                disabled={!newPassword}
                className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded transition-colors flex items-center gap-1"
              >
                <Key className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>

          {/* Disable/Enable */}
          <button
            onClick={toggleDisable}
            className={`w-full text-sm py-2 rounded flex items-center justify-center gap-2 transition-colors ${
              org.disabled 
                ? "bg-green-700 hover:bg-green-600 text-white" 
                : "bg-red-800 hover:bg-red-700 text-white"
            }`}
          >
            {org.disabled 
              ? <><CheckCircle className="w-4 h-4" /> Enable Org</>
              : <><Ban className="w-4 h-4" /> Disable Org</>
            }
          </button>

          {msg && <div className="text-center text-sm text-green-400">{msg}</div>}
        </div>
      )}
    </div>
  );
}

// Main god mode app
export default function GodMode() {
  const [authed, setAuthed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ org_name: "", email: "", password: "", trial_days: "30" });
  const [createMsg, setCreateMsg] = useState("");
  const qc = useQueryClient();

  const { data: orgs = [], isLoading, refetch } = useQuery<Org[]>({
    queryKey: ["/api/godmode/orgs"],
    enabled: authed,
  });

  async function handleLogout() {
    await apiRequest("POST", "/api/godmode/logout", {});
    setAuthed(false);
  }

  async function createOrg() {
    try {
      await apiRequest("POST", "/api/godmode/orgs", {
        ...form,
        trial_days: parseInt(form.trial_days),
      });
      setCreateMsg("Org created ✅");
      setForm({ org_name: "", email: "", password: "", trial_days: "30" });
      setCreateOpen(false);
      refetch();
    } catch (e: any) {
      setCreateMsg(e.message || "Failed ❌");
    }
    setTimeout(() => setCreateMsg(""), 4000);
  }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.owner_email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = orgs.filter(o => !o.disabled && daysLeft(o.trial_expires_at) !== null && (daysLeft(o.trial_expires_at) ?? -1) >= 0).length;
  const expiredCount = orgs.filter(o => o.trial_expires_at && (daysLeft(o.trial_expires_at) ?? 0) < 0).length;
  const disabledCount = orgs.filter(o => o.disabled).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h1 className="font-bold text-lg">God Mode</h1>
            <p className="text-gray-400 text-xs">Taska org management</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handleLogout} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total", value: orgs.length, color: "text-white" },
            { label: "Active", value: activeCount, color: "text-green-400" },
            { label: "Expired", value: expiredCount, color: "text-yellow-400" },
            { label: "Disabled", value: disabledCount, color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search + New */}
        <div className="flex gap-2">
          <input
            placeholder="Search orgs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
          />
          <button
            onClick={() => setCreateOpen(!createOpen)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Org
          </button>
        </div>

        {/* Create org form */}
        {createOpen && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Create New Org</h3>
            {[
              { key: "org_name", label: "Business Name", placeholder: "Smith Plumbing" },
              { key: "email", label: "Email", placeholder: "john@smithplumbing.com.au" },
              { key: "password", label: "Password", placeholder: "Temporary password" },
              { key: "trial_days", label: "Trial Days", placeholder: "30" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-400">{f.label}</label>
                <input
                  type={f.key === "password" ? "text" : f.key === "trial_days" ? "number" : "text"}
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
            {createMsg && <div className="text-sm text-center text-green-400">{createMsg}</div>}
            <div className="flex gap-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createOrg}
                disabled={!form.org_name || !form.email || !form.password}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded text-sm transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* Org list */}
        {isLoading ? (
          <div className="text-center text-gray-400 py-8">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-8">No orgs found</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(org => (
              <OrgCard key={org.id} org={org} onRefetch={refetch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
