import { useCallback, useState } from "react";

// Kapselt eine asynchrone Schreibaktion (Anlegen/Ändern/Löschen) mit
// Pending-Status pro Aktion und Fehlerbehandlung. Ohne diesen Hook wurden
// Aktionen wie toggleStatus()/deleteTask() "fire and forget" aufgerufen:
// ein Fehlschlag (abgelaufene Session, Netzwerkfehler, Server-Ablehnung)
// verschwand als unhandled promise rejection, ohne dass die Nutzerin
// etwas davon sah, und ein Doppelklick konnte dieselbe Aktion zweimal
// auslösen, bevor die erste Antwort da war.
//
// `key` identifiziert die konkrete Aktion (z. B. die Zeile/den Datensatz),
// damit parallele Aktionen auf unterschiedlichen Zeilen sich nicht
// gegenseitig blockieren, während dieselbe Aktion auf derselben Zeile
// nicht doppelt laufen kann.
export function useAsyncAction() {
  const [pendingKeys, setPendingKeys] = useState(() => new Set());
  const [error, setError] = useState("");

  const run = useCallback(
    async (key, fn) => {
      if (pendingKeys.has(key)) return;
      setPendingKeys((prev) => new Set(prev).add(key));
      setError("");
      try {
        await fn();
      } catch (err) {
        setError(err.message || "Aktion fehlgeschlagen.");
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [pendingKeys],
  );

  return {
    run,
    isPending: (key) => pendingKeys.has(key),
    anyPending: pendingKeys.size > 0,
    error,
    clearError: () => setError(""),
  };
}
