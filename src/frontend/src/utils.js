import * as THREE from "three";

// backend address: set VITE_API_URL in frontend/.env when you deploy
export const API = (import.meta.env && import.meta.env.VITE_API_URL) || "http://127.0.0.1:8000";
const R = 50;

export function toXYZ(raDeg, decDeg) {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return [
    R * Math.cos(dec) * Math.cos(ra),
    R * Math.sin(dec),
    -R * Math.cos(dec) * Math.sin(ra),
  ];
}

// status colours, shared by the 3D views and the panels
export function colorFor(hz) {
  if (hz === "In habitable zone") return "#8af0c4";
  if (hz === "Too hot") return "#f2b394";
  if (hz === "Too cold") return "#9cc2ff";
  return "#b4bbcf";
}

export const LY_PER_PC = 3.2616;
export const fmtLy = (pc) => (pc == null ? "unknown" : `${Math.round(pc * LY_PER_PC).toLocaleString()} light-years`);
export const fmtNum = (v, digits = 3) => (v == null ? "n/a" : v >= 1000 ? Math.round(v).toLocaleString() : Number(v.toPrecision(digits)).toString());

export function planetLabel(p) {
  if (p.hostname && p.pl_name.startsWith(p.hostname)) {
    const rest = p.pl_name.slice(p.hostname.length).trim();
    return rest || p.pl_name;
  }
  return p.pl_name;
}

export function makeCircleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  return new THREE.CanvasTexture(c);
}