import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import logo from "../assets/images/pony-link.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api.api.v1.auth.login.post({ email, password });
    setBusy(false);
    if (res.error) {
      const value = res.error.value as { error?: { message?: string } } | undefined;
      setError(value?.error?.message ?? "Login failed");
      return;
    }
    await refresh();
    navigate("/");
  }

  return (
    <div className="mx-auto mt-24 max-w-sm px-4">
      <section>
        <img src={logo} alt="Pony Link" className="mx-auto mb-6 h-12 h-auto" />
      </section>
      <h1 className="mb-6 text-2xl font-semibold text-center">Log in</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className="rounded border border-gray-300 px-3 py-2" type="email" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="rounded border border-gray-300 px-3 py-2" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-black px-3 py-2 text-white disabled:opacity-50" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
