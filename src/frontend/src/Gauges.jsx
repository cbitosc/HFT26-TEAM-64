import { colorFor } from "./utils";

const clamp = (v) => Math.min(1, Math.max(0, v));
const logPos = (f) => clamp((Math.log10(Math.max(f, 0.001)) + 2) / 4); // 0.01x to 100x Earth

export function esiColor(esi) {
  return esi == null ? "#67708e" : esi >= 0.8 ? "#8af0c4" : esi >= 0.6 ? "#f3dc8a" : "#f2b394";
}

export function EsiRing({ esi, size = 84 }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = esi == null ? 0 : clamp(esi);
  const col = esiColor(esi);
  return (
    <svg width={size} height={size} viewBox="0 0 84 84" style={{ flexShrink: 0, overflow: "visible" }}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke={col}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        transform="rotate(-90 42 42)"
        style={{ transition: "stroke-dasharray 0.8s ease", filter: `drop-shadow(0 0 6px ${col}88)` }}
      />
      <text x="42" y="40" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="19" fontWeight="500" fontFamily="Inter, sans-serif">
        {esi == null ? "n/a" : esi.toFixed(2)}
      </text>
      <text x="42" y="58" textAnchor="middle" fill="#959db8" fontSize="7.5" letterSpacing="2" fontFamily="Michroma, sans-serif">
        ESI
      </text>
    </svg>
  );
}

function Gauge({ label, valueText, pos, earthPos, zone, color, note }) {
  return (
    <div className="sx-gauge">
      <div className="sx-gauge-head">
        <span>{label}</span>
        <span>{valueText}</span>
      </div>
      <div className="sx-track">
        {zone && <div className="sx-zone" style={{ left: `${zone[0] * 100}%`, width: `${(zone[1] - zone[0]) * 100}%` }} />}
        {earthPos != null && <div className="sx-earth" style={{ left: `${earthPos * 100}%` }} />}
        {pos != null && <div className="sx-knob" style={{ left: `calc(${pos * 100}% - 7px)`, background: color, color }} />}
      </div>
      {note && <div className="sx-gauge-note">{note}</div>}
    </div>
  );
}

export function StarlightGauge({ flux }) {
  const pct = flux != null ? flux * 100 : null;
  const text = pct == null ? "n/a" : `${pct >= 10 ? Math.round(pct).toLocaleString() : Number(pct.toPrecision(2))}% of Earth's`;
  return (
    <Gauge
      label="Starlight received"
      valueText={text}
      pos={flux != null ? logPos(flux) : null}
      earthPos={logPos(1)}
      zone={[logPos(0.36), logPos(1.1)]}
      color="#f3dc8a"
      note="Log scale · green = habitable zone · blue line = Earth"
    />
  );
}

export function TempGauge({ eq }) {
  return (
    <Gauge
      label="Equilibrium temperature"
      valueText={eq != null ? `${Math.round(eq)} K (${Math.round(eq - 273.15)} °C)` : "n/a"}
      pos={eq != null ? clamp(eq / 1500) : null}
      earthPos={255 / 1500}
      color="#f2b394"
      note="0–1500 K · blue line = Earth (255 K) · not a surface temperature"
    />
  );
}

export function Dashboard({ planet: p }) {
  const label =
    p.esi == null ? "Not enough data" : p.esi >= 0.8 ? "High similarity" : p.esi >= 0.6 ? "Moderate similarity" : "Low similarity";
  const hzCol = colorFor(p.hz_status);
  return (
    <div className="sx-dash">
      <div className="sx-dash-top">
        <EsiRing esi={p.esi} />
        <div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Earth Similarity Index</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{label}</div>
          {p.esi != null && (
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
              based on {p.esi_factors} of 4 factors{p.esi_factors < 4 ? " (mass not measured)" : ""}
            </div>
          )}
          <span className="sx-chip" style={{ marginTop: 8, color: hzCol, borderColor: `${hzCol}55` }}>
            {p.hz_status}
          </span>
        </div>
      </div>
      <StarlightGauge flux={p.flux} />
      <TempGauge eq={p.pl_eqt} />
    </div>
  );
}
