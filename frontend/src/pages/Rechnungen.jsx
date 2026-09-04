import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Label } from "../components/ui/Field";
import { AreaBadge, AREA_LABELS } from "../components/ui/AreaBadge";

const AREAS = ["corelegal", "evermont", "nachhilfe", "allgemein"];
const EMPTY_FORM = { sender_name: "", subject: "", amount: "", due_date: "", area: "allgemein", status: "offen" };

function formatAmount(value) {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function Rechnungen() {
  const [invoices, setInvoices] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ area: areaFilter, status: statusFilter });
    const data = await apiFetch(`/invoices?${params}`);
    setInvoices(data);
  }, [areaFilter, statusFilter]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function handleScan() {
    setScanning(true);
    setScanMessage("");
    setError("");
    try {
      const result = await apiFetch("/invoices/scan", { method: "POST" });
      setScanMessage(
        result.new > 0 ? `${result.new} neue Rechnung(en) gefunden.` : "Keine neuen Rechnungen gefunden.",
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  function startEdit(inv) {
    setEditingId(inv.id);
    setForm({
      sender_name: inv.sender_name || "",
      subject: inv.subject || "",
      amount: inv.amount ?? "",
      due_date: inv.due_date || "",
      area: inv.area,
      status: inv.status,
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
        await apiFetch(`/invoices/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/invoices", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleStatus(inv) {
    await apiFetch(`/invoices/${inv.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: inv.status === "offen" ? "bezahlt" : "offen" }),
    });
    load();
  }

  async function deleteInvoice(id) {
    await apiFetch(`/invoices/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {["alle", ...AREAS].map((a) => (
            <button
              key={a}
              onClick={() => setAreaFilter(a)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                areaFilter === a
                  ? "border-accent-500/40 bg-accent-500/15 text-accent-400"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
              }`}
            >
              {a === "alle" ? "Alle" : AREA_LABELS[a]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!w-auto">
            <option value="alle">Alle Status</option>
            <option value="offen">Offen</option>
            <option value="bezahlt">Bezahlt</option>
          </Select>
          <Button variant="ghost" onClick={handleScan} disabled={scanning}>
            {scanning ? "Durchsuche…" : "Postfächer durchsuchen"}
          </Button>
          <Button onClick={() => (showForm ? resetForm() : setShowForm(true))} variant={showForm ? "ghost" : "primary"}>
            {showForm ? "Abbrechen" : "+ Rechnung"}
          </Button>
        </div>
      </div>

      {scanMessage && <p className="text-sm text-accent-400">{scanMessage}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Absender</Label>
              <Input
                value={form.sender_name}
                onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Betreff / Bezeichnung</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <Label>Betrag (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
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
              <Label>Bereich</Label>
              <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABELS[a]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="offen">Offen</option>
                <option value="bezahlt">Bezahlt</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{editingId ? "Speichern" : "Anlegen"}</Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="space-y-3">
        {invoices.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">Keine Rechnungen in diesem Bereich.</p>
        )}
        {invoices.map((inv) => (
          <GlassCard key={inv.id} className="flex items-start gap-3 !p-4">
            <input
              type="checkbox"
              checked={inv.status === "bezahlt"}
              onChange={() => toggleStatus(inv)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 accent-accent-500"
              title="Als bezahlt markieren"
            />
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${inv.status === "bezahlt" ? "text-slate-500 line-through" : "text-slate-100"}`}>
                {inv.sender_name || inv.sender || "Unbekannter Absender"}
              </p>
              {inv.subject && <p className="mt-0.5 truncate text-sm text-slate-400">{inv.subject}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AreaBadge area={inv.area} />
                <span className="text-xs font-medium text-slate-200">{formatAmount(inv.amount)}</span>
                {inv.due_date && (
                  <span className="text-xs text-slate-400">
                    fällig {new Date(inv.due_date).toLocaleDateString("de-DE")}
                  </span>
                )}
                {inv.file_name && <span className="text-xs text-slate-500">{inv.file_name}</span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(inv)}>
                Bearbeiten
              </Button>
              <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => deleteInvoice(inv.id)}>
                Löschen
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
