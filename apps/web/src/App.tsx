import { BrowserRouter, Link, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, RequireAuth, useAuth } from "./auth";
import Login from "./pages/Login";
import Links from "./pages/Links";
import LinkDetail from "./pages/LinkDetail";

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <nav className="flex items-center gap-4 border-b border-gray-200 px-6 py-3">
      <Link to="/" className="font-semibold">Shortener</Link>
      {user.role === "admin" && <Link to="/invites" className="text-sm">Invites</Link>}
      <span className="ml-auto text-sm text-gray-500">{user.displayName}</span>
      <button
        className="text-sm text-gray-500 underline"
        onClick={() => void logout().then(() => navigate("/login"))}
      >
        Log out
      </button>
    </nav>
  );
}

// Placeholder pages — replaced in Tasks 17-18.
const Stub = ({ name }: { name: string }) => <p className="p-8">{name} (coming in a later task)</p>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/app">
        <Nav />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Stub name="Register" />} />
          <Route path="/" element={<RequireAuth><Links /></RequireAuth>} />
          <Route path="/links/:id" element={<RequireAuth><LinkDetail /></RequireAuth>} />
          <Route path="/invites" element={<RequireAuth><Stub name="Invites" /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
