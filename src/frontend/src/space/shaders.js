// GLSL for the explorer views (the intro's shaders.js provides noise, sky, stars and the pixel-cleanup pass).
import { COMMON } from "../intro/shaders.js";

/* ----------------------------- planet markers on the star map ----------------------------- */

export const MARKER_VERT = /* glsl */ `
attribute vec3 aSky;      // position on the sky dome (direction * radius)
attribute vec3 aMap;      // position in the 3D neighbourhood map
attribute vec3 aColor;
attribute float aSize;
attribute float aId;
uniform float uMorph;     // 0 = sky dome, 1 = 3D map
uniform float uPR;
uniform float uZoom;      // grows markers a little when zoomed in
uniform float uHover;
uniform float uSel;
uniform float uFade;
varying vec3 vColor;
varying float vSel;
varying float vHover;
varying float vSize;
void main(){
  vec3 p = mix(aSky, aMap, uMorph);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sel = 1.0 - step(0.5, abs(aId - uSel));
  float hov = 1.0 - step(0.5, abs(aId - uHover));
  float s = aSize * uZoom * (1.0 + 0.45 * hov) * mix(1.0, 0.8, uMorph);
  s = max(s, 2.4);
  if (sel > 0.5) s = max(s * 3.2, 30.0);       // room for the selection ring
  vSize = s * uPR;
  gl_PointSize = vSize;
  // in the 3D map thousands of systems overlap (the Kepler field), so each one is dimmer there
  vColor = aColor * uFade * mix(1.0, 0.42, uMorph);
  vSel = sel;
  vHover = hov;
}
`;

export const MARKER_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vColor;
varying float vSel;
varying float vHover;
varying float vSize;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;                       // 0 centre .. 1 edge of the sprite
  vec3 col = toLin(vColor);
  float a;
  if (vSel > 0.5) {
    // selected: bright core, thin ring that slowly breathes, four small ticks
    float k = vSize / 30.0;
    float core = exp(-r * r * 90.0 * k * k) * 2.2;
    float ringR = 0.72 + 0.03 * sin(uTime * 2.0);
    float ring = (1.0 - smoothstep(0.0, 0.035, abs(r - ringR))) * 0.9;
    vec2 q = abs(c) * 2.0;
    float ticks = ((1.0 - smoothstep(0.0, 0.02, q.y)) * step(0.84, q.x) * step(q.x, 0.98) + (1.0 - smoothstep(0.0, 0.02, q.x)) * step(0.84, q.y) * step(q.y, 0.98)) * 0.9;
    a = core + ring + ticks + exp(-r * 9.0) * 0.5;
    col = mix(col, vec3(1.0), 0.35);
  } else {
    float core = exp(-r * r * 14.0);
    float halo = exp(-r * 4.5) * 0.35;
    a = core * (1.0 + vHover * 1.2) + halo;
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(min(col * a * 1.5, vec3(3.0)), 1.0);
}
`;

/* -------------------------------- star map: faint disc of the galaxy -------------------------------- */

export const DISC_FRAG = /* glsl */ `
uniform float uFade;
varying vec2 vUv;
${COMMON}
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = (1.0 - smoothstep(0.1, 1.0, r)) * 0.35;
  float n = fbm3(vec3(p * 2.0, 1.0)) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.22, 0.24, 0.52), vec3(0.40, 0.30, 0.62), n) * a;
  gl_FragColor = vec4(toLin(col) * 0.35 * uFade, 1.0);
}
`;

export const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/* -------------------------------------- system view: star -------------------------------------- */

export const STAR_SURF_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
${COMMON}
void main(){
  vec3 p = normalize(vObj);
  float n = fbm5(p * 4.0 + vec3(0.0, 0.0, uTime * 0.04)) * 0.5 + 0.5;
  float gran = 1.0 - abs(snoise(p * 16.0 + uTime * 0.06));
  vec3 base = toLin(uColor);
  vec3 col = mix(base * 0.55, base * 1.05 + 0.15, n);
  col += vec3(1.0) * gran * gran * 0.12;
  float mu = max(dot(normalize(vN), normalize(vV)), 0.0);
  col *= 0.5 + 0.6 * sqrt(mu);                      // limb darkening
  gl_FragColor = vec4(col * 3.2, 1.0);             // HDR, so it glows
}
`;

/* ------------------------------ system view: data-driven planet surfaces ------------------------------ */

// kinds: 0 barren rock, 1 lava world, 2 desert / thick-cloud, 3 temperate (ocean + land), 4 ice world,
//        5 banded gas giant, 6 hazy ice giant, 7 hot gas giant
// output: rgb = albedo (sRGB), a = how much the surface glows from its own heat
export const BAKE_WORLD = /* glsl */ `
uniform int uKind;
uniform float uSeed;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform float uBands;
uniform float uWet;       // ocean fraction for temperate worlds
varying vec2 vUv;
${COMMON}
vec3 dirFromUv(vec2 uv){
  float phi = uv.x * 6.28318530718;
  float theta = (1.0 - uv.y) * 3.14159265359;
  return vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
}
void main(){
  vec3 p = dirFromUv(vUv);
  vec3 sp = p + vec3(uSeed * 1.37, uSeed * 0.71, uSeed * 2.13);
  vec3 col;
  float glow = 0.0;
  float lat = abs(p.y);
  if (uKind == 0 || uKind == 1) {
    float n = fbm5(sp * 2.4) * 0.5 + 0.5;
    float d = fbm5(sp * 10.0) * 0.5 + 0.5;
    float cr = ridged(sp * 5.0);
    col = mix(uA, uB, n);
    col *= 0.72 + 0.5 * d;
    col = mix(col, uC, smoothstep(0.55, 0.85, cr) * 0.35);
    if (uKind == 1) {
      // lava: dark basalt crust with glowing rivers in the cracks
      float rivers = 1.0 - abs(fbm5(sp * 3.2 + fbm3(sp * 2.0)) * 2.0);
      float hotL = smoothstep(0.84, 0.98, rivers) + smoothstep(0.72, 0.92, fbm5(sp * 1.6 + 7.0) * 0.5 + 0.5) * 0.35;
      col = mix(col * 0.45, vec3(0.95, 0.42, 0.12), clamp(hotL, 0.0, 1.0));
      glow = clamp(hotL, 0.0, 1.0);
    }
  } else if (uKind == 2) {
    vec3 q = vec3(fbm3(sp * 1.5), fbm3(sp * 1.5 + 5.2), fbm3(sp * 1.5 + 9.1));
    float n = fbm5(vec3(p.x * 2.0, p.y * 5.0, p.z * 2.0) + q * 1.4 + uSeed) * 0.5 + 0.5;
    col = mix(uA, uB, n);
    col = mix(col, uC, smoothstep(0.55, 0.8, fbm5(sp * 7.0) * 0.5 + 0.5) * 0.4);
  } else if (uKind == 3) {
    vec3 q = sp * 1.35;
    vec3 w = vec3(fbm3(q), fbm3(q + 5.2), fbm3(q + 9.7));
    float h = fbm7(q + w * 0.9) + (0.5 - uWet) * 0.5;
    float land = smoothstep(0.0, 0.015, h);
    float depth = 1.0 - smoothstep(-0.25, 0.0, h);
    vec3 ocean = mix(uA * 1.2, uA * 0.45, depth);
    float moist = fbm5(sp * 3.0 + 11.0) * 0.5 + 0.5;
    vec3 lc = mix(uB, uC, smoothstep(0.3, 0.7, moist));
    lc *= 0.8 + 0.35 * (fbm5(sp * 22.0) * 0.5 + 0.5);
    col = mix(ocean, lc, land);
    float ice = smoothstep(0.82, 0.92, lat + fbm5(p * 6.0) * 0.05);
    col = mix(col, vec3(0.9, 0.93, 0.98), ice);
  } else if (uKind == 4) {
    float n = fbm5(sp * 2.2) * 0.5 + 0.5;
    float cracks = smoothstep(0.86, 0.98, 1.0 - abs(fbm5(sp * 6.0) * 2.0));
    col = mix(uA, uB, n);
    col = mix(col, uC, cracks * 0.6);
  } else {
    // giants: latitude bands, warped by turbulence
    // turbulence that is stretched east-west, like real jet streams
    float warp = fbm5(vec3(p.x * 1.6, p.y * 9.0, p.z * 1.6) + uSeed) * 0.35 + fbm3(vec3(p.x * 4.0, p.y * 14.0, p.z * 4.0) + uSeed * 2.0) * 0.12;
    float bandF = (uKind == 6) ? uBands * 0.35 : uBands;
    float y = p.y + warp * 0.12;
    float b = smoothstep(0.15, 0.85, sin(y * bandF) * 0.5 + 0.5);
    float b2 = sin(y * bandF * 2.7 + 1.3) * 0.5 + 0.5;
    float fine = fbm5(vec3(p.x * 6.0, y * 40.0, p.z * 6.0) + uSeed * 3.0) * 0.5 + 0.5;
    col = mix(uA, uB, b * (uKind == 6 ? 0.5 : 0.58));
    col = mix(col, mix(uA, uB, 0.5), b2 * 0.18);
    col = mix(col, uC, smoothstep(0.5, 0.9, fine) * (uKind == 6 ? 0.18 : 0.35));
    col *= 0.92 + 0.16 * fine;
    // an occasional storm oval
    float lon = atan(p.z, p.x);
    vec2 dd = vec2((lon - uSeed) * 2.2, (p.y + 0.22 * sin(uSeed)) * 9.0);
    float storm = exp(-dot(dd, dd) * 3.0);
    col = mix(col, uC * 1.05, storm * 0.5);
    if (uKind == 7) glow = 0.35 + 0.65 * (1.0 - b);   // hot Jupiters glow through their darker belts
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), glow);
}
`;

// clouds for temperate worlds (r channel)
export const BAKE_CLOUDS = /* glsl */ `
uniform float uSeed;
uniform float uAmount;
varying vec2 vUv;
${COMMON}
vec3 dirFromUv(vec2 uv){
  float phi = uv.x * 6.28318530718;
  float theta = (1.0 - uv.y) * 3.14159265359;
  return vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
}
void main(){
  vec3 p = dirFromUv(vUv);
  vec3 q = vec3(p.x * 2.0, p.y * 4.2, p.z * 2.0) + uSeed;
  vec3 w = vec3(fbm3(q * 0.7), fbm3(q * 0.7 + 4.0), fbm3(q * 0.7 + 8.0));
  float c = fbm7(q + w * 1.4);
  float wisps = fbm5(vec3(p.x * 7.0, p.y * 16.0, p.z * 7.0) + w * 2.5);
  float cloud = smoothstep(0.2 - uAmount * 0.3, 0.6, c + wisps * 0.22) * 0.9;
  gl_FragColor = vec4(cloud, 0.0, 0.0, 1.0);
}
`;

export const WORLD_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main(){
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const WORLD_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uClouds;
uniform float uHasClouds;
uniform float uTime;
uniform vec3 uStar;        // star colour (linear)
uniform vec3 uHeat;        // colour of the planet's own glow (linear), already scaled by how hot it is
uniform vec3 uAtmo;
uniform float uAtmoK;
uniform float uSpec;       // ocean shine
uniform float uHighlight;  // hover / selected rim
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  vec4 tex = texture2D(uMap, vUv);
  vec3 albedo = toLin(tex.rgb);
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(-vPosW);                         // the star sits at the origin
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, L);
  float dif = smoothstep(-0.1, 1.0, ndl);
  float cl = 0.0;
  if (uHasClouds > 0.5) {
    cl = texture2D(uClouds, vUv + vec2(uTime * 0.002, 0.0)).r;
    float sh = texture2D(uClouds, vUv + vec2(uTime * 0.002 + 0.003, 0.002)).r;
    albedo *= 1.0 - 0.4 * sh * (1.0 - cl);
  }
  vec3 light = uStar * 1.3;
  vec3 col = albedo * light * dif;
  vec3 H = normalize(L + V);
  float water = uSpec * (1.0 - cl);
  col += uStar * pow(max(dot(N, H), 0.0), 140.0) * 0.6 * water * smoothstep(0.0, 0.2, ndl);
  // clouds are white: tint them only partly by the star's colour, or red-dwarf worlds look like they're on fire
  vec3 cloudLight = mix(light, vec3(1.25), 0.55);
  col = mix(col, vec3(0.96) * cloudLight * (0.02 + dif), cl * 0.85);
  // the planet's own heat: strongest on the night side, where starlight doesn't wash it out
  float night = 1.0 - smoothstep(-0.3, 0.25, ndl);
  col += uHeat * tex.a * (0.12 + 0.88 * night);
  // atmosphere at the limb, on the lit side
  float fres = pow(max(1.0 - max(dot(N, V), 0.0), 0.0), 2.6);
  col += toLin(uAtmo) * fres * uAtmoK * smoothstep(-0.3, 0.4, ndl);
  // a faint cool rim so night sides still read against space
  col += vec3(0.05, 0.05, 0.09) * fres;
  col += vec3(0.55, 0.6, 1.0) * fres * uHighlight * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------------------------------- system view: habitable zone band ---------------------------------- */

export const HZ_VERT = /* glsl */ `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const HZ_FRAG = /* glsl */ `
uniform float uIn;
uniform float uOut;
uniform float uFade;
uniform float uTime;
varying vec2 vP;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  float r = length(vP);
  float w = max(uOut - uIn, 1e-3);
  float t = (r - uIn) / w;
  if (t < -0.15 || t > 1.15) discard;
  float soft = 0.06;
  float band = smoothstep(-soft, soft, t) * (1.0 - smoothstep(1.0 - soft, 1.0 + soft, t));
  float edges = exp(-abs(t) * w * 60.0) + exp(-abs(t - 1.0) * w * 60.0);   // thin lines at the zone's edges
  float ang = atan(vP.y, vP.x);
  float shimmer = 0.85 + 0.15 * sin(ang * 3.0 + uTime * 0.3 + r * 2.0);
  vec3 col = toLin(vec3(0.50, 0.86, 0.72));
  float a = (band * 0.035 * shimmer + edges * 0.14) * uFade;
  gl_FragColor = vec4(col * a, 1.0);
}
`;

/* ------------------------- system view: orbit line with a fading trail behind the planet ------------------------- */

export const ORBIT_VERT = /* glsl */ `
attribute float aAng;
varying float vAng;
void main(){ vAng = aAng; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const ORBIT_FRAG = /* glsl */ `
uniform float uAng;
uniform vec3 uColor;
uniform float uBase;
uniform float uTrail;
varying float vAng;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  float d = mod(uAng - vAng, 6.28318530718);
  float tr = exp(-d * 2.4);
  gl_FragColor = vec4(toLin(uColor) * (uBase + uTrail * tr), 1.0);
}
`;
