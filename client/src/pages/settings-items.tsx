import { useEffect, useState } from "react";
import { itemPresetsApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function SettingsItems() {
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("0");
  const [tax, setTax] = useState("10");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Search/filter
  const [search, setSearch] = useState("");

  // Inline editing
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editTax, setEditTax] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await itemPresetsApi.search("");
      setList(data || []);
    } catch (error) {
      console.error("Failed to load presets:", error);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await itemPresetsApi.create({
        name: name.trim(),
        unit_amount: Number(unit || 0),
        tax_rate: Number(tax || 0),
      });
      setName(""); setUnit("0"); setTax("10");
      await load();
    } catch (error) {
      console.error("Failed to create preset:", error);
    }
    setSaving(false);
  }

  function startEdit(p: any) {
    setEditId(p.id);
    setEditName(p.name);
    setEditUnit(String(p.unit_amount));
    setEditTax(String(p.tax_rate));
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setEditSaving(true);
    try {
      await itemPresetsApi.update(id, {
        name: editName.trim(),
        unit_amount: Number(editUnit || 0),
        tax_rate: Number(editTax || 0),
      });
      setEditId(null);
      await load();
    } catch (error) {
      console.error("Failed to update preset:", error);
    }
    setEditSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this preset?")) return;
    try {
      await itemPresetsApi.delete(id);
      await load();
    } catch (error) {
      console.error("Failed to delete preset:", error);
    }
  }

  const filtered = list.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page space-y-6">
      <div className="header-row">
        <h1 className="text-2xl font-bold">Item Presets</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add New Preset</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-3 max-w-3xl">
            <Input
              placeholder="Name (e.g., Labour)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && add()}
              data-testid="input-preset-name"
            />
            <Input
              placeholder="Unit $"
              inputMode="decimal"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              data-testid="input-preset-unit"
            />
            <Input
              placeholder="Tax %"
              inputMode="decimal"
              value={tax}
              onChange={e => setTax(e.target.value)}
              data-testid="input-preset-tax"
            />
            <Button
              onClick={add}
              disabled={saving || !name.trim()}
              data-testid="button-add-preset"
            >
              {saving ? "Adding..." : "Add / Update"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Existing Presets
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filtered.length}{search ? ` of ${list.length}` : ""})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search bar */}
          <div className="mb-3 max-w-3xl">
            <Input
              placeholder="Search presets…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {loading ? (
            <div className="text-center py-4">Loading presets...</div>
          ) : (
            <div className="max-w-3xl overflow-x-auto rounded-md border">
              {/* Scrollable wrapper */}
              <div className="overflow-y-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                      <th className="px-3 py-2 text-right font-medium">Tax %</th>
                      <th className="px-3 py-2 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                          {search ? `No presets matching "${search}"` : "No presets yet. Add some common items above to speed up billing."}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((p: any) =>
                        editId === p.id ? (
                          // Inline edit row
                          <tr key={p.id} className="border-b dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
                            <td className="px-2 py-1">
                              <Input
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className="h-8 text-sm"
                                autoFocus
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                value={editUnit}
                                onChange={e => setEditUnit(e.target.value)}
                                inputMode="decimal"
                                className="h-8 text-sm text-right"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                value={editTax}
                                onChange={e => setEditTax(e.target.value)}
                                inputMode="decimal"
                                className="h-8 text-sm text-right"
                              />
                            </td>
                            <td className="px-2 py-1 text-center">
                              <div className="flex gap-1 justify-center">
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => saveEdit(p.id)}
                                  disabled={editSaving}
                                >
                                  {editSaving ? "…" : "Save"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={cancelEdit}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          // Normal row
                          <tr
                            key={p.id}
                            className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                            data-testid={`row-preset-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
                            onDoubleClick={() => startEdit(p)}
                          >
                            <td className="px-3 py-2 font-medium">{p.name}</td>
                            <td className="px-3 py-2 text-right font-mono">${Number(p.unit_amount).toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-mono">{Number(p.tax_rate).toFixed(2)}%</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex gap-1 justify-center">
                                <button
                                  onClick={() => startEdit(p)}
                                  className="text-xs text-blue-500 hover:text-blue-700 px-1"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => remove(p.id)}
                                  className="text-xs text-red-400 hover:text-red-600 px-1"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
