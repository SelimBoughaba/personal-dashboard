const TOKEN_KEY = "dashboard_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    setToken(null);
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
