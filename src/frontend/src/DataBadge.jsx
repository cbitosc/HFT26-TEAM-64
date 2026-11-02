import { useEffect, useState } from "react";

// Live link to NASA: shows where the data comes from, how fresh it is, and pulls the latest catalogue on demand.
function ago(iso) {
  if (!iso) return "unknown";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export default function DataBadge({ api, onRefreshed }) {
  const [meta, setMeta] = useState(null);
  const [state, setState] = useState("idle"); // idle | syncing | done | error
  const [note, setNote] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    fetch(`${api}/meta`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMeta(d))
      .catch(() => {});
    const id = setInterval(() => tick((n) => n + 1), 30000); // keep "x min ago" current
    return () => clearInterval(id);
  }, [api]);

  async function refresh() {
    if (state === "syncing") return;
    setState("syncing");
    setNote("");
    try {
      const r = await fetch(`${api}/refresh`, { method: "POST" });
      if (!r.ok) throw new Error((await r.text().catch(() => "")) || `HTTP ${r.status}`);
      const d = await r.json();
      setMeta((m) => ({ ...(m || {}), planets: d.planets, updated_at: d.updated_at, last_added: d.added }));
      setNote(d.added ? `+${d.added} new planet${d.added === 1 ? "" : "s"} since last sync` : "Up to date: no new planets");
      setState("done");
      onRefreshed?.(d);
    } catch {
      setNote("NASA's archive didn't respond. Still showing the last synced data.");
      setState("error");
    }
  }

  const syncing = state === "syncing";
  return (
    <div className={`sx-data${syncing ? " is-syncing" : ""}`}>
      <span className="sx-live" aria-hidden="true" />
      <div className="sx-data-text">
        <a href={meta?.url || "https://exoplanetarchive.ipac.caltech.edu/"} target="_blank" rel="noreferrer">
          NASA Exoplanet Archive
        </a>
        <span>
          {syncing
            ? "Syncing with NASA…"
            : meta
              ? `${meta.planets.toLocaleString()} planets · synced ${ago(meta.updated_at)}`
              : "Connecting…"}
        </span>
        {note && <span className={`sx-data-note${state === "error" ? " is-error" : ""}`}>{note}</span>}
      </div>
      <button type="button" className="sx-data-btn" onClick={refresh} disabled={syncing} title="Pull the latest catalogue from NASA">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </svg>
        {syncing ? "Syncing" : "Sync"}
      </button>
    </div>
  );
}
