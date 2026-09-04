import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Textarea, Select, Label } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { useAreas } from "../context/AreasContext";

const EMPTY_FORM = { title: "", due_date: "", priority: "mittel", area: "", notes: "" };
const PRIORITY_COLUMNS = [
  { id: "hoch", label: "Hoch" },
  { id: "mittel", label: "Mittel" },
  { id: "niedrig", label: "Niedrig" },
];

export function Tasks() {
  const { activeAreas } = useAreas();
  const [tasks, setTasks] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [sort, setSort] = useState("due_date");
  const [view, setView] = useState("liste");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  const loadTasks = useCallback(async () => {
    const params = new URLSearchParams({ area: areaFilter, sort });
    const data = await apiFetch(`/tasks?${params}`);
    setTasks(data);
  }, [areaFilter, sort]);

  useEffect(() => {
    loadTasks().catch((err) => setError(err.message));
  }, [loadTasks]);

  function startEdit(task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      due_date: task.due_date || "",
      priority: task.priority,
      area: task.area,
      notes: task.notes || "",
    });
    setShowForm(true);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  function openNewForm() {
    const defaultArea = activeAreas.find((a) => a.is_default) || activeAreas[0];
    setForm({ ...EMPTY_FORM, area: defaultArea?.id || "" });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await apiFetch(`/tasks/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/tasks", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleStatus(task) {
    await apiFetch(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: task.status === "offen" ? "erledigt" : "offen" }),
    });
    loadTasks();
  }

  async function deleteTask(id) {
    await apiFetch(`/tasks/${id}`, { method: "DELETE" });
    loadTasks();
  }

  return (
    <div className="space-y-4">
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
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
            {[
              { key: "liste", label: "Liste" },
              { key: "kanban", label: "Kanban" },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  view === v.key ? "bg-white/10 text-ivory" : "text-ivory/55 hover:text-ivory"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {view === "liste" && (
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="!w-auto">
              <option value="due_date">Nach Fälligkeit</option>
              <option value="priority">Nach Priorität</option>
            </Select>
          )}
          <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
            {showForm ? "Abbrechen" : "+ Aufgabe"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-status-hoch">{error}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Titel</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Fälligkeitsdatum</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Priorität</Label>
              <Select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="niedrig">Niedrig</option>
                <option value="mittel">Mittel</option>
                <option value="hoch">Hoch</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Bereich</Label>
              <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                {activeAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Notizen</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{editingId ? "Speichern" : "Anlegen"}</Button>
            </div>
          </form>
        </GlassCard>
      )}

      {view === "liste" && (
        <div className="space-y-3">
          {tasks.length === 0 && (
            <p className="py-8 text-center text-sm text-ivory/40">Keine Aufgaben in diesem Bereich.</p>
          )}
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onToggle={toggleStatus} onEdit={startEdit} onDelete={deleteTask} />
          ))}
        </div>
      )}

      {view === "kanban" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {PRIORITY_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.priority === col.id && t.status === "offen");
            return (
              <div key={col.id}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-ivory/70">
                  {col.label}
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ivory/45">{colTasks.length}</span>
                </h2>
                <div className="space-y-2">
                  {colTasks.length === 0 && <p className="text-xs text-ivory/30">Keine offenen Aufgaben.</p>}
                  {colTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onToggle={toggleStatus} onEdit={startEdit} onDelete={deleteTask} compact />
                  ))}
                </div>
              </div>
            );
          })}
          <p className="col-span-full text-xs text-ivory/35">
            Erledigte Aufgaben werden im Kanban ausgeblendet – vollständige Liste inkl. erledigter Aufgaben in der
            Listenansicht.
          </p>
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, onToggle, onEdit, onDelete, compact = false }) {
  return (
    <GlassCard className={`flex items-start gap-3 ${compact ? "!p-3" : "!p-4"}`}>
      <input
        type="checkbox"
        checked={task.status === "erledigt"}
        onChange={() => onToggle(task)}
        className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 accent-lime"
      />
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${task.status === "erledigt" ? "text-ivory/40 line-through" : "text-ivory"}`}>
          {task.title}
        </p>
        {task.notes && !compact && <p className="mt-0.5 text-sm text-ivory/55">{task.notes}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AreaBadge area={task.area} />
          {!compact && <PriorityBadge priority={task.priority} />}
          {task.due_date && (
            <span className="text-xs text-ivory/55">
              fällig {new Date(task.due_date).toLocaleDateString("de-DE")}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onEdit(task)}>
          Bearbeiten
        </Button>
        <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => onDelete(task.id)}>
          Löschen
        </Button>
      </div>
    </GlassCard>
  );
}
