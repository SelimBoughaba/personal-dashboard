import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AreasProvider } from "./context/AreasContext";
import { Login } from "./pages/Login";
import { Uebersicht } from "./pages/Uebersicht";
import { Tasks } from "./pages/Tasks";
import { Kalender } from "./pages/Kalender";
import { Mail } from "./pages/Mail";
import { Rechnungen } from "./pages/Rechnungen";
import { Einstellungen } from "./pages/Einstellungen";
import { Dokumente } from "./pages/Dokumente";
import { Vertraege } from "./pages/Vertraege";
import { Ziele } from "./pages/Ziele";
import { Notizen } from "./pages/Notizen";
import { Gesundheit } from "./pages/Gesundheit";
import { Onboarding } from "./pages/Onboarding";
import { Layout } from "./components/Layout";

function ProtectedRoute({ children }) {
  const { authed } = useAuth();
  if (!authed) return <Navigate to="/login" replace />;
  return (
    <AreasProvider>
      <Layout>{children}</Layout>
    </AreasProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/einrichtung"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
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
      <Route
        path="/dokumente"
        element={
          <ProtectedRoute>
            <Dokumente />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ziele"
        element={
          <ProtectedRoute>
            <Ziele />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gesundheit"
        element={
          <ProtectedRoute>
            <Gesundheit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notizen"
        element={
          <ProtectedRoute>
            <Notizen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vertraege"
        element={
          <ProtectedRoute>
            <Vertraege />
          </ProtectedRoute>
        }
      />
      <Route
        path="/einstellungen"
        element={
          <ProtectedRoute>
            <Einstellungen />
          </ProtectedRoute>
        }
      />
      {/* Mail ist kein Hauptnavigationspunkt mehr, bleibt aber erreichbar
          (u. a. für den "Wichtige E-Mails"-Widget-Link auf der Übersicht). */}
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
