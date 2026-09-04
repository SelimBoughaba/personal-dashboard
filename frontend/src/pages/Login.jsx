import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Field";

export function Login() {
  const { login, setup } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => setConfigured(!!data.configured))
      .catch(() => setConfigured(true))
      .finally(() => setChecking(false));
  }, []);

  async function afterAuth() {
    try {
      const settings = await apiFetch("/settings");
      navigate(settings["onboarding.completed"] ? "/" : "/einrichtung", { replace: true });
    } catch {
      navigate("/", { replace: true });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!configured && password !== confirmPassword) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    try {
      if (configured) {
        await login(password);
      } else {
        await setup(password);
      }
      await afterAuth();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <GlassCard className="w-full max-w-sm">
        {configured ? (
          <>
            <h1 className="mb-1 text-xl font-semibold text-ivory">Dashboard</h1>
            <p className="mb-6 text-sm text-ivory/55">Bitte anmelden.</p>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-semibold text-ivory">Willkommen</h1>
            <p className="mb-6 text-sm text-ivory/55">
              Lege ein Passwort für dieses Dashboard fest. Es schützt den Zugriff im Heimnetz.
            </p>
          </>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="login-password">Passwort</Label>
            <Input
              id="login-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {!configured && (
            <div>
              <Label htmlFor="login-password-confirm">Passwort bestätigen</Label>
              <Input
                id="login-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}
          {error && <p className="text-sm text-status-hoch">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Einen Moment…" : configured ? "Anmelden" : "Passwort festlegen"}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
