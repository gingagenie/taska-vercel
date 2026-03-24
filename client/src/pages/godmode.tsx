import { useState, useEffect, useCallback } from "react";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface Org {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  trial_expires_at: string | null;
  disabled: boolean;
  user_count: number;
  owner_email: string | null;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function daysLeft(expires: string | null): number | null {
  if (!expires) return null;
  return Math.ceil((new Date(expires).getTime() - Date.now()) / 86_400_000);
}

function TrialBadge({ org }: { org: Org }) {
  if (org.disabled)
    return <span style={badge("bg:#7f1d1d,c:#fca5a5")}>Disabled</span>;
  if (!org.trial_expires_at)
    return <span style={badge("bg:#1e3a5f,c:#93c5fd")}>No Trial</span>;
  const d = daysLeft(org.trial_expires_at);
  if (d === null || d <= 0)
    return <span style={badge("bg:#451a03,c:#fbbf24")}>Expired</span>;
  return (
    <span style={badge("bg:#14532d,c:#86efac")}>
      {d}d left
    </span>
  );
}

function badge(spec: string) {
  const obj: Record<string, string> = {};
  spec.split(",").forEach((p) => {
    const [k, v] = p.split(":");
    if (k === "bg") obj.backgroundColor = v;
    else if (k === "c") obj.color = v;
  });
  return {
    ...obj,
    padding: "2px 10px",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    display: "inline-block",
    whiteSpace: "nowrap" as const,
  };
}

/* ─── API helpers ────────────────────────────────────────────────────── */

function api(password: string) {
  const headers = { "Content-Type": "application/json", "x-godmode-password": password };

  return {
    get: (path: string) => fetch(`/api/godmode${path}`, { headers }).then(r => r.json()),
    post: (path: string, body: object) =>
      fetch(`/api/godmode${path}`, { method: "POST", headers, body: JSON.stringify(body) }).then(r => r.json()),
    patch: (path: string, body: object) =>
      fetch(`/api/godmode${path}`, { method: "PATCH", headers, body: JSON.stringify(body) }).then(r => r.json()),
  };
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const S = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#0a0a0a",
    color: "#e5e7eb",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "0 0 60px",
  } as React.CSSProperties,

  header: {
    background: "linear-gradient(135deg, #111 0%, #1a1a2e 100%)",
    borderBottom: "1px solid #1f2937",
    padding: "16px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,

  title: {
    fontSize: 22,
    fontWeight: 700,
    background: "linear-gradient(90deg, #a78bfa, #60a5fa)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
  } as React.CSSProperties,

  container: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "32px 32px 0",
  } as React.CSSProperties,

  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 8,
    padding: "20px 24px",
  } as React.CSSProperties,

  input: {
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: 6,
    color: "#e5e7eb",
    padding: "8px 12px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  btnPrimary: {
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,

  btnGhost: {
    background: "#1f2937",
    color: "#9ca3af",
    border: "1px solid #374151",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,

  btnDanger: {
    background: "#7f1d1d",
    color: "#fca5a5",
    border: "1px solid #991b1b",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  } as React.CSSProperties,

  th: {
    textAlign: "left" as const,
    padding: "10px 12px",
    color: "#6b7280",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "1px solid #1f2937",
  } as React.CSSProperties,

  td: {
    padding: "12px 12px",
    borderBottom: "1px solid #111",
    verticalAlign: "middle" as const,
  } as React.CSSProperties,

  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "#9ca3af",
    marginBottom: 6,
  } as React.CSSProperties,

  error: {
    color: "#f87171",
    fontSize: 13,
    marginTop: 8,
  } as React.CSSProperties,

  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    padding: 24,
  } as React.CSSProperties,

  modal: {
    background: "#111827",
    border: "1px solid #374151",
    borderRadius: 10,
    padding: 28,
    width: "100%",
    maxWidth: 480,
  } as React.CSSProperties,
};

/* ─── Modals ─────────────────────────────────────────────────────────── */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateOrgModal({ password, onDone, onClose }: { password: string; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ org_name: "", email: "", userPassword: "", trial_days: "30" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await api(password).post("/orgs", {
        org_name: form.org_name,
        email: form.email,
        password: form.userPassword,
        trial_days: parseInt(form.trial_days) || 30,
      });
      if (res.error) { setErr(res.error); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Create Org + User" onClose={onClose}>
      <form onSubmit={submit}>
        {(["org_name", "email", "userPassword", "trial_days"] as const).map((k) => (
          <div key={k} style={{ marginBottom: 16 }}>
            <label style={S.label}>{k === "userPassword" ? "Password" : k === "org_name" ? "Org Name" : k === "trial_days" ? "Trial Days" : "Admin Email"}</label>
            <input style={S.input} value={form[k]} onChange={set(k)} required type={k === "userPassword" ? "password" : "text"} placeholder={k === "trial_days" ? "30" : ""} />
          </div>
        ))}
        {err && <p style={S.error}>{err}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" style={S.btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" style={S.btnPrimary} disabled={busy}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TrialModal({ org, password, onDone, onClose }: { org: Org; password: string; onDone: () => void; onClose: () => void }) {
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await api(password).patch(`/orgs/${org.id}/trial`, { trial_days: parseInt(days) });
      if (res.error) { setErr(res.error); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Set Trial — ${org.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <label style={S.label}>Days from now</label>
        <input style={S.input} type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} required />
        {err && <p style={S.error}>{err}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" style={S.btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" style={S.btnPrimary} disabled={busy}>{busy ? "Saving…" : "Set Trial"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ org, password, onDone, onClose }: { org: Org; password: string; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ email: org.owner_email || "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await api(password).patch(`/orgs/${org.id}/reset-password`, form);
      if (res.error) { setErr(res.error); return; }
      setOk(true);
      setTimeout(onDone, 1200);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reset Password — ${org.name}`} onClose={onClose}>
      {ok ? (
        <p style={{ color: "#86efac", textAlign: "center", margin: "16px 0" }}>Password reset!</p>
      ) : (
        <form onSubmit={submit}>
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>User Email</label>
            <input style={S.input} value={form.email} onChange={set("email")} required />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>New Password</label>
            <input style={S.input} type="password" value={form.new_password} onChange={set("new_password")} required minLength={6} />
          </div>
          {err && <p style={S.error}>{err}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" style={S.btnGhost} onClick={onClose}>Cancel</button>
            <button type="submit" style={S.btnPrimary} disabled={busy}>{busy ? "Resetting…" : "Reset Password"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ─── Stats bar ──────────────────────────────────────────────────────── */

function Stats({ orgs }: { orgs: Org[] }) {
  const total = orgs.length;
  const active = orgs.filter((o) => !o.disabled && o.trial_expires_at && daysLeft(o.trial_expires_at)! > 0).length;
  const expired = orgs.filter((o) => !o.disabled && o.trial_expires_at && daysLeft(o.trial_expires_at)! <= 0).length;
  const disabled = orgs.filter((o) => o.disabled).length;

  const items = [
    { label: "Total Orgs", value: total, color: "#a78bfa" },
    { label: "Active Trials", value: active, color: "#34d399" },
    { label: "Expired", value: expired, color: "#fbbf24" },
    { label: "Disabled", value: disabled, color: "#f87171" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
      {items.map((it) => (
        <div key={it.label} style={{ ...S.card, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: it.color }}>{it.value}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Login screen ───────────────────────────────────────────────────── */

function LoginScreen({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/godmode/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      }).then((r) => r.json());

      if (res.ok) {
        onAuth(pw);
      } else {
        setErr(res.error || "Wrong password");
      }
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...S.card, width: 340 }}>
        <h1 style={{ ...S.title, marginBottom: 8, textAlign: "center" }}>⚡ God Mode</h1>
        <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", marginBottom: 24 }}>Enter password to continue</p>
        <form onSubmit={submit}>
          <input
            style={{ ...S.input, marginBottom: 12 }}
            type="password"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
          {err && <p style={{ ...S.error, marginBottom: 8 }}>{err}</p>}
          <button type="submit" style={{ ...S.btnPrimary, width: "100%", padding: "10px" }} disabled={busy}>
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Main dashboard ─────────────────────────────────────────────────── */

type ModalState =
  | { type: "create" }
  | { type: "trial"; org: Org }
  | { type: "reset"; org: Org }
  | null;

function Dashboard({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(password).get("/orgs");
      setOrgs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { load(); }, [load]);

  async function toggleDisable(org: Org) {
    setBusy(org.id + "-disable");
    try {
      await api(password).patch(`/orgs/${org.id}/disable`, { disabled: !org.disabled });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const filtered = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.owner_email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.title}>⚡ God Mode</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#4b5563" }}>{orgs.length} orgs</span>
          <button style={S.btnGhost} onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div style={S.container}>
        <Stats orgs={orgs} />

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <input
            style={{ ...S.input, maxWidth: 320 }}
            placeholder="Search orgs or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ flex: 1 }} />
          <button style={S.btnPrimary} onClick={() => setModal({ type: "create" })}>
            + New Org
          </button>
        </div>

        {/* Table */}
        <div style={S.card}>
          {loading ? (
            <p style={{ color: "#6b7280", textAlign: "center", padding: 32 }}>Loading…</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  {["Org", "Owner", "Users", "Status", "Trial Expires", "Actions"].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#6b7280", padding: 32 }}>
                      No orgs found
                    </td>
                  </tr>
                ) : (
                  filtered.map((org) => (
                    <tr key={org.id} style={{ opacity: org.disabled ? 0.5 : 1 }}>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600 }}>{org.name}</div>
                        <div style={{ color: "#4b5563", fontSize: 11 }}>{org.slug}</div>
                      </td>
                      <td style={S.td}>
                        <span style={{ color: "#9ca3af" }}>{org.owner_email || "—"}</span>
                      </td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        <span style={{ color: "#9ca3af" }}>{org.user_count}</span>
                      </td>
                      <td style={S.td}>
                        <TrialBadge org={org} />
                      </td>
                      <td style={S.td}>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>
                          {org.trial_expires_at
                            ? new Date(org.trial_expires_at).toLocaleDateString()
                            : "—"}
                        </span>
                      </td>
                      <td style={S.td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            style={S.btnGhost}
                            onClick={() => setModal({ type: "trial", org })}
                          >
                            Trial
                          </button>
                          <button
                            style={S.btnGhost}
                            onClick={() => setModal({ type: "reset", org })}
                          >
                            Reset PW
                          </button>
                          <button
                            style={org.disabled ? S.btnPrimary : S.btnDanger}
                            disabled={busy === org.id + "-disable"}
                            onClick={() => toggleDisable(org)}
                          >
                            {org.disabled ? "Enable" : "Disable"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal?.type === "create" && (
        <CreateOrgModal
          password={password}
          onDone={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "trial" && (
        <TrialModal
          org={modal.org}
          password={password}
          onDone={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "reset" && (
        <ResetPasswordModal
          org={modal.org}
          password={password}
          onDone={() => setModal(null)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* ─── Page root ──────────────────────────────────────────────────────── */

const STORAGE_KEY = "godmode_pw";

export default function GodModePage() {
  const [password, setPassword] = useState<string | null>(() => {
    try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  function handleAuth(pw: string) {
    try { sessionStorage.setItem(STORAGE_KEY, pw); } catch {}
    setPassword(pw);
  }

  function handleLogout() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    setPassword(null);
  }

  if (!password) return <LoginScreen onAuth={handleAuth} />;
  return <Dashboard password={password} onLogout={handleLogout} />;
}
