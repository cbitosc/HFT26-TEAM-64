import { useEffect, useRef, useState } from "react";
import { EsiRing } from "./Gauges";
import { colorFor } from "./utils";
import { AstroAvatar } from "./Astro";

const ROWS = [
  { key: "pl_rade", label: "Radius", unit: "× Earth", earth: 1, mode: "ratio" },
  { key: "pl_bmasse", label: "Mass", unit: "× Earth", earth: 1, mode: "ratio" },
  { key: "pl_orbper", label: "Year length", unit: "days" },
  { key: "pl_orbsmax", label: "Orbit distance", unit: "AU" },
  { key: "flux", label: "Starlight received", unit: "× Earth", earth: 1, mode: "ratio" },
  { key: "pl_eqt", label: "Equilibrium temp", unit: "K", earth: 255, mode: "diff" },
  { key: "sy_dist", label: "Distance from Earth", unit: "light-years", ly: true },
  { key: "esi", label: "Earth Similarity (ESI)", unit: "", earth: 1, mode: "diff" },
];

const A_COLOR = "#b6a8ff";
const B_COLOR = "#8fd8e8";

const valueOf = (p, row) => (row.ly ? (p.sy_dist != null ? p.sy_dist * 3.2616 : null) : p[row.key]);

const fmt = (v) =>
  v == null ? "n/a" : v >= 100 ? Math.round(v).toLocaleString() : Number(v.toPrecision(3)).toString();

// which planet is closer to Earth for this row ("a", "b", or null)
function closer(a, b, row) {
  if (!row.earth || a == null || b == null) return null;
  if (row.mode === "ratio" && (a <= 0 || b <= 0)) return null;
  const d = (x) => (row.mode === "ratio" ? Math.abs(Math.log(x / row.earth)) : Math.abs(x - row.earth));
  const da = d(a);
  const db = d(b);
  if (Math.abs(da - db) < 1e-9) return null;
  return da < db ? "a" : "b";
}

function Picker({ api, label, value, onChange, accent }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url = q.trim()
          ? `${api}/planets?q=${encodeURIComponent(q.trim())}&limit=8`
          : `${api}/featured?n=8`;
        const r = await fetch(url, { signal: ctrl.signal });
        const d = await r.json();
        setResults(Array.isArray(d) ? d : []);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, api]);

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}66`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, color: accent, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, minHeight: 24, marginBottom: 8 }}>{value || "Choose a planet"}</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a planet or star…" />
      <div style={{ fontSize: 11, color: "#67708e", margin: "8px 0 4px" }}>
        {q.trim() ? "Search results" : "Most Earth-like known worlds"}
      </div>
      <div style={{ maxHeight: 170, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {results.map((p) => (
          <button
            key={p.pl_name}
            type="button"
            onClick={() => onChange(p.pl_name)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              padding: "7px 10px",
              fontSize: 13,
              fontWeight: 500,
              textAlign: "left",
              background: p.pl_name === value ? `${accent}33` : "rgba(255,255,255,0.04)",
              border: `1px solid ${p.pl_name === value ? accent : "rgba(196,206,255,0.12)"}`,
            }}
          >
            <span>{p.pl_name}</span>
            <span style={{ color: "#959db8", whiteSpace: "nowrap" }}>
              {p.type}
              {p.esi != null ? ` · ESI ${p.esi.toFixed(2)}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Cell({ value, max, color, win }) {
  const w = value != null && max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 14, color: win ? "#8af0c4" : "#e9ecf6" }}>
        {fmt(value)}
        {win && (
          <span title="Closer to Earth" style={{ marginLeft: 6, fontSize: 10 }}>
            ●
          </span>
        )}
      </div>
      <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.04)", marginTop: 5 }}>
        <div style={{ width: `${w}%`, height: "100%", borderRadius: 999, background: color, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

function Head({ p, color }) {
  const hz = colorFor(p.hz_status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <EsiRing esi={p.esi} size={64} />
      <div>
        <div style={{ fontWeight: 800, fontSize: 17, color }}>{p.pl_name}</div>
        <div style={{ fontSize: 12, color: "#959db8" }}>
          {p.type} · {p.hostname}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: hz }}>{p.hz_status}</span>
      </div>
    </div>
  );
}

export default function CompareView({ api, initialA, onClose }) {
  const [a, setA] = useState(initialA || null);
  const [b, setB] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    abortRef.current?.abort();
    setText("");
    setBusy(false);
    setData(null);
    setErr("");
    if (!a || !b) return;
    if (a === b) {
      setErr("Pick two different planets.");
      return;
    }
    const ctrl = new AbortController();
    fetch(`${api}/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => e.name !== "AbortError" && setErr(e.message));
    return () => ctrl.abort();
  }, [a, b, api]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ask() {
    if (!a || !b || busy) return;
    setText("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`${api}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Compare ${a} and ${b} in exactly four short sentences: size, starlight received, temperature, and which is closer to Earth by ESI. Use only the facts.`,
          planets: [a, b],
          history: [],
          mode: "free",
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setText(acc);
      }
    } catch (e) {
      if (e.name !== "AbortError") setText(`Sorry, I couldn't reach the AI model. (${e.message})`);
    }
    setBusy(false);
  }

  const notes = [];
  if (data) {
    for (const p of [data.a, data.b]) {
      if (p.esi != null && p.esi_factors < 4) notes.push(`${p.pl_name}'s ESI uses only ${p.esi_factors} of 4 factors (mass is not measured).`);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(3, 4, 10, 0.78)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        overflowY: "auto",
        padding: 24,
        animation: "panel-in 0.25s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: 22,
          borderRadius: 18,
          background: "rgba(11,13,26,0.94)",
          border: "1px solid rgba(196,206,255,0.16)",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontFamily: "var(--display)", letterSpacing: "0.06em" }}>Compare worlds</div>
            <div style={{ fontSize: 13, color: "#959db8" }}>Pick two planets to see how they differ from each other and from Earth.</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "rgba(196,206,255,0.16)" }}>
            Close ✕
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Picker api={api} label="PLANET A" value={a} onChange={setA} accent={A_COLOR} />
          <Picker api={api} label="PLANET B" value={b} onChange={setB} accent={B_COLOR} />
        </div>

        {err && <div style={{ marginTop: 14, color: "#fca5a5" }}>{err}</div>}

        {data && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 14, marginTop: 22, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#959db8" }}>● = closer to Earth</div>
              <Head p={data.a} color={A_COLOR} />
              <Head p={data.b} color={B_COLOR} />
            </div>

            <div style={{ marginTop: 10 }}>
              {ROWS.map((row) => {
                const va = valueOf(data.a, row);
                const vb = valueOf(data.b, row);
                const max = Math.max(va ?? 0, vb ?? 0);
                const win = closer(va, vb, row);
                return (
                  <div
                    key={row.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.2fr 1fr 1fr",
                      gap: 14,
                      padding: "9px 0",
                      borderTop: "1px solid rgba(196,206,255,0.1)",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ color: "#959db8", fontSize: 13 }}>
                      {row.label} <span style={{ color: "#67708e" }}>{row.unit}</span>
                    </div>
                    <Cell value={va} max={max} color={A_COLOR} win={win === "a"} />
                    <Cell value={vb} max={max} color={B_COLOR} win={win === "b"} />
                  </div>
                );
              })}
            </div>

            {data.more_earthlike && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, background: "rgba(138,240,196,0.06)", border: "1px solid rgba(138,240,196,0.3)", fontSize: 14 }}>
                By Earth Similarity Index, <strong>{data.more_earthlike}</strong> is the more Earth-like of the two.
              </div>
            )}
            {notes.map((n) => (
              <div key={n} style={{ marginTop: 6, fontSize: 12, color: "#67708e" }}>
                {n}
              </div>
            ))}

            <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(196,206,255,0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <AstroAvatar size={30} busy={busy} />
                <strong>Astro's take</strong>
                <button type="button" onClick={ask} disabled={busy} style={{ marginLeft: "auto", opacity: busy ? 0.6 : 1 }}>
                  {busy ? "Thinking…" : text ? "Ask again" : "Explain the differences"}
                </button>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "#e9ecf6", whiteSpace: "pre-wrap", minHeight: 20 }}>
                {text || <span style={{ color: "#67708e" }}>Astro will compare the two using only NASA's data.</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}