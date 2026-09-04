import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Field";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <GlassCard className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-white">Dashboard</h1>
        <p className="mb-6 text-sm text-slate-400">Bitte anmelden.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Passwort</Label>
            <Input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Anmelden…" : "Anmelden"}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
