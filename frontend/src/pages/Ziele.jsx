import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Label, Textarea } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { useAreas } from "../context/AreasContext";

const EMPTY_FORM = { title: "", description: "", area: "", target_date: "", status: "aktiv", progress: "0" };
const STATUS_LABELS = { aktiv: "Aktiv", erreicht: "Erreicht", abgebrochen: "Abgebrochen" };

function ProgressBar({ value }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-lime" style={{ width: `${value}%` }} />
    </div>
  );
}

function MilestoneChecklist({ goal, onChange }) {
  const [newText, setNewText] = useState("");

  function toggle(id) {
    onChange(goal.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)));
  }

  function remove(id) {
    onChange(goal.milestones.filter((m) => m.id !== id));
  }

  function add() {
    if (!newText.trim()) return;
    onChange([...goal.milestones, { id: crypto.randomUUID(), text: newText.trim(), done: false }]);
    setNewText("");
  }

  return (
    <div className="mt-3 space-y-1.5">
      {goal.milestones.map((m) => (
        <div key={m.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={m.done}
            onChange={() => toggle(m.id)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-lime"
          />
          <span className={`flex-1 ${m.done ? "text-ivory/40 line-through" : "text-ivory/80"}`}>{m.text}</span>
          <button onClick={() => remove(m.id)} className="text-ivory/30 hover:text-status-hoch">
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Meilenstein hinzufügen…"
          className="!py-1.5 text-sm"
        />
        <Button type="button" variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={add}>
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}

export function Ziele() {
  const { activeAreas } = useAreas();
  const [goals, setGoals] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ area: areaFilter, status: statusFilter });
    setGoals(await apiFetch(`/goals?${params}`));
  }, [areaFilter, statusFilter]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  function openNewForm() {
    const defaultArea = activeAreas.find((a) => a.is_default) || activeAreas[0];
    setForm({ ...EMPTY_FORM, area: defaultArea?.id || "" });
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(g) {
    setEditingId(g.id);
    setForm({
      title: g.title,
      description: g.description || "",
      area: g.area,
      target_date: g.target_date || "",
      status: g.status,
      progress: String(g.progress ?? 0),
      _hasMilestones: g.milestones.length > 0,
    });
    setShowForm(true);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await apiFetch(`/goals/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/goals", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateMilestones(goal, milestones) {
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? { ...g, milestones } : g)));
    try {
      await apiFetch(`/goals/${goal.id}`, { method: "PATCH", body: JSON.stringify({ milestones }) });
      await load();
    } catch (err) {
      setError(err.message);
      await load();
    }
  }

  async function deleteGoal(id) {
    setError("");
    try {
      await apiFetch(`/goals/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ivory">Ziele</h1>
        <p className="mt-1 text-sm text-ivory/50">
          Der Fortschritt errechnet sich automatisch aus abgehakten Meilensteinen, sobald welche angelegt sind –
          ansonsten bleibt er bei 0 %, bis Meilensteine hinzugefügt werden.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[{ id: "alle", label: "Alle" }, ...activeAreas].map((a) => (
            <button
              key={a.id}
              onClick={() => setAreaFilter(a.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                areaFilter === a.id
                  ? "border-white/20 bg-white/10 text-ivory"
                  : "border-white/10 bg-white/[0.03] text-ivory/55 hover:bg-white/[0.06]"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!w-auto">
            <option value="alle">Alle Status</option>
            {Object.entries(STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
            {showForm ? "Abbrechen" : "+ Ziel"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-status-hoch">{error}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Titel</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="sm:col-span-2">
              <Label>Beschreibung</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Zieldatum</Label>
              <Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
            </div>
            <div>
              <Label>Bereich</Label>
              <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                {activeAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Fortschritt (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={form.progress}
                disabled={!!form._hasMilestones}
                onChange={(e) => setForm({ ...form, progress: e.target.value })}
              />
              <p className="mt-1 text-xs text-ivory/40">
                {form._hasMilestones
                  ? "Dieses Ziel hat bereits Meilensteine – der Fortschritt richtet sich danach und lässt sich hier nicht manuell überschreiben. Meilensteine unten auf der Zielkarte entfernen, um wieder manuell zu steuern."
                  : "Nur wirksam, solange dieses Ziel keine Meilensteine hat. Sobald welche hinzugefügt werden, übernehmen die den Fortschritt automatisch."}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{editingId ? "Speichern" : "Anlegen"}</Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="space-y-3">
        {goals.length === 0 && <p className="py-8 text-center text-sm text-ivory/40">Keine Ziele in diesem Bereich.</p>}
        {goals.map((g) => (
          <GlassCard key={g.id} className="!p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ivory">{g.title}</p>
                {g.description && <p className="mt-0.5 text-sm text-ivory/55">{g.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <AreaBadge area={g.area} />
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ivory/55">{STATUS_LABELS[g.status]}</span>
                  {g.target_date && (
                    <span className="text-xs text-ivory/55">Ziel: {new Date(g.target_date).toLocaleDateString("de-DE")}</span>
                  )}
                  <span className="text-xs font-medium text-ivory/90">{g.progress}%</span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={g.progress} />
                </div>
                <MilestoneChecklist goal={g} onChange={(milestones) => updateMilestones(g, milestones)} />
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(g)}>
                  Bearbeiten
                </Button>
                <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => deleteGoal(g.id)}>
                  Löschen
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
