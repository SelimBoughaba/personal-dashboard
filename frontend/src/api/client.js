const TOKEN_KEY = "dashboard_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Leert den Service-Worker-Cache mit zuletzt gesehenen API-Antworten (siehe
// vite.config.js#OFFLINE_CACHEABLE_PREFIXES). Wird bei Logout, nach einem
// Passwortwechsel und nach einer Wiederherstellung aufgerufen, damit nach
// einem Konto-/Datenwechsel keine veralteten Offline-Daten vom vorherigen
// Zustand sichtbar bleiben. Best effort: Cache Storage ist nicht überall
// verfügbar (z. B. manche eingebetteten WebViews) und darf den eigentlichen
// Vorgang nie blockieren.
export async function clearOfflineCache() {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete("api-cache");
  } catch {
    // ignorieren – siehe Kommentar oben
  }
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      // FormData braucht den vom Browser gesetzten multipart-Boundary im
      // Content-Type-Header - ein manuell gesetzter application/json-Header
      // würde den Upload sonst kaputt machen.
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    setToken(null);
    clearOfflineCache();
    window.location.href = "/login";
    throw new Error("Nicht angemeldet.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Fehler ${res.status}`);
    // Zusätzliche strukturierte Felder (z. B. needsReassignment) durchreichen,
    // damit aufrufender Code mehr als nur die Fehlermeldung auswerten kann.
    Object.assign(err, body);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}
