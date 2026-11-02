import { useMemo } from "react";

// SOLICE wordmark: thin, geometric, monoline letters in brushed silver with a lens flare on the I.
// Drawn as SVG strokes so it looks identical everywhere and needs no font file.
// Usage: <Wordmark on={true} />  (letters draw themselves in when `on` turns true)

const LETTERS = [
  { d: "M86 3 H24 A23.5 23.5 0 0 0 24 50 H62 A23.5 23.5 0 0 1 62 97 H0" }, // S
  { d: "M187 3 A47 47 0 0 1 187 97 A47 47 0 0 1 187 3 Z" }, // O
  { d: "M288 3 V97 H362" }, // L
  { d: "M414 3 V97" }, // I
  { d: "M551 19.8 A47 47 0 1 0 551 80.2" }, // C
  { d: "M690 3 H614 V97 H690 M614 50 H676" }, // E
];

const STROKE = 4.2; // letter thickness (3 = hairline, 6 = bolder)
const DRAW = 1.5; // seconds each letter takes to draw
const STAGGER = 0.16; // seconds between letters
const END = DRAW + STAGGER * (LETTERS.length - 1);
const FLARE = { x: 414, y: 3 };

export default function Wordmark({ on, width = "min(74vw, 880px)" }) {
  const reduce = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const draw = (i) => ({
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: reduce ? "none" : `stroke-dashoffset ${DRAW}s cubic-bezier(0.65, 0, 0.25, 1) ${i * STAGGER}s`,
  });

  const later = (delay, dur = 1.6) => ({
    opacity: on ? 1 : 0,
    transition: reduce ? "none" : `opacity ${dur}s ease ${delay}s`,
  });

  const letters = (key, stroke, sw, extra = {}) =>
    LETTERS.map((l, i) => (
      <path key={key + i} d={l.d} pathLength="1" stroke={stroke} strokeWidth={sw} style={draw(i)} {...extra} />
    ));

  return (
    <svg role="img" aria-label="SOLICE" viewBox="-20 -40 730 180" style={{ width, height: "auto", overflow: "visible" }}>
      <defs>
        {/* brushed silver: bright at the top edge, cooler and darker toward the base */}
        <linearGradient id="sl-silver" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#dfe4ee" />
          <stop offset="0.75" stopColor="#a9b2c4" />
          <stop offset="1" stopColor="#7f889c" />
        </linearGradient>
        {/* a slow sheen that sweeps across the letters */}
        <linearGradient id="sl-sheen" gradientUnits="userSpaceOnUse" x1="-200" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          {!reduce && (
            <animateTransform attributeName="gradientTransform" type="translate" from="-100 0" to="1100 0" dur="7s" begin="3s" repeatCount="indefinite" />
          )}
        </linearGradient>
        <filter id="sl-glow" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <radialGradient id="sl-flare-core">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.18" stopColor="#dce8ff" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#7fa2ff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#4f6fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sl-flare-streak" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6f8dff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#e9f0ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#6f8dff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g fill="none" strokeLinecap="butt" strokeLinejoin="miter">
        {/* soft cool glow behind the letters */}
        <g filter="url(#sl-glow)" style={later(END - 0.6, 2)}>
          {letters("gl", "#9fb6ff", STROKE * 2.2, { strokeOpacity: 0.35 })}
        </g>
        {letters("mt", "url(#sl-silver)", STROKE)}
        <g style={later(END, 1)}>{letters("sh", "url(#sl-sheen)", STROKE, { strokeOpacity: 0.55 })}</g>
      </g>

      {/* lens flare resting on top of the I */}
      <g style={later(END - 0.2, 1.2)}>
        <ellipse
          cx={FLARE.x}
          cy={FLARE.y}
          rx="210"
          ry="1.4"
          fill="url(#sl-flare-streak)"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            transform: on ? "scaleX(1)" : "scaleX(0.1)",
            transition: reduce ? "none" : `transform 2s cubic-bezier(0.2, 0.7, 0.2, 1) ${END - 0.2}s`,
          }}
        />
        <circle cx={FLARE.x} cy={FLARE.y} r="26" fill="url(#sl-flare-core)">
          {!reduce && <animate attributeName="r" values="24;29;24" dur="4.5s" repeatCount="indefinite" />}
        </circle>
        <circle cx={FLARE.x} cy={FLARE.y} r="3.2" fill="#ffffff" />
      </g>
    </svg>
  );
}
