import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Login } from "./pages/Login";
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
        path="/mail"
        element={
          <ProtectedRoute>
            <Mail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rechnungen"
        element={
          <ProtectedRoute>
            <Rechnungen />
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
