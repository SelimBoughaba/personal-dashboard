import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client";

// Gespeicherte Arbeitsansichten (Punkt 75): Filterkombinationen wie "Diese
// Woche · Arbeit" oder "Rechnungen prüfen" benennen und pinnen. Liegt als
// eigener Settings-Schlüssel (kein neues Datenbank-Schema nötig, dieselbe
// Art Wert wie z. B. appearance.theme), sichtbar in der Sidebar unter
// "Ansichten". Ein CustomEvent statt Prop-Drilling/Context informiert die
// Sidebar (anderer Teil des Komponentenbaums) über Änderungen.
const SETTINGS_KEY = "views.saved";
const CHANGE_EVENT = "dashboard:saved-views-changed";

export function useSavedViews() {
  const [views, setViews] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await apiFetch("/settings");
      setViews(Array.isArray(s[SETTINGS_KEY]) ? s[SETTINGS_KEY] : []);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(CHANGE_EVENT, load);
    return () => window.removeEventListener(CHANGE_EVENT, load);
  }, [load]);

  async function persist(next) {
    // Aktuellen Stand frisch nachladen statt den möglicherweise veralteten
    // lokalen State zu überschreiben - eine zweite Ansicht, die kurz zuvor
    // in einem anderen Tab/Fenster gespeichert wurde, soll nicht verloren
    // gehen.
    const s = await apiFetch("/settings");
    const current = Array.isArray(s[SETTINGS_KEY]) ? s[SETTINGS_KEY] : [];
    const merged = next(current);
    await apiFetch(`/settings/${SETTINGS_KEY}`, { method: "PUT", body: JSON.stringify({ value: merged }) });
    setViews(merged);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    return merged;
  }

  async function saveView({ label, path, search }) {
    const view = { id: crypto.randomUUID(), label, path, search };
    await persist((current) => [...current, view]);
    return view;
  }

  async function removeView(id) {
    await persist((current) => current.filter((v) => v.id !== id));
  }

  return { views, loaded, saveView, removeView, reload: load };
}
