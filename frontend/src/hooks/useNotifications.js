import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import { useAsyncAction } from "./useAsyncAction";

// Benachrichtigungszentrum (Punkt 76): Abruf + Aktionen (gelesen/erledigt/
// verschoben) sowie das Auslösen nativer Mitteilungen für NEU erschienene
// ungelesene Einträge - respektiert Ruhezeiten, Kategorie-Schalter und
// standardmäßig verborgene Vorschautexte. Wird sowohl von der eigenen Seite
// als auch (nur für den Badge-Zähler) von der Sidebar genutzt.

const POLL_INTERVAL_MS = 180000; // 3 Minuten - siehe Kommentar zu checkCalendarConnection in notifications.js: kein Grund für häufigeres Live-Probing.
// Ohne dieses Event würde die Sidebar-Badge (eigene Hook-Instanz, siehe
// withPreferences:false) erst beim nächsten 3-Minuten-Poll merken, dass auf
// der Benachrichtigungsseite gerade etwas gelesen/erledigt/verschoben
// wurde - derselbe CustomEvent-Ansatz wie bei den Gespeicherten Ansichten
// (useSavedViews.js), statt Prop-Drilling/Context.
const CHANGE_EVENT = "dashboard:notifications-changed";
const CATEGORY_LABEL = { deadline: "Frist", background: "Hintergrundaufgabe", integration_error: "Integrationsfehler" };

const DEFAULT_QUIET_HOURS = { enabled: false, start: "22:00", end: "07:00" };
const DEFAULT_CATEGORIES = { deadline: true, background: true, integration_error: true };

function isWithinQuietHours(quietHours) {
  if (!quietHours?.enabled || !quietHours.start || !quietHours.end) return false;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = quietHours.start.split(":").map(Number);
  const [eh, em] = quietHours.end.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end; // Fenster über Mitternacht hinweg (z. B. 22:00-07:00)
}

// { withPreferences: false } liefert nur items/unreadCount ohne Einstellungen
// zu laden oder native Mitteilungen auszulösen - für die Sidebar-Badge, die
// dauerhaft (auch außerhalb der eigentlichen Seite) im Hintergrund mitläuft.
// Ohne diese Trennung würde eine gleichzeitig gemountete Sidebar-Instanz und
// die geöffnete Benachrichtigungsseite unabhängig voneinander "neue"
// Einträge erkennen und doppelte native Mitteilungen auslösen.
export function useNotifications({ withPreferences = true } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quietHours, setQuietHours] = useState(DEFAULT_QUIET_HOURS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [nativeEnabled, setNativeEnabled] = useState(false);
  const [showSensitivePreviews, setShowSensitivePreviews] = useState(false);
  const [permission, setPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const { run, isPending } = useAsyncAction();
  const knownKeysRef = useRef(null); // null = noch kein erster Abruf gelaufen -> beim ersten Laden nichts "neu" melden

  const loadSettings = useCallback(async () => {
    const s = await apiFetch("/settings");
    setQuietHours({ ...DEFAULT_QUIET_HOURS, ...(s["notifications.quietHours"] || {}) });
    setCategories({ ...DEFAULT_CATEGORIES, ...(s["notifications.categories"] || {}) });
    setNativeEnabled(!!s["notifications.nativeEnabled"]);
    setShowSensitivePreviews(!!s["notifications.showSensitivePreviews"]);
    return { quietHours: { ...DEFAULT_QUIET_HOURS, ...(s["notifications.quietHours"] || {}) }, categories: { ...DEFAULT_CATEGORIES, ...(s["notifications.categories"] || {}) }, nativeEnabled: !!s["notifications.nativeEnabled"], showSensitivePreviews: !!s["notifications.showSensitivePreviews"] };
  }, []);

  const fireNative = useCallback((newUnread, prefs) => {
    if (!prefs.nativeEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (isWithinQuietHours(prefs.quietHours)) return;
    const relevant = newUnread.filter((n) => prefs.categories[n.category] !== false);
    if (relevant.length === 0) return;
    if (relevant.length === 1) {
      const n = relevant[0];
      const body = prefs.showSensitivePreviews ? n.title : `1 neue Benachrichtigung (${CATEGORY_LABEL[n.category] || n.category})`;
      new Notification("Dashboard", { body, tag: n.key });
    } else {
      new Notification("Dashboard", { body: `${relevant.length} neue Benachrichtigungen`, tag: "dashboard-bundle" });
    }
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      if (!withPreferences) {
        setItems(await apiFetch("/notifications"));
        return;
      }
      const [data, prefs] = await Promise.all([apiFetch("/notifications"), loadSettings()]);
      setItems(data);
      if (knownKeysRef.current !== null) {
        const newUnread = data.filter((n) => !n.read && !knownKeysRef.current.has(n.key));
        if (newUnread.length > 0) fireNative(newUnread, prefs);
      }
      knownKeysRef.current = new Set(data.map((n) => n.key));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [withPreferences, loadSettings, fireNative]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    window.addEventListener(CHANGE_EVENT, load);
    return () => {
      clearInterval(interval);
      window.removeEventListener(CHANGE_EVENT, load);
    };
  }, [load]);

  async function patch(runKey, key, body) {
    await run(runKey, async () => {
      await apiFetch(`/notifications/${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    });
  }

  async function saveQuietHours(next) {
    setQuietHours(next);
    await apiFetch("/settings/notifications.quietHours", { method: "PUT", body: JSON.stringify({ value: next }) });
  }
  async function saveCategories(next) {
    setCategories(next);
    await apiFetch("/settings/notifications.categories", { method: "PUT", body: JSON.stringify({ value: next }) });
  }
  async function saveShowSensitivePreviews(value) {
    setShowSensitivePreviews(value);
    await apiFetch("/settings/notifications.showSensitivePreviews", { method: "PUT", body: JSON.stringify({ value }) });
  }
  async function requestNativePermission() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    const enabled = result === "granted";
    setNativeEnabled(enabled);
    await apiFetch("/settings/notifications.nativeEnabled", { method: "PUT", body: JSON.stringify({ value: enabled }) });
  }
  async function disableNative() {
    setNativeEnabled(false);
    await apiFetch("/settings/notifications.nativeEnabled", { method: "PUT", body: JSON.stringify({ value: false }) });
  }

  const unreadCount = items.filter((n) => !n.read).length;

  return {
    items,
    loading,
    error,
    unreadCount,
    isPending,
    markRead: (key, read = true) => patch(`read-${key}`, key, { read }),
    markDone: (key) => patch(key, key, { done: true }),
    snooze: (key, untilIso) => patch(`snooze-${key}`, key, { snoozedUntil: untilIso }),
    reload: load,
    quietHours,
    saveQuietHours,
    categories,
    saveCategories,
    showSensitivePreviews,
    saveShowSensitivePreviews,
    nativeEnabled,
    permission,
    requestNativePermission,
    disableNative,
  };
}
