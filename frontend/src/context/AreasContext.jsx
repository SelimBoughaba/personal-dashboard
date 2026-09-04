import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiFetch } from "../api/client";

const AreasContext = createContext(null);

export function AreasProvider({ children }) {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch("/areas");
      setAreas(data);
    } catch {
      // Seiten, die Bereiche filtern/anzeigen, zeigen ohnehin ihren eigenen
      // Ladefehler – hier reicht ein stiller Fehlschlag.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeAreas = areas.filter((a) => !a.archived);
  const byId = Object.fromEntries(areas.map((a) => [a.id, a]));

  return (
    <AreasContext.Provider value={{ areas, activeAreas, byId, loading, reload }}>{children}</AreasContext.Provider>
  );
}

export function useAreas() {
  return useContext(AreasContext);
}
