import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Textarea, Select, FormField } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { PageHeader } from "../components/ui/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { EmptyState } from "../components/ui/EmptyState";
import { SaveViewButton } from "../components/SaveViewButton";
import { useAreas } from "../context/AreasContext";
import { useAsyncAction } from "../hooks/useAsyncAction";

const EMPTY_FORM = { title: "", due_date: "", priority: "mittel", area: "", notes: "" };
const EMPTY_RECURRENCE = { freq: "weekly", interval: 1, weekdaysOnly: false, mode: "fest", until: "" };
const PRIORITY_COLUMNS = [
  { id: "hoch", label: "Hoch" },
  { id: "mittel", label: "Mittel" },
  { id: "niedrig", label: "Niedrig" },
];

const RECURRENCE_FREQ_LABEL = { daily: "Täglich", weekly: "Wöchentlich", monthly: "Monatlich" };

export function Tasks() {
  const { activeAreas } = useAreas();
  const [tasks, setTasks] = useState([]);
  // Filter leben in der URL statt in reinem Komponenten-State, damit eine
  // "Ansicht speichern" (Punkt 75) tatsächlich etwas Wiederherstellbares
  // speichert - nur nicht-Standardwerte landen in der Query, damit die URL
  // beim Standardzustand sauber bleibt.
  const [searchParams, setSearchParams] = useSearchParams();
  const areaFilter = searchParams.get("area") || "alle";
  const sort = searchParams.get("sort") || "due_date";
  const view = searchParams.get("view") || "liste";

  function setAreaFilter(value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "alle") next.delete("area");
      else next.set("area", value);
      return next;
    });
  }

  function setSort(value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "due_date") next.delete("sort");
      else next.set("sort", value);
      return next;
    });
  }

  function setView(value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "liste") next.delete("view");
      else next.set("view", value);
      return next;
    });
  }

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [recurring, setRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState(EMPTY_RECURRENCE);
  const [error, setError] = useState("");
  const { run, isPending, error: actionError } = useAsyncAction();

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
    setRecurring(!!task.recurrence);
    setRecurrence(task.recurrence ? { ...task.recurrence, until: task.recurrence.until || "" } : EMPTY_RECURRENCE);
    setShowForm(true);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setRecurring(false);
    setRecurrence(EMPTY_RECURRENCE);
    setEditingId(null);
    setShowForm(false);
  }

  function openNewForm() {
    const defaultArea = activeAreas.find((a) => a.is_default) || activeAreas[0];
    setForm({ ...EMPTY_FORM, area: defaultArea?.id || "" });
    setRecurring(false);
    setRecurrence(EMPTY_RECURRENCE);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const payload = {
      ...form,
      recurrence: recurring
        ? { ...recurrence, interval: Number(recurrence.interval) || 1, until: recurrence.until || null }
        : null,
    };
    await run("submit", async () => {
      if (editingId) {
        await apiFetch(`/tasks/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/tasks", { method: "POST", body: JSON.stringify(payload) });
      }
      resetForm();
      await loadTasks();
    });
  }

  async function toggleStatus(task) {
    await run(`toggle-${task.id}`, async () => {
      await apiFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: task.status === "offen" ? "erledigt" : "offen" }),
      });
      await loadTasks();
    });
  }

  async function deleteTask(id, task) {
    // Löschen einer offenen wiederkehrenden Aufgabe beendet die Serie
    // NICHT (siehe routes/tasks.js: es wird als "dieses eine Vorkommen
    // überspringen" verstanden) - das muss der Bestätigungsdialog schon
    // vor dem Klick klarmachen, nicht erst hinterher überraschen.
    const message =
      task?.recurrence && task.status !== "erledigt"
        ? "Dieses Vorkommen wird übersprungen, die Wiederholung läuft weiter (nächster Termin wird direkt angelegt). In den Papierkorb verschieben (30 Tage wiederherstellbar)?"
        : "Diese Aufgabe in den Papierkorb verschieben? Dort 30 Tage wiederherstellbar.";
    if (!window.confirm(message)) return;
    await run(`delete-${id}`, async () => {
      await apiFetch(`/tasks/${id}`, { method: "DELETE" });
      await loadTasks();
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Aufgaben" description="Alles an einem Ort – nach Bereich filterbar, als Liste oder Kanban." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips options={[{ id: "alle", label: "Alle" }, ...activeAreas]} value={areaFilter} onChange={setAreaFilter} />
        <div className="flex items-center gap-2">
          <SegmentedControl
            options={[
              { id: "liste", label: "Liste" },
              { id: "kanban", label: "Kanban" },
            ]}
            value={view}
            onChange={setView}
          />
          {view === "liste" && (
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="!w-auto">
              <option value="due_date">Nach Fälligkeit</option>
              <option value="priority">Nach Priorität</option>
            </Select>
          )}
          <SaveViewButton />
          <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
            {showForm ? "Abbrechen" : "+ Aufgabe"}
          </Button>
        </div>
      </div>

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormField label="Titel" className="sm:col-span-2">
              <Input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </FormField>
            <FormField label="Fälligkeitsdatum">
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </FormField>
            <FormField label="Priorität">
              <Select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="niedrig">Niedrig</option>
                <option value="mittel">Mittel</option>
                <option value="hoch">Hoch</option>
              </Select>
            </FormField>
            <FormField label="Bereich" className="sm:col-span-2">
              <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                {activeAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Notizen" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>

            <div className="sm:col-span-2 space-y-3 rounded-control border border-white/10 bg-white/[0.02] p-3">
              <label className="flex items-center gap-2 text-sm text-ivory/85">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Wiederholt sich
              </label>

              {recurring && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Häufigkeit">
                    <Select value={recurrence.freq} onChange={(e) => setRecurrence({ ...recurrence, freq: e.target.value })}>
                      <option value="daily">Täglich</option>
                      <option value="weekly">Wöchentlich</option>
                      <option value="monthly">Monatlich</option>
                    </Select>
                  </FormField>
                  <FormField label="Intervall">
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={recurrence.interval}
                      onChange={(e) => setRecurrence({ ...recurrence, interval: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Modus">
                    <Select value={recurrence.mode} onChange={(e) => setRecurrence({ ...recurrence, mode: e.target.value })}>
                      <option value="fest">Fester Rhythmus</option>
                      <option value="nach_abschluss">Nach Abschluss</option>
                    </Select>
                  </FormField>
                  <FormField label="Ende der Serie (optional)">
                    <Input
                      type="date"
                      value={recurrence.until}
                      onChange={(e) => setRecurrence({ ...recurrence, until: e.target.value })}
                    />
                  </FormField>
                  <label className="flex items-center gap-2 text-sm text-ivory/85 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={recurrence.weekdaysOnly}
                      onChange={(e) => setRecurrence({ ...recurrence, weekdaysOnly: e.target.checked })}
                      className="h-4 w-4 accent-accent"
                    />
                    Nur werktags (fällt ein Termin auf Sa/So, rutscht er auf den nächsten Werktag)
                  </label>
                  <p className="text-xs text-ivory/55 sm:col-span-2">
                    „Fester Rhythmus" zählt ab dem ursprünglichen Fälligkeitsdatum weiter, auch wenn eine Erledigung
                    verspätet erfolgt. „Nach Abschluss" zählt erst ab dem Tag der tatsächlichen Erledigung.
                  </p>
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending("submit")}>
                {isPending("submit") ? "Speichert…" : editingId ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {view === "liste" && (
        <div className="space-y-3">
          {tasks.length === 0 && (
            <EmptyState title="Keine Aufgaben in diesem Bereich" description="Lege über „+ Aufgabe“ deine erste Aufgabe an." />
          )}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={toggleStatus}
              onEdit={startEdit}
              onDelete={deleteTask}
              toggling={isPending(`toggle-${task.id}`)}
              deleting={isPending(`delete-${task.id}`)}
            />
          ))}
        </div>
      )}

      {view === "kanban" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {PRIORITY_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.priority === col.id && t.status === "offen");
            return (
              <div key={col.id}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-ivory/70">
                  {col.label}
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/65">{colTasks.length}</span>
                </h2>
                <div className="space-y-2">
                  {colTasks.length === 0 && <p className="text-xs text-ivory/65">Keine offenen Aufgaben.</p>}
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={toggleStatus}
                      onEdit={startEdit}
                      onDelete={deleteTask}
                      toggling={isPending(`toggle-${task.id}`)}
                      deleting={isPending(`delete-${task.id}`)}
                      compact
                    />
                  ))}
                </div>
              </div>
            );
          })}
          <p className="col-span-full text-xs text-ivory/65">
            Erledigte Aufgaben werden im Kanban ausgeblendet – vollständige Liste inkl. erledigter Aufgaben in der
            Listenansicht.
          </p>
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, onToggle, onEdit, onDelete, toggling = false, deleting = false, compact = false }) {
  return (
    <GlassCard className={`flex items-start gap-3 ${compact ? "!p-3" : "!p-4"} ${deleting ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={task.status === "erledigt"}
        onChange={() => onToggle(task)}
        disabled={toggling || deleting}
        className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex-1 min-w-0">
        <p className={`font-bold ${task.status === "erledigt" ? "text-ivory/40 line-through" : "text-ivory"}`}>
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
          {task.recurrence && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-ivory/70"
              title={`Wiederholt sich ${RECURRENCE_FREQ_LABEL[task.recurrence.freq].toLowerCase()}${
                task.recurrence.interval > 1 ? ` (alle ${task.recurrence.interval})` : ""
              }`}
            >
              ↻ wiederholt sich
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onEdit(task)} disabled={deleting}>
          Bearbeiten
        </Button>
        <Button
          variant="danger"
          className="!px-2 !py-1 text-xs"
          onClick={() => onDelete(task.id, task)}
          disabled={deleting}
        >
          {deleting ? "Löscht…" : "Löschen"}
        </Button>
      </div>
    </GlassCard>
  );
}
