import { createContext, useContext, useState, useCallback } from "react";
import { getToken, setToken, apiFetch } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(!!getToken());

  const login = useCallback(async (password) => {
    const { token } = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    setToken(token);
    setAuthed(true);
  }, []);

  // Nur beim allerersten Start nutzbar (noch kein Passwort vorhanden) –
  // siehe GET /api/auth/status.
  const setup = useCallback(async (password) => {
    const { token } = await apiFetch("/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    setToken(token);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAuthed(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authed, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
