import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch, getToken } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Label } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PageHeader } from "../components/ui/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { StatTile } from "../components/ui/StatTile";
import { EmptyState } from "../components/ui/EmptyState";
import { useAreas } from "../context/AreasContext";

const EMPTY_FORM = { sender_name: "", subject: "", amount: "", due_date: "", area: "", status: "offen" };

function formatAmount(value) {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function Rechnungen() {
  const { activeAreas } = useAreas();
  const [invoices, setInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ area: areaFilter, status: statusFilter });
    const [filtered, all] = await Promise.all([
      apiFetch(`/invoices?${params}`),
      apiFetch("/invoices?area=alle&status=alle"),
    ]);
    setInvoices(filtered);
    setAllInvoices(all);
  }, [areaFilter, statusFilter]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const openInvoices = allInvoices.filter((i) => i.status === "offen");
  const overdueInvoices = openInvoices.filter((i) => i.due_date && i.due_date < todayIso);
  const openSum = openInvoices.reduce((s, i) => s + (i.amount || 0), 0);
  const overdueSum = overdueInvoices.reduce((s, i) => s + (i.amount || 0), 0);
  const paidThisMonthSum = allInvoices
    .filter((i) => i.status === "bezahlt" && i.updated_at && i.updated_at.slice(0, 7) === todayIso.slice(0, 7))
    .reduce((s, i) => s + (i.amount || 0), 0);

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

  function openNewForm() {
    const defaultArea = activeAreas.find((a) => a.is_default) || activeAreas[0];
    setForm({ ...EMPTY_FORM, area: defaultArea?.id || "" });
    setShowForm(true);
  }

  async function handleExportCsv() {
    setError("");
    try {
      const res = await fetch("/api/invoices/export.csv", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Export fehlgeschlagen.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rechnungen-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleImportCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setImportMessage("");
    try {
      const csv = await file.text();
      const result = await apiFetch("/invoices/import", { method: "POST", body: JSON.stringify({ csv }) });
      const skippedNote = result.skipped.length > 0 ? `, ${result.skipped.length} übersprungen (siehe unten)` : "";
      setImportMessage(
        `${result.imported} Rechnung(en) importiert${skippedNote}.` +
          (result.skipped.length > 0
            ? " " + result.skipped.map((s) => `Zeile ${s.row}: ${s.reason}`).join(" ")
            : ""),
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
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
    <div className="space-y-6">
      <PageHeader
        title="Finanzen"
        description="Rechnungen sind vollständig nutzbar. Einnahmen, Ausgaben, Budgets und Auswertungen folgen in einer späteren Etappe."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Offene Rechnungen" value={formatAmount(openSum)} />
        <StatTile label="Überfällig" value={formatAmount(overdueSum)} tone={overdueSum > 0 ? "danger" : "default"} />
        <StatTile label="Bezahlt (dieser Monat)" value={formatAmount(paidThisMonthSum)} />
        <StatTile label="Anzahl offen" value={openInvoices.length} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips options={[{ id: "alle", label: "Alle" }, ...activeAreas]} value={areaFilter} onChange={setAreaFilter} />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!w-auto">
            <option value="alle">Alle Status</option>
            <option value="offen">Offen</option>
            <option value="bezahlt">Bezahlt</option>
          </Select>
          <Button variant="ghost" onClick={handleScan} disabled={scanning}>
            {scanning ? "Durchsuche…" : "Postfächer durchsuchen"}
          </Button>
          <Button variant="ghost" onClick={handleExportCsv}>
            CSV export
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportCsv} />
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
            CSV import
          </Button>
          <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
            {showForm ? "Abbrechen" : "+ Rechnung"}
          </Button>
        </div>
      </div>

      {scanMessage && <p className="text-sm text-ivory/80">{scanMessage}</p>}
      {importMessage && <p className="text-sm text-ivory/80">{importMessage}</p>}
      {error && <p className="text-sm text-status-hoch">{error}</p>}

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
          <EmptyState title="Keine Rechnungen in diesem Bereich" description="Über „+ Rechnung“ manuell anlegen oder Postfächer durchsuchen." />
        )}
        {invoices.map((inv) => (
          <GlassCard key={inv.id} className="flex items-start gap-3 !p-4">
            <input
              type="checkbox"
              checked={inv.status === "bezahlt"}
              onChange={() => toggleStatus(inv)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 accent-lime"
              title="Als bezahlt markieren"
            />
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${inv.status === "bezahlt" ? "text-ivory/40 line-through" : "text-ivory"}`}>
                {inv.sender_name || inv.sender || "Unbekannter Absender"}
              </p>
              {inv.subject && <p className="mt-0.5 truncate text-sm text-ivory/55">{inv.subject}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AreaBadge area={inv.area} />
                <span className="text-xs font-medium text-ivory/90">{formatAmount(inv.amount)}</span>
                {inv.due_date && (
                  <span className="text-xs text-ivory/55">
                    fällig {new Date(inv.due_date).toLocaleDateString("de-DE")}
                  </span>
                )}
                {inv.file_name && <span className="text-xs text-ivory/40">{inv.file_name}</span>}
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
