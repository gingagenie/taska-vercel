import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { notesApi, chargesApi, photosApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export default function JobNotesCharges() {
  const [match, params] = useRoute("/jobs/:id/notes");
  const jobId = params?.id as string;

  const [notes, setNotes] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  
  const [newNote, setNewNote] = useState("");
  const [newCharge, setNewCharge] = useState({
    kind: "labour",
    description: "",
    quantity: "",
    unitPrice: ""
  });
  
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [savingCharge, setSavingCharge] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const loadData = async () => {
    try {
      const [notesData, chargesData, photosData] = await Promise.all([
        notesApi.list(jobId),
        chargesApi.list(jobId),
        photosApi.list(jobId),
      ]);
      setNotes(notesData || []);
      setCharges(chargesData || []);
      setPhotos(photosData || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) loadData();
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

  const addCharge = async () => {
    if (!newCharge.description.trim()) {
      setErr("Description is required");
      return;
    }
    setSavingCharge(true);
    setErr(null);
    try {
      const charge = await chargesApi.add(jobId, {
        kind: newCharge.kind,
        description: newCharge.description,
        quantity: Number(newCharge.quantity) || 0,
        unitPrice: Number(newCharge.unitPrice) || 0,
      });
      setCharges(prev => [charge, ...prev]);
      setNewCharge({ kind: "labour", description: "", quantity: "", unitPrice: "" });
    } catch (e: any) {
      setErr(e?.message || "Failed to add charge");
    } finally {
      setSavingCharge(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setUploadingPhoto(true);
    setErr(null);
    try {
      const photo = await photosApi.upload(jobId, file);
      setPhotos(prev => [photo, ...prev]);
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

  const totalCharges = charges.reduce((sum, charge) => sum + Number(charge.total || 0), 0);

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

      {/* Work Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Work Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Add Note</Label>
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Enter work notes..."
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

      {/* Photos */}
      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="photo-upload">Upload Photo</Label>
            <Input
              id="photo-upload"
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={uploadingPhoto}
            />
            {uploadingPhoto && <p className="text-sm text-gray-500 mt-1">Uploading...</p>}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.url}
                  alt="Job photo"
                  className="w-full h-24 object-cover rounded border"
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

      {/* Charges */}
      <Card>
        <CardHeader>
          <CardTitle>Billable Charges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded">
            <div>
              <Label>Type</Label>
              <Select value={newCharge.kind} onValueChange={(value) => setNewCharge(prev => ({ ...prev, kind: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="labour">Labour</SelectItem>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="travel">Travel</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={newCharge.description}
                onChange={(e) => setNewCharge(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description"
              />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                step="0.1"
                value={newCharge.quantity}
                onChange={(e) => setNewCharge(prev => ({ ...prev, quantity: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Unit Price</Label>
              <Input
                type="number"
                step="0.01"
                value={newCharge.unitPrice}
                onChange={(e) => setNewCharge(prev => ({ ...prev, unitPrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="md:col-span-4">
              <Button onClick={addCharge} disabled={savingCharge || !newCharge.description.trim()}>
                {savingCharge ? "Adding..." : "Add Charge"}
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            {charges.length === 0 ? (
              <p className="text-gray-500 text-sm">No charges yet</p>
            ) : (
              <>
                {charges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                          {charge.kind}
                        </span>
                        <span className="font-medium">{charge.description}</span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {charge.quantity} × ${Number(charge.unit_price).toFixed(2)}
                      </div>
                    </div>
                    <div className="font-bold">${Number(charge.total).toFixed(2)}</div>
                  </div>
                ))}
                <div className="text-right pt-2 border-t">
                  <div className="text-lg font-bold">Total: ${totalCharges.toFixed(2)}</div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}