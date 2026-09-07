import { useState } from "react";
import { apiFetch } from "../api/client";
import { Button } from "./ui/Button";
import { Input, Select, FormField } from "./ui/Field";
import { useAreas } from "../context/AreasContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { localIsoDate } from "../utils/date";

// "Erfassen" aus der Kopfleiste (Punkt 53): ein neuer Gedanke soll sich
// ablegen lassen, ohne die aktuelle Seite zu verlassen. Nur Aufgabe und
// Rechnung, kein Termin - der Kalender ist bewusst nur eine Ansicht auf
// iCloud (siehe Kalender.jsx: "nur Ansicht, kein Anlegen/Bearbeiten"),
// ein lokal angelegter Termin würde dort nie erscheinen.
const TASK_FORM = { title: "", due_date: "", priority: "mittel", area: "" };
const INVOICE_FORM = { sender_name: "", subject: "", amount: "", due_date: "", area: "" };

function CaptureModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center px-4 pt-24 sm:pt-32" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="overlay-panel relative w-full max-w-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ivory">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-7 w-7 items-center justify-center rounded-control text-ivory/65 hover:bg-white/[0.06] hover:text-ivory"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function QuickCapture({ onCreated }) {
  const { activeAreas } = useAreas();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null); // null | "task" | "invoice"
  const [taskForm, setTaskForm] = useState(TASK_FORM);
  const [invoiceForm, setInvoiceForm] = useState(INVOICE_FORM);
  const { run, isPending, error, clearError } = useAsyncAction();

  function defaultArea() {
    return (activeAreas.find((a) => a.is_default) || activeAreas[0])?.id || "";
  }

  function openTask() {
    setMenuOpen(false);
    clearError();
    setTaskForm({ ...TASK_FORM, due_date: localIsoDate(), area: defaultArea() });
    setModal("task");
  }

  function openInvoice() {
    setMenuOpen(false);
    clearError();
    setInvoiceForm({ ...INVOICE_FORM, due_date: localIsoDate(), area: defaultArea() });
    setModal("invoice");
  }

  async function submitTask(e) {
    e.preventDefault();
    await run("task", async () => {
      await apiFetch("/tasks", { method: "POST", body: JSON.stringify(taskForm) });
      setModal(null);
      onCreated();
    });
  }

  async function submitInvoice(e) {
    e.preventDefault();
    await run("invoice", async () => {
      await apiFetch("/invoices", { method: "POST", body: JSON.stringify(invoiceForm) });
      setModal(null);
      onCreated();
    });
  }

  return (
    <div className="relative">
      <Button type="button" variant="primary" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="true" aria-expanded={menuOpen}>
        + Erfassen
      </Button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="overlay-panel absolute right-0 z-40 mt-2 w-44 p-1.5">
            <button
              type="button"
              onClick={openTask}
              className="block w-full rounded-control px-3 py-2 text-left text-sm text-ivory/85 hover:bg-white/[0.06]"
            >
              Aufgabe
            </button>
            <button
              type="button"
              onClick={openInvoice}
              className="block w-full rounded-control px-3 py-2 text-left text-sm text-ivory/85 hover:bg-white/[0.06]"
            >
              Rechnung
            </button>
          </div>
        </>
      )}

      {modal === "task" && (
        <CaptureModal title="Neue Aufgabe" onClose={() => setModal(null)}>
          <form onSubmit={submitTask} className="space-y-3">
            <FormField label="Titel">
              <Input
                autoFocus
                required
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Fällig am">
                <Input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                />
              </FormField>
              <FormField label="Priorität">
                <Select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                  <option value="niedrig">Niedrig</option>
                  <option value="mittel">Mittel</option>
                  <option value="hoch">Hoch</option>
                </Select>
              </FormField>
            </div>
            <FormField label="Bereich">
              <Select value={taskForm.area} onChange={(e) => setTaskForm({ ...taskForm, area: e.target.value })}>
                {activeAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </FormField>
            {error && <p className="text-sm text-status-hoch">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending("task")}>
              {isPending("task") ? "Speichert…" : "Aufgabe anlegen"}
            </Button>
          </form>
        </CaptureModal>
      )}

      {modal === "invoice" && (
        <CaptureModal title="Neue Rechnung" onClose={() => setModal(null)}>
          <form onSubmit={submitInvoice} className="space-y-3">
            <FormField label="Absender">
              <Input
                autoFocus
                value={invoiceForm.sender_name}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, sender_name: e.target.value })}
              />
            </FormField>
            <FormField label="Betreff">
              <Input
                required
                value={invoiceForm.subject}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, subject: e.target.value })}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Betrag (€)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                />
              </FormField>
              <FormField label="Fällig am">
                <Input
                  type="date"
                  value={invoiceForm.due_date}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                />
              </FormField>
            </div>
            <FormField label="Bereich">
              <Select value={invoiceForm.area} onChange={(e) => setInvoiceForm({ ...invoiceForm, area: e.target.value })}>
                {activeAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </FormField>
            {error && <p className="text-sm text-status-hoch">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending("invoice")}>
              {isPending("invoice") ? "Speichert…" : "Rechnung anlegen"}
            </Button>
          </form>
        </CaptureModal>
      )}
    </div>
  );
}
