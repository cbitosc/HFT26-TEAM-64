// GLSL for the SOLICE intro. Colours are written in sRGB and converted to linear with toLin(),
// because the composer renders in linear space and converts to sRGB at the very end.

export const COMMON = /* glsl */ `
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }

float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * snoise(p); p = p * 2.02 + 3.1; a *= 0.5; } return s; }
float fbm5(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * snoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
float fbm7(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 7; i++){ s += a * snoise(p); p = p * 2.01 + 4.3; a *= 0.5; } return s; }
float ridged(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ float n = 1.0 - abs(snoise(p)); s += a * n * n; p *= 2.07; a *= 0.5; } return s; }
`;

/* ---------------------------------- sky sphere ---------------------------------- */

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Deep-space backdrop, baked once into a cube map: indigo and violet nebula, star dust and (inside the galaxy) the Milky Way band.
export const SKY_FRAG = /* glsl */ `
uniform float uBand;      // 0 = intergalactic space, 1 = inside the Milky Way
uniform float uNebula;    // nebula strength
uniform vec3 uBandN;      // normal of the galactic plane as seen from here
uniform vec3 uCore;       // direction of the galactic centre
varying vec3 vDir;
${COMMON}
void main(){
  vec3 d = normalize(vDir);

  // large domain-warped gas clouds: deep navy-blue body with violet / magenta veils
  vec3 w = vec3(fbm5(d * 1.3 + 2.0), fbm5(d * 1.3 + 7.0), fbm5(d * 1.3 + 12.0));
  float body = smoothstep(-0.25, 0.75, fbm7(d * 1.8 + w * 1.1));
  float veil = smoothstep(0.0, 0.8, fbm7(d * 2.6 - w * 0.9 + 20.0));
  float wisp = smoothstep(0.25, 0.85, fbm5(d * 5.5 + w * 2.0 + 40.0));
  vec3 navy = vec3(0.10, 0.14, 0.34);
  vec3 blue = vec3(0.20, 0.30, 0.62);
  vec3 violet = vec3(0.42, 0.22, 0.55);
  vec3 rose = vec3(0.62, 0.30, 0.52);
  vec3 neb = navy * body * 0.8 + blue * body * veil * 0.38 + violet * veil * body * 1.05 + rose * wisp * veil * body * 0.7;
  // dark dust lanes cutting through the gas
  float lanes = smoothstep(0.1, 0.6, fbm5(d * 4.0 - w * 1.5 + 60.0));
  neb *= 1.0 - 0.7 * lanes;

  // fine star dust caught in the gas (unresolved stars)
  float dust = pow(max(snoise(d * 220.0), 0.0), 6.0) * (0.2 + body * 0.8);

  // Milky Way band
  float b = dot(d, uBandN);
  float core = pow(max(dot(d, uCore), 0.0), 3.0);
  float width = 0.16 + 0.10 * core;
  float band = exp(-b * b / (width * width));
  float lumps = 0.55 + 0.45 * fbm5(d * 7.0 + 3.0);
  float dlane = smoothstep(0.0, 0.55, fbm5(d * 9.0 + vec3(0.0, 9.0, 0.0)) + 0.15) * exp(-b * b / (0.0025 + 0.04 * core));
  vec3 bandCol = mix(vec3(0.66, 0.66, 0.92), vec3(1.0, 0.82, 0.60), core);
  vec3 mw = bandCol * band * lumps * (0.28 + 0.9 * core) * (1.0 - 0.8 * dlane);

  vec3 col = neb * uNebula + mw * uBand + vec3(0.85, 0.85, 1.0) * dust * (0.4 + uBand);
  gl_FragColor = vec4(toLin(col), 1.0);
}
`;

/* ------------------------------------- stars ------------------------------------ */

export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
uniform float uTime;
uniform float uPR;
uniform float uFixed;     // 1 = sky-dome stars (size does not change with distance)
uniform float uFade;
varying vec3 vColor;
varying float vSize;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  if (uFixed > 0.5) gl_Position = gl_Position.xyww;  // sky-dome stars sit on the far plane
  float s = aSize;
  if (uFixed < 0.5) s = aSize * clamp(140.0 / -mv.z, 0.35, 1.4);   // nearby stars never balloon into blurry blobs
  float tw = 1.0;   // steady stars, no twinkle
  vSize = s * uPR;
  // A star is never drawn smaller than 2.4 px: anything smaller flickers as it slides across pixels.
  // Small stars are dimmed by their area instead, so they still look small.
  gl_PointSize = max(vSize, 2.4) * 3.0;
  float k = clamp(vSize / 2.4, 0.0, 1.0);
  float dim = max(k * k, 0.12);
  vSize = max(vSize, 2.4);
  vColor = aColor * tw * dim * uFade;
}
`;

export const STAR_FRAG = /* glsl */ `
uniform float uSpike;
varying vec3 vColor;
varying float vSize;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 3.0;                      // r = 1 at the star's nominal size
  float core = exp(-r * r * 3.2);
  float halo = exp(-r * 1.7) * 0.18;
  vec2 q = abs(c) * 6.0;
  float spikes = (exp(-q.y * 40.0) * exp(-q.x * 1.6) + exp(-q.x * 40.0) * exp(-q.y * 1.6)) * uSpike;
  float a = core + halo + spikes;
  if (a < 0.003) discard;
  gl_FragColor = vec4(min(vColor * a, vec3(2.0)), 1.0);
}
`;

/* -------------------------------- Milky Way disc -------------------------------- */

export const DISC_VERT = /* glsl */ `
varying vec2 vP;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = position.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const discFrag = (ARMS, SPIN, OM) => /* glsl */ `
uniform float uTime;
uniform float uFade;
varying vec2 vP;
${COMMON}
float omega(float r){ return ${OM} / (1.0 + r * 0.1); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float starLayer(vec2 p, float cell, float fp, float dens, float seed){
  vec2 g = p / cell; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float h = hash21(id + seed);
  // stars fade in and out gently as the arms sweep past, instead of switching on/off (that read as twinkling)
  float prob = clamp(0.03 + dens * 0.22, 0.0, 0.45);
  float pres = 1.0 - smoothstep(prob - 0.12, prob + 0.02, h);
  if (pres <= 0.0) return 0.0;
  vec2 off = (vec2(hash21(id + seed + 7.7), hash21(id + seed + 3.1)) - 0.5) * 0.6;
  float d = length(f - off);
  float px = cell / max(fp, 1e-6);
  float lod = smoothstep(1.5, 6.0, px) * (1.0 - smoothstep(30.0, 140.0, px));
  float b = pow(hash21(id + seed + 11.3), 2.0) * 0.9 + 0.1;
  return (1.0 - smoothstep(0.0, 0.30, d)) * b * lod * pres;
}
void main(){
  vec2 p = vP;
  float r = length(p);
  if (r > 46.0) discard;
  float th = atan(p.y, p.x);
  float w = fbm2(p * 0.12 + 3.0);
  float ph = ${ARMS}.0 * (th - r * ${SPIN} - uTime * omega(r)) + (w - 0.5) * 2.2;
  float arms = pow(max(0.5 + 0.5 * cos(ph), 0.0), 2.6);
  float disc = exp(-r / 15.0);
  float outer = (1.0 - smoothstep(22.0, 46.0, r));
  float bulge = exp(-r * r / 22.0) * 1.6 + exp(-r / 3.2) * 0.9;
  float lumps = fbm2(p * 0.5 + vec2(uTime * 0.01, 0.0));
  float dens = (arms * (0.35 + 0.9 * lumps) * disc * 2.2 + disc * 0.25) * outer;
  float lane = pow(max(0.5 + 0.5 * cos(ph - 0.9), 0.0), 5.0) * smoothstep(3.0, 9.0, r) * (0.5 + fbm2(p * 0.9));
  dens *= 1.0 - 0.75 * clamp(lane, 0.0, 1.0);

  vec3 warm = vec3(1.0, 0.80, 0.52);
  vec3 gold = vec3(0.95, 0.66, 0.34);
  vec3 blue = vec3(0.56, 0.62, 1.0);
  vec3 lav = vec3(0.70, 0.55, 1.0);
  float k = clamp(r / 36.0, 0.0, 1.0);
  vec3 col = mix(warm, gold, smoothstep(0.0, 0.45, k));
  col = mix(col, mix(blue, lav, fbm2(p * 0.4 + 9.0)), smoothstep(0.25, 0.8, k) * (0.45 + arms * 0.5));
  // pinkish star-forming knots along the arms
  float knots = smoothstep(0.72, 0.9, fbm2(p * 1.3 + 40.0)) * arms * smoothstep(8.0, 16.0, r);
  col = mix(col, vec3(1.0, 0.55, 0.7), knots * 0.6);

  float fp = max(fwidth(p.x), fwidth(p.y));
  float stars = 0.0;
  for (int i = 0; i < 4; i++){ stars += starLayer(p, 0.12 * pow(2.9, float(i)), fp, dens + bulge * 0.3, float(i) * 17.0); }
  vec3 sc = mix(vec3(1.0, 0.9, 0.72), vec3(0.85, 0.9, 1.0), hash21(floor(p / 0.35)));

  float halo = exp(-r / 18.0) * (1.0 - smoothstep(30.0, 46.0, r)) * 0.08;
  vec3 light = vec3(0.45, 0.32, 0.8) * halo + col * dens * 1.1 + vec3(1.0, 0.86, 0.6) * bulge * 1.15 + warm * exp(-r / 9.0) * 0.12 + sc * stars * 1.4;
  light = 1.0 - exp(-light * 1.1);
  light += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(toLin(light) * uFade * 1.25, 1.0);
}
`;

export const galaxyVert = (OM) => /* glsl */ `
attribute vec3 aColor;
attribute vec2 aSB;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uMaxSize;
varying vec3 vColor;
float omega(float r){ return ${OM} / (1.0 + r * 0.1); }
void main(){
  float r = position.x;
  float th = position.y + uTime * omega(r);
  vec3 p = vec3(cos(th) * r, sin(th) * r, position.z);   // disc lies in the local XY plane
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float ps = aSB.x * uScale / max(-mv.z, 0.01);
  gl_PointSize = clamp(ps, 3.2, uMaxSize);
  float k = clamp(ps / 3.2, 0.0, 1.0);
  vColor = aColor * aSB.y * k * k * k;   // particles only show once the galaxy is close; far away the smooth disc does the work
}
`;

export const GALAXY_FRAG = /* glsl */ `
uniform float uFade;
varying vec3 vColor;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a;
  gl_FragColor = vec4(min(toLin(vColor) * uFade * a * 0.5, vec3(1.0)), 1.0);
}
`;

/* ------------------------------------- planets ------------------------------------ */

export const PLANET_VERT = /* glsl */ `
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

/* ---- baking: planet surfaces are generated ONCE into mipmapped textures (smooth, no shimmer, cheap per frame) ---- */

export const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// matches THREE.SphereGeometry's uv layout exactly, so baked textures wrap with no seam
const UV_TO_DIR = /* glsl */ `
vec3 dirFromUv(vec2 uv){
  float phi = uv.x * 6.28318530718;
  float theta = (1.0 - uv.y) * 3.14159265359;
  return vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
}
`;

// generic planets: 0 rocky, 2 banded gas giant, 3 hazy / ice giant. Output: sRGB albedo.
export const BAKE_PLANET_FRAG = /* glsl */ `
uniform int uType;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uSeed;
uniform float uBands;
uniform float uContrast;
uniform float uSpot;
uniform float uCap;
varying vec2 vUv;
${COMMON}
${UV_TO_DIR}
void main(){
  vec3 p = dirFromUv(vUv);
  vec3 col;
  if (uType == 0) {
    float n = fbm5(p * 2.5 + uSeed) * 0.5 + 0.5;
    float d = fbm5(p * 11.0 + uSeed * 2.0) * 0.5 + 0.5;
    float cr = ridged(p * 6.0 + uSeed);
    col = mix(uColA, uColB, n);
    col *= 0.72 + 0.5 * d;
    col = mix(col, uColC, smoothstep(0.55, 0.85, cr) * 0.35);
    col = mix(col, vec3(0.93), smoothstep(0.88, 0.95, abs(p.y) + (n - 0.5) * 0.08) * uCap);
  } else if (uType == 2) {
    float lat = p.y;
    float warp = fbm5(vec3(p.x * 2.0, lat * 3.0, p.z * 2.0) + uSeed);
    float b = sin(lat * uBands + warp * 2.6) * 0.5 + 0.5;
    float fine = fbm5(vec3(p.x * 4.0, lat * 26.0, p.z * 4.0) + uSeed * 3.0) * 0.5 + 0.5;
    col = mix(uColA, uColB, b);
    col = mix(col, uColC, smoothstep(0.55, 0.8, fine) * 0.55 * uContrast);
    float lon = atan(p.z, p.x);
    vec2 dd = vec2((lon - 0.8) * 1.2, (lat + 0.28) * 4.0);
    col = mix(col, vec3(0.72, 0.36, 0.22), exp(-dot(dd, dd) * 3.0) * 0.8 * uSpot);
  } else {
    vec3 q = vec3(fbm3(p * 2.0 + uSeed), fbm3(p * 2.0 + uSeed + 5.2), fbm3(p * 2.0 + uSeed + 9.1));
    float n = fbm5(p * 2.4 + q * 1.2) * 0.5 + 0.5;
    col = mix(uColA, uColB, n);
    float streak = smoothstep(0.15, 0.6, fbm5(vec3(p.x * 4.0, p.y * 18.0, p.z * 4.0) + uSeed)) * uContrast;
    col = mix(col, uColC, streak * 0.6);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const EARTH_FN = /* glsl */ `
float landHeight(vec3 p){
  vec3 q = p * 1.35 + vec3(3.7, 1.1, 8.2);
  vec3 w = vec3(fbm3(q), fbm3(q + 5.2), fbm3(q + 9.7));
  return fbm7(q + w * 0.9) + 0.06;
}
`;

// Earth A: rgb = surface albedo (sRGB), a = shiny water mask
export const BAKE_EARTH_A = /* glsl */ `
varying vec2 vUv;
${COMMON}
${UV_TO_DIR}
${EARTH_FN}
void main(){
  vec3 p = dirFromUv(vUv);
  float h = landHeight(p);
  float land = smoothstep(0.0, 0.012, h);
  float lat = abs(p.y);
  float depth = 1.0 - smoothstep(-0.25, 0.0, h);
  vec3 ocean = mix(vec3(0.05, 0.20, 0.32), vec3(0.015, 0.05, 0.14), depth);
  float moist = fbm5(p * 3.0 + 11.0) * 0.5 + 0.5;
  float elev = smoothstep(0.0, 0.35, h);
  float rid = ridged(p * 9.0 + 2.0);
  vec3 forest = vec3(0.13, 0.22, 0.09);
  vec3 grass = vec3(0.30, 0.34, 0.16);
  vec3 desert = vec3(0.70, 0.56, 0.36);
  vec3 rock = vec3(0.38, 0.33, 0.28);
  vec3 tundra = vec3(0.42, 0.40, 0.34);
  float dry = smoothstep(0.15, 0.32, lat) * (1.0 - smoothstep(0.38, 0.5, lat)) * (1.0 - moist * 1.2);
  vec3 lc = mix(forest, grass, smoothstep(0.35, 0.65, moist));
  lc = mix(lc, desert, smoothstep(0.1, 0.45, dry + (0.5 - moist) * 0.5));
  lc = mix(lc, tundra, smoothstep(0.55, 0.72, lat));
  lc = mix(lc, rock, smoothstep(0.35, 0.8, elev * rid));
  lc *= 0.8 + 0.35 * (fbm5(p * 24.0) * 0.5 + 0.5);
  vec3 col = mix(ocean, lc, land);
  float ice = smoothstep(0.86, 0.93, lat + fbm5(p * 6.0) * 0.05);
  col = mix(col, vec3(0.92, 0.95, 1.0), ice);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), (1.0 - land) * (1.0 - ice));
}
`;

// Earth B: r = clouds, g = city lights
export const BAKE_EARTH_B = /* glsl */ `
varying vec2 vUv;
${COMMON}
${UV_TO_DIR}
${EARTH_FN}
void main(){
  vec3 p = dirFromUv(vUv);
  vec3 q = vec3(p.x * 2.0, p.y * 4.2, p.z * 2.0);
  vec3 w = vec3(fbm3(q * 0.7), fbm3(q * 0.7 + 4.0), fbm3(q * 0.7 + 8.0));
  float c = fbm7(q + w * 1.4);
  float lat = abs(p.y);
  float belt = 0.8 + 0.3 * smoothstep(0.35, 0.65, lat) - 0.3 * smoothstep(0.12, 0.28, lat) * (1.0 - smoothstep(0.3, 0.42, lat));
  float wisps = fbm5(vec3(p.x * 7.0, p.y * 16.0, p.z * 7.0) + w * 2.5);
  float cloud = smoothstep(0.08, 0.55, c * belt + wisps * 0.22) * 0.9;

  float h = landHeight(p);
  float land = smoothstep(0.0, 0.012, h);
  float elev = smoothstep(0.0, 0.35, h);
  float cities = smoothstep(0.7, 1.0, snoise(p * 90.0) * 0.5 + 0.5 + snoise(p * 13.0) * 0.3);
  cities *= land * smoothstep(0.02, 0.2, 1.0 - elev) * (1.0 - smoothstep(0.6, 0.75, lat));
  cities *= smoothstep(0.35, 0.75, fbm3(p * 4.0 + 30.0) * 0.5 + 0.5);
  gl_FragColor = vec4(cloud, cities, 0.0, 1.0);
}
`;

/* ---- per-frame lighting (cheap: texture lookups + a few dot products) ---- */

export const PLANET_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uAtmo;
uniform float uAtmoK;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  vec3 col = texture2D(uMap, vUv).rgb;
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(-vPosW);                 // the Sun sits at the origin
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, L);
  float dif = smoothstep(-0.12, 1.0, ndl);
  float fres = pow(max(1.0 - max(dot(N, V), 0.0), 0.0), 3.0);
  float day = smoothstep(-0.2, 0.4, ndl);
  vec3 lin = toLin(col) * (0.004 + 1.25 * dif) + toLin(uAtmo) * fres * uAtmoK * day * 0.8;
  lin += toLin(vec3(0.72, 0.66, 1.0)) * fres * 0.06;   // faint lavender rim, so night sides still read against space
  gl_FragColor = vec4(lin, 1.0);
}
`;

export const EARTH_FRAG = /* glsl */ `
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  vec4 A = texture2D(uA, vUv);
  vec2 cuv = vUv + vec2(uTime * 0.0016, 0.0);        // clouds drift over the ground
  float cl = texture2D(uB, cuv).r;
  float shadow = texture2D(uB, cuv + vec2(0.003, 0.002)).r;
  float cities = texture2D(uB, vUv).g;
  vec3 col = A.rgb * (1.0 - 0.45 * shadow * (1.0 - cl));

  vec3 N = normalize(vNormalW);
  vec3 L = normalize(-vPosW);
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, L);
  float dif = smoothstep(-0.08, 1.0, ndl);
  vec3 H = normalize(L + V);
  float glintMask = A.a * (1.0 - cl);
  float spec = (pow(max(dot(N, H), 0.0), 120.0) * 1.6 + pow(max(dot(N, H), 0.0), 18.0) * 0.12) * glintMask;

  vec3 lin = toLin(col) * 1.35 * dif;
  lin = mix(lin, toLin(vec3(0.97, 0.98, 1.0)) * (0.02 + 1.4 * dif), cl * 0.85);
  lin += vec3(1.0, 0.92, 0.8) * spec * smoothstep(0.0, 0.2, ndl);
  float night = 1.0 - smoothstep(-0.25, -0.05, ndl);
  lin += vec3(1.0, 0.66, 0.34) * cities * night * (1.0 - cl * 0.9) * 0.22;

  float mu = max(dot(N, V), 0.0);
  float limb = pow(max(1.0 - mu, 0.0), 2.2);
  float term = exp(-(ndl * 4.0) * (ndl * 4.0));
  vec3 sky = mix(vec3(0.30, 0.55, 1.0), vec3(1.0, 0.55, 0.30), term * 0.6);
  lin += toLin(sky) * limb * smoothstep(-0.25, 0.45, ndl) * 0.4;
  gl_FragColor = vec4(lin, 1.0);
}
`;

// thin glowing shell around a planet (rendered on the back faces of a slightly larger sphere)
export const ATMO_VERT = /* glsl */ `
varying vec3 vPosW;
varying vec3 vCenter;
void main(){
  vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPosW, 1.0);
}
`;

// glow outside the planet's edge: strongest at the surface, fading with height, brighter on the day side
export const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uR;        // planet radius
uniform float uH;        // glow height (fraction of the radius)
uniform float uK;
varying vec3 vPosW;
varying vec3 vCenter;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  vec3 rd = (vPosW - cameraPosition) / max(length(vPosW - cameraPosition), 1e-5);
  vec3 oc = vCenter - cameraPosition;
  float tc = dot(oc, rd);
  vec3 closest = cameraPosition + rd * tc;            // point on the view ray nearest the planet centre
  float b = length(closest - vCenter) / uR;            // 1 = exactly at the planet's edge
  float glow = exp(-max(b - 1.0, 0.0) / uH) * smoothstep(1.0 + uH * 5.0, 1.0, b);
  vec3 up = (closest - vCenter) / max(length(closest - vCenter), 1e-5);
  vec3 L = normalize(-vCenter);
  float day = smoothstep(-0.35, 0.45, dot(up, L));
  float sunset = exp(-(dot(up, L) * 3.5) * (dot(up, L) * 3.5));
  vec3 col = mix(toLin(uColor), toLin(vec3(1.0, 0.6, 0.35)), sunset * 0.45);
  gl_FragColor = vec4(col * glow * day * uK, 1.0);
}
`;

export const SUN_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
void main(){
  vObj = position;
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const SUN_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
${COMMON}
void main(){
  vec3 p = normalize(vObj);
  float n = fbm5(p * 4.0 + vec3(0.0, 0.0, uTime * 0.05)) * 0.5 + 0.5;
  float gran = 1.0 - abs(snoise(p * 14.0 + uTime * 0.08));
  vec3 col = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.80, 0.45), n);
  col = mix(col, vec3(1.0, 0.95, 0.80), gran * gran * 0.35);
  float mu = max(dot(normalize(vN), normalize(vV)), 0.0);
  col *= 0.55 + 0.6 * sqrt(max(mu, 0.0));                 // limb darkening
  gl_FragColor = vec4(toLin(col) * 6.0, 1.0);       // HDR: this is what blooms
}
`;

export const RING_VERT = /* glsl */ `
varying float vRad;
varying vec3 vPosW;
varying vec3 vNW;
void main(){
  vRad = length(position.xy);
  vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
  vNW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RING_FRAG = /* glsl */ `
uniform vec2 uRadii;
varying float vRad;
varying vec3 vPosW;
varying vec3 vNW;
${COMMON}
void main(){
  float t = clamp((vRad - uRadii.x) / (uRadii.y - uRadii.x), 0.0, 1.0);
  float b = (snoise(vec3(t * 60.0, 1.7, 0.0)) * 0.5 + 0.5) * 0.6 + (snoise(vec3(t * 120.0, 4.1, 0.0)) * 0.5 + 0.5) * 0.4;
  float a = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.93, 1.0, t));
  a *= 1.0 - (1.0 - smoothstep(0.0, 0.03, abs(t - 0.62))) * 0.92;   // Cassini division
  a *= (0.25 + 0.75 * b * b) * 0.6;
  vec3 col = mix(vec3(0.62, 0.54, 0.40), vec3(0.93, 0.86, 0.70), b);
  vec3 L = normalize(-vPosW);
  float lit = 0.25 + 0.75 * abs(dot(vNW, L));
  gl_FragColor = vec4(toLin(col) * lit * a, a);
}
`;

/* ----------------------------------- warp streaks ---------------------------------- */

export const STREAK_VERT = /* glsl */ `
attribute vec2 aXY;
attribute float aZ;
attribute float aSpd;
attribute vec3 aCol;
attribute float aW;
uniform float uTravel;
uniform float uStretch;
uniform vec2 uRes;
uniform float uPR;
varying vec3 vCol;
varying float vAlong;
varying float vSide;
varying float vFade;
const float LEN = 420.0;
void main(){
  // streaks live in camera space and run parallel to the view axis, so they always fly straight at the viewer
  float zh = -mod(aZ - uTravel * aSpd, LEN) - 1.5;
  float zt = zh - (0.05 + uStretch * aSpd);
  float z = mix(zt, zh, position.y);
  vec2 perp = normalize(vec2(-aXY.y, aXY.x));
  float f = projectionMatrix[1][1];
  float wpx = aW * uPR * clamp(40.0 / -zh, 0.7, 3.5);
  float halfW = wpx * (-z) / (f * uRes.y);          // half the width, in camera-space units at this depth
  vec3 v = vec3(aXY + perp * position.x * halfW, z);
  gl_Position = projectionMatrix * vec4(v, 1.0);
  vCol = aCol;
  vAlong = position.y;
  vSide = position.x;
  vFade = (1.0 - smoothstep(LEN * 0.2, LEN * 0.75, -zh)) * smoothstep(1.5, 10.0, -zh);  // far-away stars stay faint, so the centre doesn't white out
}
`;

export const STREAK_FRAG = /* glsl */ `
uniform float uIntensity;
uniform float uShape;      // 0 = round dot, 1 = streak with a fading tail
varying vec3 vCol;
varying float vAlong;
varying float vSide;
varying float vFade;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  float across = 1.0 - vSide * vSide;
  float a = across * across * mix(1.0, pow(clamp(vAlong, 0.0, 1.0) + 1e-4, 1.4), uShape) * vFade * uIntensity;
  gl_FragColor = vec4(min(toLin(vCol) * a * 1.15, vec3(4.0)), 1.0);
}
`;

// soft glow in the middle of the tunnel and the flash that hides the jump between scenes
export const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const GLOW_FRAG = /* glsl */ `
uniform float uGlow;
uniform float uFlash;
uniform float uAspect;
varying vec2 vUv;
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
void main(){
  vec2 p = vUv * vec2(uAspect, 1.0);
  float r = length(p);
  vec3 tunnel = toLin(vec3(0.42, 0.40, 0.85)) * exp(-r * 2.6) * 0.55 + toLin(vec3(0.85, 0.9, 1.0)) * exp(-r * 9.0) * 0.6;
  vec3 flash = toLin(vec3(0.85, 0.9, 1.0)) * (0.35 + 0.65 * exp(-r * 1.5));
  gl_FragColor = vec4(tunnel * uGlow + flash * uFlash, 1.0);
}
`;

export const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0.0025 }, uGrain: { value: 0.0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uCA;
    uniform float uGrain;
    varying vec2 vUv;
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 c = vUv - 0.5;
      vec2 off = c * dot(c, c) * uCA * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(0.004, 0.003, 0.012) * (1.0 - smoothstep(0.0, 0.08, l));   // lift the blacks toward indigo
      float g = h(gl_FragCoord.xy + fract(uTime * 7.31) * 517.0) - 0.5;
      col += g * uGrain * (0.02 + sqrt(max(l, 0.0)) * 0.25);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

// Safety net before the glow pass: any NaN / infinite / absurdly bright pixel (which some GPUs produce where
// thousands of additive particles overlap) would be smeared over the whole screen by the bloom blur and show
// up as a one-frame black flash. This replaces such pixels and caps brightness.
export const SANITIZE_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    float fix1(float v){
      bool bad = isnan(v) || isinf(v) || !(v == v) || v > 1.0e4 || v < -1.0e4;   // NaN or infinity
      return bad ? 0.0 : clamp(v, 0.0, 40.0);
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      gl_FragColor = vec4(fix1(c.r), fix1(c.g), fix1(c.b), 1.0);
    }
  `,
};
