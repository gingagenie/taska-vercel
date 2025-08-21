import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // optional change
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await api("/me");
        setName(me.name || "");
        setEmail(me.email || "");
      } catch (e: any) {
        setError(e?.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api("/me", {
        method: "POST",
        body: JSON.stringify({ name, email, password: password || undefined }),
      });
      setMessage("Profile updated");
      setPassword("");
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Your Profile</h1>

      {message && <div className="mb-3 text-green-700">{message}</div>}
      {error && <div className="mb-3 text-red-700">{error}</div>}

      <div className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            className="mt-1 w-full border rounded-md p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            className="mt-1 w-full border rounded-md p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">New Password (optional)</label>
          <input
            className="mt-1 w-full border rounded-md p-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-md bg-primary text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
