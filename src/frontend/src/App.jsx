import { useEffect, useMemo, useRef, useState } from "react";
import SystemView from "./SystemView";
import CompareView from "./CompareView";
import Intro from "./Intro";
import Panel from "./Panel";
import StarMapView from "./StarMapView";
import Wordmark from "./Wordmark";
import Astro from "./Astro";
import DataBadge from "./DataBadge";
import HabitabilityView from "./HabitabilityView";
import { API, colorFor } from "./utils";
import "./App.css";

const LEGEND = [
  ["In habitable zone", "Habitable zone"],
  ["Too hot", "Too hot"],
  ["Too cold", "Too cold"],
  ["Unknown", "Unknown"],
];

export default function App() {
  // playing -> leaving -> done. Add ?nointro to the URL to skip straight to the explorer while developing.
  const [intro, setIntro] = useState(() => (new URLSearchParams(location.search).has("nointro") ? "done" : "playing"));
  const [planets, setPlanets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [habitableOnly, setHabitableOnly] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [systemPlanet, setSystemPlanet] = useState(null);
  const [mode, setMode] = useState("sky"); // "sky" | "map"
  const [compare, setCompare] = useState(null); // null | { a: planetName | null }
  const [habitability, setHabitability] = useState(false);
  const [diving, setDiving] = useState(false);
  const [dataVersion, setDataVersion] = useState(0); // bumps after a NASA sync, so the map reloads
  const mapRef = useRef(null);
  const tipRef = useRef(null);
  const viewRef = useRef(null); // remembers where you were looking when you come back from a system

  const siblings = useMemo(() => {
    if (!selected) return [];
    return planets
      .filter((p) => p.hostname === selected.hostname)
      .sort((a, b) => (a.pl_orbper ?? Infinity) - (b.pl_orbper ?? Infinity));
  }, [planets, selected]);

  const hzCount = useMemo(() => planets.filter((p) => p.hz_status === "In habitable zone").length, [planets]);

  // tooltip is updated directly on the DOM so mouse movement never re-renders the app
  function handleHover(p, ev) {
    const el = tipRef.current;
    if (!el) return;
    if (!p || !ev) {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = "1";
    el.style.transform = `translate(${ev.clientX + 16}px, ${ev.clientY + 14}px)`;
    el.innerHTML = `<b>${p.pl_name}</b><span style="color:${colorFor(p.hz_status)}">●</span> ${p.type} · ${p.hz_status}`;
  }

  function goToKepler() {
    if (mode !== "sky") setMode("sky");
    setTimeout(() => mapRef.current?.lookAtRaDec(290.7, 44.5, 16), mode === "sky" ? 0 : 2500);
  }

  // Astro mentioned a planet and you clicked it: select it and fly there (from any view)
  async function showPlanet(name) {
    let p = planets.find((x) => x.pl_name === name);
    if (!p) {
      try {
        const r = await fetch(`${API}/planets/${encodeURIComponent(name)}`);
        if (r.ok) p = await r.json();
      } catch {
        /* ignore */
      }
    }
    if (!p) return;
    setSystemPlanet(null);
    setSelected(p);
    setTimeout(() => mapRef.current?.flyTo(p, 25), 60);
  }

  function viewSystem(p) {
    if (diving) return;
    setDiving(true);
    viewRef.current = mapRef.current?.getView() ?? viewRef.current;
    mapRef.current?.dive(p, () => {
      setSystemPlanet(p);
      setDiving(false);
    });
  }

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ limit: "10000" });
      if (q.trim()) params.set("q", q.trim());
      if (habitableOnly) params.set("habitable", "true");
      try {
        const res = await fetch(`${API}/planets?${params}`, { signal: ctrl.signal });
        const data = await res.json();
        const list = (Array.isArray(data) ? data : []).filter((p) => p.ra != null && p.dec != null);
        setPlanets(list);
        if (q.trim() && list.length) mapRef.current?.flyTo(list[0], 25);
        setStatus(`${list.length.toLocaleString()} worlds`);
      } catch (err) {
        if (err.name !== "AbortError") setStatus("Backend not reachable");
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, habitableOnly, dataVersion]);

  // While the intro plays, only the intro is on screen (one 3D scene at a time keeps it smooth).
  // The explorer mounts underneath as the intro's exit flight fades out.
  // The intro always sits in the same slot of this fragment: if it moved, React would remount it and replay it.
  const introEl =
    intro !== "done" ? <Intro key="intro" onLeaving={() => setIntro("leaving")} onDone={() => setIntro("done")} /> : null;
  return (
    <>
      {introEl}
      {intro !== "playing" && renderExplorer()}
    </>
  );

  function renderExplorer() {
  if (systemPlanet) {
    return (
      <SystemView
        api={API}
        hostname={systemPlanet.hostname}
        initialPlanet={systemPlanet}
        onBack={() => setSystemPlanet(null)}
        onShowPlanet={showPlanet}
      />
    );
  }

  const sky = mode === "sky";

  return (
    <div className={`sx-app${diving ? " is-diving" : ""}`}>

      <StarMapView
        ref={mapRef}
        planets={planets}
        selected={selected}
        mode={mode}
        initialView={viewRef.current}
        onSelect={setSelected}
        onHover={handleHover}
      />

      {/* top bar */}
      <header className="sx-top">
        <div className="sx-brand">
          <Wordmark on width="118px" />
          <span>Exoplanet Explorer</span>
        </div>

        <div className="sx-tools">
          <label className="sx-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
            <input type="text" placeholder="Search a planet or star" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button type="button" className="sx-clear" onClick={() => setQ("")} aria-label="Clear search">
                ×
              </button>
            )}
          </label>
          <div className="sx-seg" role="group" aria-label="Filter">
            <button type="button" className={!habitableOnly ? "is-on" : ""} onClick={() => setHabitableOnly(false)}>
              All worlds
            </button>
            <button type="button" className={habitableOnly ? "is-on" : ""} onClick={() => setHabitableOnly(true)}>
              <i className="sx-dot" style={{ background: colorFor("In habitable zone") }} /> Habitable zone
            </button>
          </div>
          <span className="sx-count">{status}</span>
        </div>

        <div className="sx-right">
          <div className="sx-seg" role="group" aria-label="View">
            <button type="button" className={sky ? "is-on" : ""} onClick={() => setMode("sky")}>
              Sky from Earth
            </button>
            <button type="button" className={!sky ? "is-on" : ""} onClick={() => setMode("map")}>
              Galaxy map
            </button>
          </div>
          <button type="button" className="sx-btn" onClick={() => setHabitability(true)}>
            Habitability
          </button>
          <button type="button" className="sx-btn" onClick={() => setCompare({ a: selected ? selected.pl_name : null })}>
            Compare worlds
          </button>
        </div>
      </header>

      {/* NASA data source + legend */}
      <div className="sx-corner">
      <DataBadge api={API} onRefreshed={() => setDataVersion((v) => v + 1)} />
      <div className="sx-legend sx-glass">
        {LEGEND.map(([k, label]) => (
          <span key={k}>
            <i className="sx-dot" style={{ background: colorFor(k) }} />
            {label}
          </span>
        ))}
        <div className="sx-note">
          {sky
            ? `Each light is a planet's star, where it sits in Earth's sky · ${hzCount.toLocaleString()} in the habitable zone`
            : "Distances on a log scale · rings at 10 to 10,000 light-years · drag to orbit"}
        </div>
      </div>
      </div>

      {/* view controls */}
      <div className="sx-zoom" style={{ right: selected ? 424 : 24 }}>
        <button type="button" className="sx-icon" title="Zoom in" onClick={() => mapRef.current?.zoomBy(sky ? 0.6 : 0.7)}>
          +
        </button>
        <button type="button" className="sx-icon" title="Zoom out" onClick={() => mapRef.current?.zoomBy(sky ? 1.6 : 1.4)}>
          −
        </button>
        <button type="button" className="sx-icon sx-wide" title="Reset view" onClick={() => mapRef.current?.reset()}>
          Reset
        </button>
        <button type="button" className="sx-icon sx-wide" title="Look at the Kepler field" onClick={goToKepler}>
          Kepler field
        </button>
      </div>

      <div ref={tipRef} className="sx-tip" />

      {selected && (
        <Panel
          planet={selected}
          siblings={siblings}
          onPick={(p) => {
            setSelected(p);
          }}
          onClose={() => setSelected(null)}
          onViewSystem={viewSystem}
          onCompare={(p) => setCompare({ a: p.pl_name })}
        />
      )}

      <Astro
        api={API}
        context={
          selected
            ? { kind: "planet", names: [selected.pl_name], label: selected.pl_name }
            : { kind: "sky", names: [], label: "the whole catalogue" }
        }
        onShow={showPlanet}
        inset={selected ? 408 : 0}
      />

      {habitability && (
        <HabitabilityView
          api={API}
          onClose={() => setHabitability(false)}
          onShow={(name) => {
            setHabitability(false);
            showPlanet(name);
          }}
        />
      )}

      {compare && <CompareView api={API} initialA={compare.a} onClose={() => setCompare(null)} />}
      <div className="sx-dive" />
    </div>
  );
  }
}
