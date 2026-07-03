import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type LinkItem = {
  id: string; slug: string; shortUrl: string; targetUrl: string;
  title: string | null; isActive: boolean; clickCount: number;
};

export default function Links() {
  const [items, setItems] = useState<LinkItem[]>([]);
  const [query, setQuery] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.api.v1.links.get({ query: { query: query || undefined, limit: 50 } });
    if (data && "links" in data) setItems(data.links as LinkItem[]);
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await api.api.v1.links.post({
      targetUrl,
      slug: slug || undefined,
      title: title || undefined,
    });
    if (res.error) {
      const value = res.error.value as { error?: { message?: string } } | undefined;
      setError(value?.error?.message ?? "Could not create link");
      return;
    }
    setTargetUrl(""); setSlug(""); setTitle("");
    await load();
  }

  async function copy(shortUrl: string) {
    await navigator.clipboard.writeText(shortUrl);
    setCopied(shortUrl);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <form onSubmit={create} className="mb-8 flex flex-col gap-2 rounded border border-gray-200 p-4">
        <h2 className="font-semibold">New link</h2>
        <input className="rounded border border-gray-300 px-3 py-2" placeholder="https://long-url.example/…"
          value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} required />
        <div className="flex gap-2">
          <input className="flex-1 rounded border border-gray-300 px-3 py-2" placeholder="custom-slug (optional)"
            value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input className="flex-1 rounded border border-gray-300 px-3 py-2" placeholder="Title (optional)"
            value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="self-start rounded bg-black px-4 py-2 text-white">Shorten</button>
      </form>

      <input className="mb-4 w-full rounded border border-gray-300 px-3 py-2" placeholder="Search slug or title…"
        value={query} onChange={(e) => setQuery(e.target.value)} />

      <ul className="divide-y divide-gray-100">
        {items.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <Link to={`/links/${l.id}`} className="font-mono font-medium">
                /{l.slug} {!l.isActive && <span className="text-xs text-red-500">(disabled)</span>}
              </Link>
              <p className="truncate text-sm text-gray-500">{l.title ?? l.targetUrl}</p>
            </div>
            <span className="text-sm text-gray-500">{l.clickCount} clicks</span>
            <button className="rounded border border-gray-300 px-2 py-1 text-sm" onClick={() => void copy(l.shortUrl)}>
              {copied === l.shortUrl ? "Copied!" : "Copy"}
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="py-6 text-gray-500">No links yet.</li>}
      </ul>
    </div>
  );
}
