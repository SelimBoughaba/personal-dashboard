import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Login } from "./pages/Login";
import { Uebersicht } from "./pages/Uebersicht";
import { Tasks } from "./pages/Tasks";
import { Kalender } from "./pages/Kalender";
import { Mail } from "./pages/Mail";
import { Rechnungen } from "./pages/Rechnungen";
import { Layout } from "./components/Layout";

function ProtectedRoute({ children }) {
  const { authed } = useAuth();
  if (!authed) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Uebersicht />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aufgaben"
        element={
          <ProtectedRoute>
            <Tasks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kalender"
        element={
          <ProtectedRoute>
            <Kalender />
          </ProtectedRoute>
        }
      />
      <Route
        path="/finanzen"
        element={
          <ProtectedRoute>
            <Rechnungen />
          </ProtectedRoute>
        }
      />
      {/* Mail ist kein Hauptnavigationspunkt mehr, bleibt aber erreichbar
          (u. a. für den "Wichtige E-Mails"-Widget-Link und bis Mail-
          Einstellungen einen eigenen Bereich bekommen). */}
      <Route
        path="/mail"
        element={
          <ProtectedRoute>
            <Mail />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
