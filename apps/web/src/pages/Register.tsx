import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function Register() {
  // Token travels in the fragment so it never reaches server logs (spec §5).
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  if (!token) {
    return <p className="mx-auto mt-24 max-w-sm px-4 text-gray-600">
      Registration needs an invite link. Ask Ton for one.</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await api.api.v1.auth.register.post({ token, email, password, displayName });
    if (res.error) {
      const value = res.error.value as { error?: { message?: string } } | undefined;
      setError(value?.error?.message ?? "Registration failed");
      return;
    }
    await refresh();
    navigate("/");
  }

  return (
    <div className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-semibold">Create your account</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className="rounded border border-gray-300 px-3 py-2" placeholder="Display name"
          value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={80} />
        <input className="rounded border border-gray-300 px-3 py-2" type="email" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="rounded border border-gray-300 px-3 py-2" type="password" placeholder="Password (min 8)"
          value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-black px-3 py-2 text-white">Register</button>
      </form>
    </div>
  );
}
