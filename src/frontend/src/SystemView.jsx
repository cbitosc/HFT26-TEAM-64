import { useEffect, useMemo, useRef, useState } from "react";
import { SystemEngine, lookFor, tempOf } from "./space/SystemEngine";
import { starColor } from "./space/core";
import Astro from "./Astro";
import { Dashboard } from "./Gauges";
import { colorFor, fmtLy, fmtNum } from "./utils";

const PANEL_W = 400;

function starClass(teff) {
  if (teff == null) return { name: "Star type unknown", letter: "?" };
  if (teff < 3700) return { name: "Cool red dwarf", letter: "M" };
  if (teff < 5200) return { name: "Orange dwarf", letter: "K" };
  if (teff < 6000) return { name: "Sun-like star", letter: "G" };
  if (teff < 7500) return { name: "Yellow-white star", letter: "F" };
  return { name: "Hot blue-white star", letter: "A" };
}

function shortName(p, hostname) {
  if (p.pl_name.startsWith(hostname)) return p.pl_name.slice(hostname.length).trim() || p.pl_name;
  return p.pl_name;
}

// a small CSS "planet" in the planet's own colours, used in the list and the size comparison
function Ball({ look, size }) {
  const a = `#${look.A.getHexString()}`;
  const b = `#${look.B.getHexString()}`;
  return (
    <div
      className="sx-ball"
      style={{ width: size, height: size, background: `radial-gradient(circle at 34% 30%, ${a}, ${b} 62%, #0a0a12 100%)` }}
    />
  );
}

function SizeCompare({ p, look }) {
  if (p.pl_rade == null) return null;
  const earth = 18;
  const d = Math.min(110, Math.max(5, earth * p.pl_rade));
  return (
    <div className="sx-size">
      <figure>
        <div className="sx-ball" style={{ width: earth, height: earth, background: "radial-gradient(circle at 34% 30%, #7fb0ff, #2a5aa8 62%, #0a0a12)" }} />
        <figcaption>Earth</figcaption>
      </figure>
      <figure>
        <Ball look={look} size={d} />
        <figcaption>{p.pl_rade.toFixed(2)}× Earth's size</figcaption>
      </figure>
    </div>
  );
}

export default function SystemView({ api, hostname, initialPlanet, onBack, onShowPlanet }) {
  const [planets, setPlanets] = useState([]);
  const [picked, setPicked] = useState(initialPlanet ?? null);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("Loading system…");
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const engineRef = useRef(null);

  // load this star's planets
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ q: hostname, limit: "50" });
        const res = await fetch(`${api}/planets?${params}`);
        const data = await res.json();
        const list = (Array.isArray(data) ? data : [])
          .filter((p) => p.hostname === hostname)
          .sort((a, b) => (a.pl_orbper ?? 1e9) - (b.pl_orbper ?? 1e9));
        setPlanets(list);
        setStatus(list.length ? "" : "No planets found for this star");
      } catch {
        setStatus("Backend not reachable");
      }
    })();
  }, [api, hostname]);

  // 3D engine
  useEffect(() => {
    const e = new SystemEngine(canvasRef.current, wrapRef.current, {
      onSelect: (p) => setPicked(p),
      onContextLost: () => setStatus("3D view unavailable on this device"),
    });
    e.setInsetRight(PANEL_W + 24);
    engineRef.current = e;
    if (new URLSearchParams(location.search).has("debug")) (window.__solice ??= {}).system = e; // for testing
    return () => e.dispose();
  }, []);

  useEffect(() => {
    if (planets.length) engineRef.current?.setSystem(hostname, planets);
    // focus the planet we arrived from once the system is built
    if (planets.length && picked) engineRef.current?.setFocus(picked.pl_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planets, hostname]);

  useEffect(() => {
    engineRef.current?.setFocus(picked?.pl_name ?? null);
  }, [picked]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !/input|textarea/i.test(e.target.tagName)) picked ? setPicked(null) : onBack();
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        setPaused((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, onBack]);

  const looks = useMemo(() => Object.fromEntries(planets.map((p) => [p.pl_name, lookFor(p)])), [planets]);
  const first = planets[0];
  const teff = first?.st_teff;
  const sc = starClass(teff);
  const sCol = `#${starColor(teff ?? 5200).getHexString()}`;
  const hzCount = planets.filter((p) => p.hz_status === "In habitable zone").length;
  const pickedFull = picked ? planets.find((p) => p.pl_name === picked.pl_name) ?? picked : null;
  const look = pickedFull ? looks[pickedFull.pl_name] ?? lookFor(pickedFull) : null;

  const astroContext = pickedFull
    ? { kind: "planet", names: [pickedFull.pl_name], label: pickedFull.pl_name }
    : { kind: "system", names: planets.map((p) => p.pl_name), label: hostname };
  function showPlanet(name) {
    const p = planets.find((x) => x.pl_name === name);
    if (p) setPicked(p);
    else onShowPlanet?.(name); // a planet in another system: go back to the star map and fly there
  }

  return (
    <div className="sx-sys">
      <div ref={wrapRef} className="sx-stage">
        <canvas ref={canvasRef} className="sx-canvas" />
      </div>

      <div className="sx-sys-head">
        <button type="button" className="sx-back" onClick={onBack}>
          ← Star map
        </button>
        <h1 className="sx-sys-title">{hostname}</h1>
        <div className="sx-sys-sub">
          {status ||
            `${sc.name} · ${planets.length} known planet${planets.length === 1 ? "" : "s"} · ${fmtLy(first?.sy_dist)} away`}
        </div>
      </div>

      <div className="sx-sys-controls">
        <button type="button" className="sx-back" onClick={() => setPaused((v) => !v)}>
          {paused ? "▶  Play orbits" : "❚❚  Pause orbits"}
        </button>
        <div className="sx-sys-legend sx-glass">
          <b>Green ring</b> = habitable zone, worked out from the star's brightness (0.36–1.1× Earth's starlight).
          <br />
          Distances use a log scale; speeds keep the real ratios between planets. Planet sizes are enlarged.
        </div>
      </div>

      <aside className="sx-panel" style={{ width: PANEL_W }}>
        {pickedFull ? (
          <>
            <div className="sx-panel-head">
              <div>
                <span className="sx-eyebrow">{hostname}</span>
                <h2>{pickedFull.pl_name}</h2>
                <div className="sx-panel-sub">{look.label}</div>
              </div>
              <button type="button" className="sx-close" onClick={() => setPicked(null)} title="Back to the whole system">
                ×
              </button>
            </div>
            <div className="sx-chips">
              <span className="sx-chip">{pickedFull.type}</span>
              <span
                className="sx-chip"
                style={{ color: colorFor(pickedFull.hz_status), borderColor: `${colorFor(pickedFull.hz_status)}55` }}
              >
                <i className="sx-dot" style={{ background: colorFor(pickedFull.hz_status) }} />
                {pickedFull.hz_status}
              </span>
            </div>

            <div className="sx-section">
              <span className="sx-eyebrow">Habitability</span>
              <Dashboard planet={pickedFull} />
            </div>

            <div className="sx-section">
              <span className="sx-eyebrow">Measurements</span>
              <dl className="sx-facts">
                <div className="sx-fact">
                  <dt>Radius</dt>
                  <dd>
                    {fmtNum(pickedFull.pl_rade)}
                    <small>× Earth</small>
                  </dd>
                </div>
                <div className="sx-fact">
                  <dt>Mass</dt>
                  <dd>
                    {fmtNum(pickedFull.pl_bmasse)}
                    <small>{pickedFull.pl_bmasse != null ? "× Earth" : ""}</small>
                  </dd>
                </div>
                <div className="sx-fact">
                  <dt>Year length</dt>
                  <dd>
                    {fmtNum(pickedFull.pl_orbper)}
                    <small>{pickedFull.pl_orbper != null ? "days" : ""}</small>
                  </dd>
                </div>
                <div className="sx-fact">
                  <dt>Distance from star</dt>
                  <dd>
                    {fmtNum(pickedFull.pl_orbsmax)}
                    <small>{pickedFull.pl_orbsmax != null ? "AU" : ""}</small>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="sx-section">
              <span className="sx-eyebrow">Size next to Earth</span>
              <SizeCompare p={pickedFull} look={look} />
              <div className="sx-illus">
                Colours and surface are an illustration based on its size and temperature
                {tempOf(pickedFull) != null ? ` (~${Math.round(tempOf(pickedFull))} K)` : ""}. No exoplanet surface has been
                photographed.
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="sx-star-card">
              <div className="sx-star-swatch" style={{ background: `radial-gradient(circle, #fff 0%, ${sCol} 45%, ${sCol}00 72%)` }} />
              <div>
                <span className="sx-eyebrow">{sc.letter}-type star</span>
                <h2 style={{ margin: "6px 0 2px", fontFamily: "var(--display)", fontWeight: 400, fontSize: 18 }}>{hostname}</h2>
                <div className="sx-panel-sub">{sc.name}</div>
              </div>
            </div>
            <dl className="sx-facts" style={{ marginTop: 16 }}>
              <div className="sx-fact">
                <dt>Surface temperature</dt>
                <dd>
                  {teff != null ? Math.round(teff).toLocaleString() : "n/a"}
                  <small>{teff != null ? "K" : ""}</small>
                </dd>
              </div>
              <div className="sx-fact">
                <dt>Radius</dt>
                <dd>
                  {fmtNum(first?.st_rad)}
                  <small>{first?.st_rad != null ? "× Sun" : ""}</small>
                </dd>
              </div>
              <div className="sx-fact">
                <dt>Planets</dt>
                <dd>{planets.length || "–"}</dd>
              </div>
              <div className="sx-fact">
                <dt>In habitable zone</dt>
                <dd style={{ color: hzCount ? "var(--hz)" : undefined }}>{planets.length ? hzCount : "–"}</dd>
              </div>
            </dl>

            <div className="sx-section">
              <span className="sx-eyebrow">Planets · closest to the star first</span>
              {!planets.length && <div className="sx-loading">{status}</div>}
              <div className="sx-plist">
                {planets.map((p) => {
                  const L = looks[p.pl_name];
                  return (
                    <button key={p.pl_name} type="button" className="sx-prow" onClick={() => setPicked(p)}>
                      <Ball look={L} size={30} />
                      <div>
                        <div className="sx-prow-name">{shortName(p, hostname)}</div>
                        <div className="sx-prow-sub">{L.label}</div>
                      </div>
                      <div className="sx-prow-end">
                        <span style={{ color: colorFor(p.hz_status) }}>● </span>
                        {p.pl_orbper != null ? `${fmtNum(p.pl_orbper)} d` : ""}
                        <br />
                        {p.esi != null ? `ESI ${p.esi.toFixed(2)}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </aside>

      <Astro api={api} context={astroContext} onShow={showPlanet} inset={PANEL_W + 24} />
    </div>
  );
}
