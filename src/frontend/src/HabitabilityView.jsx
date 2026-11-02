import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum } from "./utils";

// Catalogue-wide habitability dashboard. Everything is computed from the same /planets data the map uses.
// Chart colours: validated, colour-blind-safe steps of our three status hues (aqua / orange / blue),
// plus a muted gray for "unknown". Every colour also has a text label, so nothing relies on colour alone.
const SERIES = [
  { key: "In habitable zone", label: "Habitable zone", col: "#199e70" },
  { key: "Too hot", label: "Too hot", col: "#d95926" },
  { key: "Too cold", label: "Too cold", col: "#3987e5" },
  { key: "Unknown", label: "Unknown", col: "#5d6275" },
];
const colOf = Object.fromEntries(SERIES.map((s) => [s.key, s.col]));
const LY = 3.2616;

function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, html) => setTip({ x: e.clientX, y: e.clientY, html });
  const hide = () => setTip(null);
  const el = tip ? (
    <div className="hb-tip" style={{ transform: `translate(${tip.x + 14}px, ${tip.y + 12}px)` }} dangerouslySetInnerHTML={{ __html: tip.html }} />
  ) : null;
  return { show, hide, el };
}

function Legend({ items = SERIES }) {
  return (
    <div className="hb-legend">
      {items.map((s) => (
        <span key={s.key}>
          <i style={{ background: s.col }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ the habitability map (canvas scatter) ------------------------------ */

function HabitabilityMap({ planets, onShow, tip }) {
  const ref = useRef(null);
  const pts = useRef([]);
  const W = 760;
  const H = 360;
  const pad = { l: 52, r: 14, t: 14, b: 40 };
  const X0 = Math.log10(0.01);
  const X1 = Math.log10(30000);
  const Y0 = Math.log10(0.3);
  const Y1 = Math.log10(30);
  const sx = (f) => pad.l + ((Math.log10(f) - X0) / (X1 - X0)) * (W - pad.l - pad.r);
  const sy = (r) => pad.t + (1 - (Math.log10(r) - Y0) / (Y1 - Y0)) * (H - pad.t - pad.b);

  useEffect(() => {
    const cv = ref.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    // habitable zone band
    g.fillStyle = "rgba(25, 158, 112, 0.14)";
    g.fillRect(sx(0.36), pad.t, sx(1.1) - sx(0.36), H - pad.t - pad.b);
    // grid
    g.strokeStyle = "rgba(196, 206, 255, 0.08)";
    g.lineWidth = 1;
    g.font = "11px Inter, system-ui, sans-serif";
    g.fillStyle = "#8a92ad";
    [0.01, 0.1, 1, 10, 100, 1000, 10000].forEach((f) => {
      const x = Math.round(sx(f)) + 0.5;
      g.beginPath();
      g.moveTo(x, pad.t);
      g.lineTo(x, H - pad.b);
      g.stroke();
      g.textAlign = "center";
      g.fillText(f >= 1 ? `${f.toLocaleString()}×` : `${f}×`, x, H - pad.b + 16);
    });
    [0.5, 1, 2, 5, 10, 20].forEach((r) => {
      const y = Math.round(sy(r)) + 0.5;
      g.beginPath();
      g.moveTo(pad.l, y);
      g.lineTo(W - pad.r, y);
      g.stroke();
      g.textAlign = "right";
      g.fillText(`${r}×`, pad.l - 8, y + 4);
    });
    // points: draw hot / cold first, habitable-zone planets on top
    const list = [];
    planets.forEach((p) => {
      if (p.flux == null || p.pl_rade == null || p.flux <= 0) return;
      const x = sx(Math.min(29000, Math.max(0.011, p.flux)));
      const y = sy(Math.min(29, Math.max(0.31, p.pl_rade)));
      list.push({ p, x, y });
    });
    const order = ["Too hot", "Too cold", "Unknown", "In habitable zone"];
    order.forEach((k) => {
      g.fillStyle = colOf[k];
      g.globalAlpha = k === "In habitable zone" ? 0.95 : 0.55;
      list.forEach(({ p, x, y }) => {
        if (p.hz_status !== k) return;
        g.beginPath();
        g.arc(x, y, k === "In habitable zone" ? 3.2 : 2.2, 0, Math.PI * 2);
        g.fill();
      });
    });
    g.globalAlpha = 1;
    // Earth, for reference
    const ex = sx(1);
    const ey = sy(1);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(ex, ey, 6, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#e9ecf6";
    g.textAlign = "left";
    g.font = "600 11px Inter, system-ui, sans-serif";
    g.fillText("Earth", ex + 10, ey - 8);
    g.font = "10px Michroma, Inter, sans-serif";
    g.fillStyle = "#7fd9b5";
    g.textAlign = "center";
    g.fillText("HABITABLE ZONE", (sx(0.36) + sx(1.1)) / 2, pad.t + 14);
    pts.current = list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planets]);

  function nearest(e) {
    const r = ref.current.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    const my = ((e.clientY - r.top) / r.height) * H;
    let best = null;
    let bd = 64;
    for (const q of pts.current) {
      const d = (q.x - mx) ** 2 + (q.y - my) ** 2 * 1;
      const dd = q.p.hz_status === "In habitable zone" ? d * 0.6 : d;
      if (dd < bd) {
        bd = dd;
        best = q.p;
      }
    }
    return best;
  }

  return (
    <canvas
      ref={ref}
      className="hb-canvas"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label="Scatter plot of starlight received against planet radius, with the habitable zone shaded"
      onMouseMove={(e) => {
        const p = nearest(e);
        e.currentTarget.style.cursor = p ? "pointer" : "";
        if (!p) return tip.hide();
        tip.show(
          e,
          `<b>${p.pl_name}</b><span><i style="background:${colOf[p.hz_status] || "#5d6275"}"></i>${p.hz_status}</span>` +
            `<span>Starlight ${fmtNum(p.flux)}× Earth · radius ${fmtNum(p.pl_rade)}× Earth</span>` +
            `<span>${p.esi != null ? `ESI ${p.esi.toFixed(2)} · ` : ""}${p.sy_dist != null ? `${Math.round(p.sy_dist * LY).toLocaleString()} ly` : ""}</span><em>Click to show it on the map</em>`
        );
      }}
      onMouseLeave={tip.hide}
      onClick={(e) => {
        const p = nearest(e);
        if (p) onShow(p.pl_name);
      }}
    />
  );
}

/* ------------------------------------------- the view ------------------------------------------- */

export default function HabitabilityView({ api, onClose, onShow }) {
  const [planets, setPlanets] = useState(null);
  const [err, setErr] = useState("");
  const tip = useTip();

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${api}/planets?limit=10000`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setPlanets(Array.isArray(d) ? d : []))
      .catch((e) => e.name !== "AbortError" && setErr("Backend not reachable"));
    return () => ctrl.abort();
  }, [api]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const S = useMemo(() => {
    if (!planets) return null;
    const n = planets.length;
    const hz = planets.filter((p) => p.hz_status === "In habitable zone");
    const high = planets.filter((p) => p.esi != null && p.esi >= 0.8);
    const nearestHz = hz.filter((p) => p.sy_dist != null).sort((a, b) => a.sy_dist - b.sy_dist)[0];

    const top = planets
      .filter((p) => p.esi != null && p.esi_factors === 4)
      .sort((a, b) => b.esi - a.esi)
      .slice(0, 10);

    return { n, hz, high, nearestHz, top };
  }, [planets]);

  return (
    <div className="hb" onClick={onClose}>
      <div className="hb-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="hb-head">
          <div>
            <span className="sx-eyebrow">NASA Exoplanet Archive · computed on our server</span>
            <h1>Habitability</h1>
            <p>How the known worlds compare with Earth. Click any planet to fly to it.</p>
          </div>
          <button type="button" className="sx-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {!S && <div className="sx-loading">{err || "Loading the catalogue…"}</div>}

        {S && (
          <>
            <section className="hb-kpis">
              <div className="hb-kpi">
                <span>Confirmed planets</span>
                <b>{S.n.toLocaleString()}</b>
                <small>with a measured size and distance</small>
              </div>
              <div className="hb-kpi">
                <span>In a habitable zone</span>
                <b>{S.hz.length.toLocaleString()}</b>
                <small>{((S.hz.length / S.n) * 100).toFixed(1)}% receive 0.36–1.1× Earth's starlight</small>
              </div>
              <div className="hb-kpi">
                <span>High Earth similarity</span>
                <b>{S.high.length.toLocaleString()}</b>
                <small>ESI of 0.8 or more</small>
              </div>
              <button type="button" className="hb-kpi is-link" onClick={() => S.nearestHz && onShow(S.nearestHz.pl_name)}>
                <span>Nearest habitable-zone world</span>
                <b>{S.nearestHz?.pl_name ?? "–"}</b>
                <small>{S.nearestHz ? `${(S.nearestHz.sy_dist * LY).toFixed(1)} light-years · show on map →` : ""}</small>
              </button>
            </section>

            <section className="hb-card hb-wide">
              <div className="hb-card-head">
                <div>
                  <h2>Where planets sit: starlight vs size</h2>
                  <p>Each dot is a planet. Earth-like worlds sit near the white ring, inside the green band.</p>
                </div>
                <Legend items={SERIES.slice(0, 3)} />
              </div>
              <HabitabilityMap planets={planets} onShow={onShow} tip={tip} />
              <div className="hb-axis-names">
                <span>Starlight received, × Earth (log scale) →</span>
                <span>↑ Radius, × Earth (log scale)</span>
              </div>
            </section>

              <section className="hb-card">
                <div className="hb-card-head">
                  <div>
                    <h2>Most Earth-like worlds</h2>
                    <p>Highest Earth Similarity Index (ESI).</p>
                  </div>
                </div>
                <ol className="hb-top">
                  {S.top.map((p, i) => (
                    <li key={p.pl_name}>
                      <button type="button" onClick={() => onShow(p.pl_name)}>
                        <span className="hb-rank">{i + 1}</span>
                        <span className="hb-name">
                          {p.pl_name}
                          <small>
                            {p.type} · {p.sy_dist != null ? `${Math.round(p.sy_dist * LY).toLocaleString()} ly` : "distance unknown"}
                          </small>
                        </span>
                        <span className="hb-esi">
                          <span className="hb-esi-bar">
                            <i style={{ width: `${p.esi * 100}%` }} />
                          </span>
                          {p.esi.toFixed(2)}
                        </span>
                        <span className="hb-status">
                          <i style={{ background: colOf[p.hz_status] || "#5d6275" }} />
                          {p.hz_status === "In habitable zone" ? "HZ" : p.hz_status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            <p className="hb-foot">
              ESI compares a planet's size, density and temperature with Earth's (1.0 = identical). Habitable zone = getting
              0.36–1.1× Earth's starlight. Neither means life exists.
            </p>
          </>
        )}
      </div>
      {tip.el}
    </div>
  );
}
