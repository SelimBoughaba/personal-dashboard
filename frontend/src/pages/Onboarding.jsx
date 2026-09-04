import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import {
  ProfilSection,
  BereicheSection,
  KalenderSection,
  EmailSection,
  DokumenteSection,
  BenachrichtigungenSection,
} from "./Einstellungen";

const STEPS = [
  "welcome",
  "profil",
  "bereiche",
  "datenstandort",
  "kalender",
  "email",
  "dokumente",
  "finanzen",
  "benachrichtigungen",
  "abschluss",
];

const STEP_LABELS = {
  welcome: "Willkommen",
  profil: "Profil",
  bereiche: "Lebensbereiche",
  datenstandort: "Deine Daten",
  kalender: "Kalender",
  email: "E-Mail",
  dokumente: "Dokumente",
  finanzen: "Finanzen",
  benachrichtigungen: "Benachrichtigungen",
  abschluss: "Fertig",
};

const SKIPPABLE = new Set(["kalender", "email", "dokumente", "finanzen", "benachrichtigungen"]);

export function Onboarding() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [csvMessage, setCsvMessage] = useState("");

  useEffect(() => {
    apiFetch("/settings").then((s) => {
      const saved = s["onboarding.step"];
      if (typeof saved === "number" && saved >= 0 && saved < STEPS.length) {
        setStepIndex(saved);
      }
      setLoading(false);
    });
  }, []);

  function persistStep(idx) {
    apiFetch("/settings/onboarding.step", { method: "PUT", body: JSON.stringify({ value: idx }) });
  }

  function goNext() {
    const next = Math.min(stepIndex + 1, STEPS.length - 1);
    setStepIndex(next);
    persistStep(next);
  }

  function goBack() {
    const prev = Math.max(stepIndex - 1, 0);
    setStepIndex(prev);
    persistStep(prev);
  }

  async function finish() {
    await apiFetch("/settings/onboarding.completed", { method: "PUT", body: JSON.stringify({ value: true }) });
    navigate("/", { replace: true });
  }

  async function handleCsvUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCsvMessage("");
    try {
      const csv = await file.text();
      const result = await apiFetch("/invoices/import", { method: "POST", body: JSON.stringify({ csv }) });
      setCsvMessage(`${result.imported} Rechnung(en) importiert, ${result.skipped.length} übersprungen.`);
    } catch (err) {
      setCsvMessage(err.message);
    }
  }

  if (loading) return <div className="min-h-screen" />;

  const step = STEPS[stepIndex];

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-ivory/40">
            <span>
              Schritt {stepIndex + 1} von {STEPS.length}
            </span>
            <span>{STEP_LABELS[step]}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-lime transition-all duration-200"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <GlassCard className="min-h-[280px]">
          {step === "welcome" && (
            <div>
              <h1 className="mb-3 text-2xl font-semibold text-ivory">Willkommen bei deinem Dashboard</h1>
              <p className="text-sm leading-relaxed text-ivory/60">
                In wenigen Schritten richten wir gemeinsam dein persönliches Dashboard ein: Name, Lebensbereiche,
                optional Kalender und E-Mail, ein Dokumentenordner und Benachrichtigungen. Jeder Schritt außer
                Profil und Lebensbereichen lässt sich überspringen und später jederzeit in den Einstellungen
                nachholen. Alles bleibt lokal auf diesem Mac.
              </p>
            </div>
          )}
          {step === "profil" && <ProfilSection />}
          {step === "bereiche" && <BereicheSection />}
          {step === "datenstandort" && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-ivory">Wo deine Daten liegen</h2>
              <p className="text-sm leading-relaxed text-ivory/60">
                Alle Inhalte – Aufgaben, Termine, Rechnungen, Einstellungen – werden in einer lokalen Datenbank
                direkt auf diesem Mac gespeichert, nicht in der Cloud. Es gibt keine Registrierung und keine Pflicht
                zu einem externen Dienst. Im nächsten Schritt legst du optional noch einen Ordner für spätere
                Dokumente fest.
              </p>
            </div>
          )}
          {step === "kalender" && <KalenderSection />}
          {step === "email" && <EmailSection />}
          {step === "dokumente" && <DokumenteSection />}
          {step === "finanzen" && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-ivory">Finanzen</h2>
              <p className="mb-4 text-sm leading-relaxed text-ivory/60">
                Rechnungen lassen sich jederzeit manuell anlegen oder automatisch aus E-Mail-Anhängen erkennen.
                Falls du bereits eine Liste hast, kannst du jetzt eine CSV-Datei importieren (Spalten: Absender,
                Betreff, Betrag, Faelligkeitsdatum, Bereich, Status).
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="text-sm text-ivory/70 file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/[0.04] file:px-3 file:py-1.5 file:text-ivory/80"
              />
              {csvMessage && <p className="mt-3 text-sm text-ivory/70">{csvMessage}</p>}
            </div>
          )}
          {step === "benachrichtigungen" && <BenachrichtigungenSection />}
          {step === "abschluss" && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-ivory">Datenschutz-Übersicht &amp; Abschluss</h2>
              <ul className="mb-4 space-y-2 text-sm text-ivory/60">
                <li>• Alle Daten liegen lokal in einer SQLite-Datenbank auf diesem Mac.</li>
                <li>
                  • Zugangsdaten für Kalender/E-Mail liegen ebenfalls lokal im Klartext (kein Zugriff auf den
                  macOS-Schlüsselbund aus dem Browser möglich).
                </li>
                <li>• Keine Cloud-Pflicht, keine Telemetrie, keine kostenpflichtigen Dienste.</li>
                <li>
                  • Alle Einstellungen lassen sich jederzeit unter „Einstellungen“ ändern, dieser Assistent ist dort
                  erneut aufrufbar.
                </li>
              </ul>
              <p className="text-sm text-ivory/60">Fertig! Weiter geht’s zu deiner persönlichen Übersicht.</p>
            </div>
          )}
        </GlassCard>

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0}>
            Zurück
          </Button>
          <div className="flex gap-2">
            {SKIPPABLE.has(step) && (
              <Button variant="ghost" onClick={goNext}>
                Überspringen
              </Button>
            )}
            {step === "abschluss" ? (
              <Button onClick={finish}>Fertig</Button>
            ) : (
              <Button onClick={goNext}>Weiter</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
