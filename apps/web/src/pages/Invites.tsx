import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

type Invite = {
  id: string; email: string | null; expiresAt: string;
  usedAt: string | null; status: "pending" | "used" | "expired";
  usedBy: { id: string; displayName: string; email: string } | null;
};

export default function Invites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.api.v1.invites.get();
    if (!res.error && res.data) {
      const data = res.data as { invites?: Invite[] };
      if (data.invites) setInvites(data.invites);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await api.api.v1.invites.post({ email: email || undefined, expiresInDays: days });
    if (res.error) {
      const value = res.error.value as { error?: { message?: string } } | undefined;
      setError(value?.error?.message ?? "Could not create invite");
      return;
    }
    if (res.data) {
      const data = res.data as { inviteUrl?: string };
      if (data.inviteUrl) {
        setFreshUrl(data.inviteUrl);
        setEmail("");
        await load();
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <form onSubmit={create} className="mb-4 flex flex-col gap-2 rounded border border-gray-200 p-4">
        <h2 className="font-semibold">New invite</h2>
        <div className="flex gap-2">
          <input className="flex-1 rounded border border-gray-300 px-3 py-2" type="email"
            placeholder="Lock to email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            Expires in
            <input className="w-16 rounded border border-gray-300 px-2 py-2" type="number" min={1} max={90}
              value={days} onChange={(e) => setDays(Number(e.target.value))} />
            days
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="self-start rounded bg-black px-4 py-2 text-white">Create invite</button>
      </form>

      {freshUrl && (
        <div className="mb-8 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="mb-2 font-semibold">Copy this now — it won't be shown again:</p>
          <div className="flex gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1">{freshUrl}</code>
            <button className="rounded border border-gray-300 px-2 py-1"
              onClick={() => void navigator.clipboard.writeText(freshUrl)}>Copy</button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {invites.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-3 text-sm">
            <span className="flex-1">{i.email ?? "(anyone)"}</span>
            <span className={
              i.status === "pending" ? "text-emerald-600" : i.status === "used" ? "text-gray-500" : "text-red-500"
            }>{i.status}</span>
            {i.usedBy && i.usedAt && (
              <span className="text-gray-500">
                by {i.usedBy.displayName} ({i.usedBy.email}) on {new Date(i.usedAt).toLocaleDateString()}
              </span>
            )}
            {i.status !== "used" && (
              <span className="text-gray-400">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
            )}
            {i.status === "pending" && (
              <button className="rounded border border-gray-300 px-2 py-1"
                onClick={() => void api.api.v1.invites({ id: i.id }).delete().then(load)}>Revoke</button>
            )}
          </li>
        ))}
        {invites.length === 0 && <li className="py-6 text-gray-500">No invites yet.</li>}
      </ul>
    </div>
  );
}
