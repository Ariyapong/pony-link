import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

type Range = "7d" | "30d" | "all";
type Stats = {
  total: number;
  byDay: { day: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byDevice: { deviceType: string; count: number }[];
};

export default function LinkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shortUrl, setShortUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [range, setRange] = useState<Range>("30d");
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await api.api.v1.links({ id }).get();
    if (!data || !("link" in data)) return;
    setShortUrl(data.link.shortUrl);
    setSlug(data.link.slug);
    setTargetUrl(data.link.targetUrl);
    setTitle(data.link.title ?? "");
    setIsActive(data.link.isActive);
  }, [id]);

  const loadStats = useCallback(async () => {
    if (!id) return;
    const { data } = await api.api.v1.links({ id }).stats.get({ query: { range } });
    if (data) setStats(data as Stats);
  }, [id, range]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadStats(); }, [loadStats]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setMsg(null);
    const res = await api.api.v1.links({ id }).patch({ targetUrl, title: title || null, isActive });
    if (res.error) {
      const value = res.error.value as { error?: { message?: string } } | undefined;
      setMsg(value?.error?.message ?? "Save failed");
      return;
    }
    setMsg("Saved.");
  }

  async function remove() {
    if (!id || !confirm(`Delete /${slug}? The short URL will stop working.`)) return;
    await api.api.v1.links({ id }).delete();
    navigate("/");
  }

  const maxDay = Math.max(1, ...(stats?.byDay.map((d) => d.count) ?? [1]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="mb-4 font-mono text-lg">{shortUrl}</p>
      <form onSubmit={save} className="mb-8 flex flex-col gap-2 rounded border border-gray-200 p-4">
        <label className="text-sm">Target URL
          <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} required />
        </label>
        <label className="text-sm">Title
          <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (unchecked = visitors get a 404)
        </label>
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
        <div className="flex gap-2">
          <button className="rounded bg-black px-4 py-2 text-white">Save</button>
          <button type="button" onClick={() => void remove()}
            className="rounded border border-red-300 px-4 py-2 text-red-600">Delete</button>
        </div>
      </form>

      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-semibold">Stats</h2>
        {(["7d", "30d", "all"] as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)}
            className={`rounded px-2 py-1 text-sm ${range === r ? "bg-black text-white" : "border border-gray-300"}`}>
            {r}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500">{stats?.total ?? 0} clicks</span>
      </div>

      {stats && (
        <div className="grid gap-6">
          <div className="flex items-end gap-1" style={{ height: 96 }}>
            {stats.byDay.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.count}`} className="flex-1 bg-gray-800"
                style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: 2 }} />
            ))}
            {stats.byDay.length === 0 && <p className="text-sm text-gray-500">No clicks in this range.</p>}
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {([["Referrers", stats.topReferrers.map((r) => [r.referrer, r.count])],
               ["Countries", stats.byCountry.map((c) => [c.country, c.count])],
               ["Devices", stats.byDevice.map((d) => [d.deviceType, d.count])]] as const
            ).map(([label, rows]) => (
              <div key={label}>
                <h3 className="mb-1 text-sm font-semibold">{label}</h3>
                <ul className="text-sm text-gray-600">
                  {rows.map(([k, v]) => (
                    <li key={String(k)} className="flex justify-between gap-2">
                      <span className="truncate">{k}</span><span>{v}</span>
                    </li>
                  ))}
                  {rows.length === 0 && <li className="text-gray-400">—</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
