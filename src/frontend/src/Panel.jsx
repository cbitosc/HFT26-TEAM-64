import { colorFor, planetLabel, fmtLy, fmtNum } from "./utils";
import { Dashboard } from "./Gauges";

// Details for the planet picked on the star map.
export default function Panel({ planet: p, siblings, onPick, onClose, onViewSystem, onCompare }) {
  return (
    <aside className="sx-panel" key={p.hostname}>
      <div className="sx-panel-head">
        <div>
          <span className="sx-eyebrow">{p.hostname}</span>
          <h2>{p.pl_name}</h2>
          <div className="sx-panel-sub">{fmtLy(p.sy_dist)} from Earth</div>
        </div>
        <button type="button" className="sx-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="sx-chips">
        <span className="sx-chip">{p.type}</span>
        <span className="sx-chip" style={{ color: colorFor(p.hz_status), borderColor: `${colorFor(p.hz_status)}55` }}>
          <i className="sx-dot" style={{ background: colorFor(p.hz_status) }} />
          {p.hz_status}
        </span>
      </div>

      <div className="sx-actions">
        <button type="button" className="sx-btn is-primary" onClick={() => onViewSystem(p)}>
          Fly to this system
        </button>
        <button type="button" className="sx-btn" onClick={() => onCompare(p)}>
          Compare
        </button>
      </div>

      {siblings.length > 1 && (
        <div className="sx-section">
          <span className="sx-eyebrow">{siblings.length} planets in this system</span>
          <div className="sx-siblings">
            {siblings.map((s) => (
              <button
                key={s.pl_name}
                type="button"
                title={`${s.pl_name} · ${s.hz_status}`}
                className={s.pl_name === p.pl_name ? "is-on" : ""}
                onClick={() => onPick(s)}
              >
                <i className="sx-dot" style={{ background: colorFor(s.hz_status) }} />
                {planetLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sx-section">
        <span className="sx-eyebrow">Habitability</span>
        <Dashboard planet={p} />
      </div>

      <div className="sx-section">
        <span className="sx-eyebrow">At a glance</span>
        <dl className="sx-facts">
          <div className="sx-fact">
            <dt>Radius</dt>
            <dd>
              {fmtNum(p.pl_rade)}
              <small>× Earth</small>
            </dd>
          </div>
          <div className="sx-fact">
            <dt>Mass</dt>
            <dd>
              {fmtNum(p.pl_bmasse)}
              <small>{p.pl_bmasse != null ? "× Earth" : ""}</small>
            </dd>
          </div>
          <div className="sx-fact">
            <dt>Year length</dt>
            <dd>
              {fmtNum(p.pl_orbper)}
              <small>{p.pl_orbper != null ? "days" : ""}</small>
            </dd>
          </div>
          <div className="sx-fact">
            <dt>Discovered</dt>
            <dd>
              {p.disc_year ?? "n/a"}
              <small>{p.discoverymethod}</small>
            </dd>
          </div>
        </dl>
      </div>

    </aside>
  );
}
