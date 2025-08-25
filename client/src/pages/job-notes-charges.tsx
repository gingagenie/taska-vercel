import { useEffect, useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { notesApi, chargesApi, photosApi, api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export default function JobNotesCharges() {
  const [match, params] = useRoute("/jobs/:id/notes");
  const jobId = params?.id as string;

  const [notes, setNotes] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  
  const [newNote, setNewNote] = useState("");
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeQty, setChargeQty] = useState(1);
  const [chargeUnit, setChargeUnit] = useState(0);
  
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // org-scoped templates in localStorage
  const orgId = useMemo(() => localStorage.getItem("x-org-id") || "default-org", []);
  type ChargeTemplate = { description: string; unitPrice: number };
  const TEMPLATES_KEY = `chargeTemplates:${orgId}`;

  const [templates, setTemplates] = useState<ChargeTemplate[]>([]);
  const [autoSaveTemplate, setAutoSaveTemplate] = useState(true);
  const [suggestions, setSuggestions] = useState<ChargeTemplate[]>([]);

  // load templates on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      if (raw) setTemplates(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [TEMPLATES_KEY]);

  function persistTemplates(next: ChargeTemplate[]) {
    setTemplates(next);
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)); } catch {}
  }

  // update suggestions and auto-fill unit price on exact match
  useEffect(() => {
    const q = (chargeDesc || "").trim().toLowerCase();
    if (!q) { setSuggestions([]); return; }
    const matches = templates
      .filter(t => t.description.toLowerCase().includes(q))
      .slice(0, 6);
    setSuggestions(matches);

    const exact = templates.find(t => t.description.toLowerCase() === q);
    if (exact) setChargeUnit(exact.unitPrice);
  }, [chargeDesc, templates]);

  function applyTemplate(t: ChargeTemplate) {
    setChargeDesc(t.description);
    setChargeUnit(t.unitPrice);
    setSuggestions([]);
  }

  function rememberTemplate(desc: string, price: number) {
    const d = desc.trim();
    if (!d) return;
    const exists = templates.find(t => t.description.toLowerCase() === d.toLowerCase());
    const next = exists
      ? templates.map(t => t.description.toLowerCase() === d.toLowerCase() ? { description: d, unitPrice: price } : t)
      : [{ description: d, unitPrice: price }, ...templates].slice(0, 50); // cap list
    persistTemplates(next);
  }

  const loadAll = async () => {
    try {
      const [notesData, chargesData, photosData, jobData] = await Promise.all([
        notesApi.list(jobId),
        chargesApi.list(jobId),
        photosApi.list(jobId),
        api(`/api/jobs/${jobId}`),
      ]);
      setNotes(notesData || []);
      setCharges(chargesData || []);
      setPhotos(photosData || []);
      setNotesText(jobData?.notes || "");
    } catch (e: any) {
      setErr(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) loadAll();
  }, [jobId]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    setErr(null);
    try {
      const note = await notesApi.add(jobId, newNote);
      setNotes(prev => [note, ...prev]);
      setNewNote("");
    } catch (e: any) {
      setErr(e?.message || "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    setErr(null);
    try {
      await api(`/api/jobs/${jobId}/notes`, {
        method: "PUT",
        body: JSON.stringify({ notes: notesText }),
      });
      // Reload data to confirm save was successful
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };



  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingPhoto(true);
    setErr(null);
    try {
      // Upload files one by one since our API expects single file uploads
      for (const file of Array.from(files)) {
        const photo = await photosApi.upload(jobId, file);
        setPhotos(prev => [photo, ...prev]);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      event.target.value = ""; // Reset file input
    }
  };

  const removePhoto = async (photoId: string) => {
    try {
      await photosApi.remove(jobId, photoId);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (e: any) {
      setErr(e?.message || "Failed to remove photo");
    }
  };



  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/jobs/${jobId}`}>
          <a><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></a>
        </Link>
        <h1 className="text-2xl font-bold">Notes & Charges</h1>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {err}
        </div>
      )}

      {/* Notes section */}
      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Work Performed</Label>
            <Textarea
              rows={6}
              placeholder="Describe the work performed..."
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
            />
            <Button onClick={saveNotes} disabled={savingNotes}>
              {savingNotes ? "Saving..." : "Save notes"}
            </Button>
          </div>
          
          <div className="space-y-2">
            <Label>Add Quick Note</Label>
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Enter a quick work note..."
              rows={3}
            />
            <Button onClick={addNote} disabled={savingNote || !newNote.trim()}>
              {savingNote ? "Adding..." : "Add Note"}
            </Button>
          </div>
          
          <div className="space-y-3">
            {notes.length === 0 ? (
              <p className="text-gray-500 text-sm">No notes yet</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="bg-gray-50 p-3 rounded border">
                  <p className="text-sm whitespace-pre-wrap">{note.text}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(note.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Charges section */}
      <Card>
        <CardHeader><CardTitle>Charges</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Description</Label>
            <div className="relative">
              <Input
                placeholder="e.g., Labour"
                value={chargeDesc}
                onChange={(e) => setChargeDesc(e.target.value)}
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded border bg-white shadow">
                  {suggestions.map((s) => (
                    <button
                      key={s.description}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-50"
                      onClick={() => applyTemplate(s)}
                    >
                      <div className="font-medium">{s.description}</div>
                      <div className="text-xs text-gray-500">${Number(s.unitPrice).toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick-pick chips */}
            {templates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {templates.slice(0, 6).map((t) => (
                  <button key={t.description} type="button" onClick={() => applyTemplate(t)}>
                    <Badge variant="secondary">
                      {t.description} — ${Number(t.unitPrice).toFixed(2)}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                step="0.25"
                placeholder="Qty"
                value={String(chargeQty)}
                onChange={(e) => setChargeQty(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Unit price</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={String(chargeUnit)}
                onChange={(e) => setChargeUnit(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="autosave-template"
              type="checkbox"
              className="h-4 w-4"
              checked={autoSaveTemplate}
              onChange={(e) => setAutoSaveTemplate(e.target.checked)}
            />
            <label htmlFor="autosave-template" className="text-sm text-gray-700">
              Remember this description & price for next time
            </label>
          </div>

          <Button
            onClick={async () => {
              if (!chargeDesc.trim()) { setErr("Charge description is required"); return; }
              setSaving(true);
              try {
                await api(`/api/jobs/${jobId}/charges`, {
                  method: "POST",
                  body: JSON.stringify({
                    description: chargeDesc.trim(),
                    quantity: Number(chargeQty) || 0,
                    unitPrice: Number(chargeUnit) || 0,
                  }),
                });
                if (autoSaveTemplate) {
                  rememberTemplate(chargeDesc.trim(), Number(chargeUnit) || 0);
                }
                setChargeDesc(""); setChargeQty(1); setChargeUnit(0);
                await loadAll();
              } catch (e: any) {
                setErr(e?.message || "Failed to add charge");
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Add charge"}
          </Button>

          {/* Existing charges list + total */}
          <div className="pt-2 space-y-2">
            {charges.length === 0 && <div className="text-gray-500">No charges yet</div>}
            {charges.map((c) => (
              <div key={c.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  <div className="font-medium">{c.description}</div>
                  <div className="text-xs text-gray-500">
                    {c.quantity} × ${Number(c.unit_price).toFixed(2)}
                  </div>
                </div>
                <div className="font-semibold">${Number(c.total).toFixed(2)}</div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2 mt-2">
              <div className="font-semibold">Total</div>
              <div className="font-bold">${charges.reduce((s, c) => s + Number(c.total || 0), 0).toFixed(2)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photos section */}
      <Card>
        <CardHeader><CardTitle>Photos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="photo-upload">Upload Photos</Label>
            <Input
              id="photo-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              disabled={uploadingPhoto}
            />
            {uploadingPhoto && <p className="text-sm text-gray-500 mt-1">Uploading...</p>}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.url}
                  alt="Job photo"
                  className="rounded border object-cover w-full h-40"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-6 w-6"
                  onClick={() => removePhoto(photo.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          {photos.length === 0 && (
            <p className="text-gray-500 text-sm">No photos yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}