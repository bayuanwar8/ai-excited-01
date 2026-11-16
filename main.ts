// ai-excited-01 entry v3: THE WAR OF SUN AND DRAGON.
// The three-legged crow (Yatagarasu), manifestation of the sun, clashes with
// the cosmic dragon, ruler of darkness. Two forces of nature collide in one
// epic composition: blazing gold on one side, deep indigo dark on the other,
// a burst of light where they meet. No text anywhere in the image.
// Drawn from scratch in pure Node stdlib: a tiny software rasterizer plus a
// hand-rolled PNG encoder (zlib deflate + CRC32). Fully deterministic: a
// fixed seed drives every scattered ember and star, so two runs are
// byte-identical. Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------- deterministic random ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261117);

// ---------- framebuffer (RGB, opaque) ----------
const img = new Uint8ClampedArray(W * H * 3);

function setPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = r; img[i + 1] = g; img[i + 2] = b;
}
function blendPx(x, y, r, g, b, a) {
  if (a <= 0) return;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  if (a >= 1) { img[i] = r; img[i + 1] = g; img[i + 2] = b; return; }
  img[i] += (r - img[i]) * a;
  img[i + 1] += (g - img[i + 1]) * a;
  img[i + 2] += (b - img[i + 2]) * a;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- primitives ----------
// Soft-edged filled disc. feather = width of the anti-aliased rim.
function disc(cx, cy, rad, col, alpha = 1, feather = 1.5) {
  const x0 = Math.max(0, Math.floor(cx - rad - feather));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad + feather));
  const y0 = Math.max(0, Math.floor(cy - rad - feather));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad + feather));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > rad + feather) continue;
      const a = alpha * clamp((rad + feather - d) / feather, 0, 1);
      blendPx(x, y, col[0], col[1], col[2], a);
    }
  }
}

// Even-odd scanline polygon fill.
function poly(pts, col, alpha = 1) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));
  const n = pts.length;
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) blendPx(x, y, col[0], col[1], col[2], alpha);
    }
  }
}

// Thick polyline drawn as overlapping discs (smooth round joins).
function stroke(pts, width, col, alpha = 1) {
  const r = width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const x0 = pts[i][0];
    const y0 = pts[i][1];
    const x1 = pts[i + 1][0];
    const y1 = pts[i + 1][1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (r * 0.7)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, col, alpha, 0.8);
    }
  }
}

// Points along a quadratic bezier.
function qbezPts(p0, p1, p2, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
  return pts;
}

// Ellipse outline as a point ring (for poly fill).
function ellipsePts(cx, cy, rx, ry, rotDeg, n = 48) {
  const rot = (rotDeg * Math.PI) / 180;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ex = Math.cos(t) * rx;
    const ey = Math.sin(t) * ry;
    pts.push([cx + ex * cr - ey * sr, cy + ex * sr + ey * cr]);
  }
  return pts;
}

// ---------- PNG encoder (stdlib zlib + hand-rolled CRC32) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- palette ----------
const INK = [8, 8, 18]; // crow black
const GOLD = [255, 190, 60];
const GOLD_DEEP = [255, 150, 40];
const SUN_CORE = [255, 244, 200];
const DRAGON = [38, 28, 86]; // dark violet body
const DRAGON_BELLY = [96, 78, 190];
const DRAGON_RIM = [150, 120, 255];
const DRAGON_SCALE = [110, 90, 210];
const EYE_CYAN = [125, 249, 255];

// ---------- sky: warm gold near the sun (top-left) to deep indigo dark ----------
function drawSky() {
  const A = [40, 17, 4];
  const B = [10, 6, 24];
  const C = [5, 3, 13];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = (x * 0.45 + y * 0.55) / 1024;
      let r;
      let g;
      let b;
      if (d < 0.5) {
        const t = d / 0.5;
        r = lerp(A[0], B[0], t); g = lerp(A[1], B[1], t); b = lerp(A[2], B[2], t);
      } else {
        const t = (d - 0.5) / 0.5;
        r = lerp(B[0], C[0], t); g = lerp(B[1], C[1], t); b = lerp(B[2], C[2], t);
      }
      // warm glow radiating from the sun position (290, 290)
      const dx = x - 290;
      const dy = y - 290;
      const glow = Math.exp(-(dx * dx + dy * dy) / (2 * 300 * 300)) * 62;
      setPx(x, y, clamp(r + glow, 0, 255), clamp(g + glow * 0.62, 0, 255), clamp(b + glow * 0.22, 0, 255));
    }
  }
  // stars on the dark side
  for (let i = 0; i < 170; i++) {
    const x = 380 + rand() * 644;
    const y = rand() * 1024;
    if (x * 0.45 + y * 0.55 < 620) continue; // keep stars out of the sun glow
    const a = 0.25 + rand() * 0.7;
    const r = 1 + rand() * 1.3;
    disc(x, y, r, rand() < 0.25 ? [170, 220, 255] : [255, 255, 255], a, 0.8);
  }
  // violet nebula wash behind the dragon side
  disc(830, 210, 240, [70, 50, 160], 0.10, 90);
  disc(880, 520, 200, [60, 40, 150], 0.08, 80);
  disc(700, 860, 220, [50, 35, 130], 0.07, 90);
}

// ---------- the sun: blazing disc + rays ----------
function drawSun() {
  disc(290, 290, 330, [255, 170, 40], 0.16, 70); // halo
  // rays
  for (let i = 0; i < 12; i++) {
    const ang = (i * 30 + (i % 2) * 9) * Math.PI / 180;
    const len = i % 2 ? 250 : 310;
    const w = 13;
    const bx = 290 + Math.cos(ang) * 150;
    const by = 290 + Math.sin(ang) * 150;
    const tx = 290 + Math.cos(ang) * len;
    const ty = 290 + Math.sin(ang) * len;
    const px = -Math.sin(ang) * w;
    const py = Math.cos(ang) * w;
    poly([[bx + px, by + py], [tx, ty], [bx - px, by - py]], [255, 180, 50], 0.5);
  }
  disc(290, 290, 175, [255, 190, 60], 0.95, 3);
  disc(290, 290, 140, [255, 220, 120], 1, 3);
  disc(290, 290, 95, SUN_CORE, 1, 2);
  // bright rim
  const ring = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    ring.push([290 + Math.cos(t) * 176, 290 + Math.sin(t) * 176]);
  }
  stroke(ring, 5, [255, 240, 190], 0.8);
}

// ---------- the collision burst (drawn BEFORE the creatures, so their
// legs, talons and the dragon's head stay visible silhouetted on the glow) ----------
function drawBurst() {
  const cx = 615;
  const cy = 515;
  disc(cx, cy, 180, [255, 180, 60], 0.22, 50); // outer glow
  disc(cx, cy, 100, [255, 150, 40], 0.75, 8);
  for (let i = 0; i < 16; i++) {
    const ang = (i * 22.5 + (i % 2) * 8) * Math.PI / 180;
    const len = i % 2 ? 130 : 190;
    const bx = cx + Math.cos(ang) * 60;
    const by = cy + Math.sin(ang) * 60;
    const tx = cx + Math.cos(ang) * len;
    const ty = cy + Math.sin(ang) * len;
    const px = -Math.sin(ang) * 9;
    const py = Math.cos(ang) * 9;
    poly([[bx + px, by + py], [tx, ty], [bx - px, by - py]], [255, 200, 80], 0.65);
  }
  disc(cx, cy, 48, [255, 240, 190], 1, 4);
  disc(cx, cy, 26, [255, 255, 255], 1, 2);
  for (const rr of [120, 160]) {
    const ring = [];
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      ring.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
    }
    stroke(ring, 4, GOLD, 0.5);
  }
  // embers flying out of the collision
  for (let i = 0; i < 130; i++) {
    const ang = rand() * Math.PI * 2;
    const d = 90 + rand() * 240;
    const x = cx + Math.cos(ang) * d;
    const y = cy + Math.sin(ang) * d;
    const col = rand() < 0.3 ? [255, 255, 255] : rand() < 0.5 ? [255, 190, 60] : [255, 120, 30];
    disc(x, y, 1.5 + rand() * 2.5, col, 0.4 + rand() * 0.6, 0.8);
  }
}

// ---------- the three-legged crow (Yatagarasu) ----------
// Dives from the sun toward the burst. Black silhouette with a gold rim on
// the sun side. One solid swept wing (not finger-like feathers), a head that
// clearly protrudes with its beak aimed at the burst, and THREE legs,
// clearly separated, talons gripping lightning.
const WING = [[420, 320], [330, 210], [240, 140], [185, 105], [225, 175], [205, 190], [265, 240], [245, 258], [320, 300], [305, 318], [400, 345]];
function crowPartGold(shiftX, shiftY) {
  // gold under-copy, shifted toward the sun so a gold crescent shows
  const g = (pts) => poly(pts.map((p) => [p[0] + shiftX, p[1] + shiftY]), GOLD, 1);
  g(WING);
  // tail feathers trailing back
  for (const ang of [-162, -147, -132]) {
    const rad = (ang * Math.PI) / 180;
    const cx = 330 + Math.cos(rad) * 52;
    const cy = 385 + Math.sin(rad) * 52;
    g(ellipsePts(cx, cy, 95, 14, ang));
  }
  g(ellipsePts(430, 345, 140, 55, -28)); // body
  g(ellipsePts(565, 420, 42, 38, -20)); // head
}
function crowPartBlack() {
  poly(WING, INK, 1);
  for (const ang of [-162, -147, -132]) {
    const rad = (ang * Math.PI) / 180;
    const cx = 330 + Math.cos(rad) * 52;
    const cy = 385 + Math.sin(rad) * 52;
    poly(ellipsePts(cx, cy, 95, 14, ang), INK, 1);
  }
  poly(ellipsePts(430, 345, 140, 55, -28), INK, 1); // body
  poly(ellipsePts(565, 420, 42, 38, -20), INK, 1); // head
  // long beak, pointed down-right at the burst
  poly([[592, 402], [618, 488], [568, 438]], INK, 1);
  stroke([[594, 406], [612, 480]], 3, GOLD, 0.9); // gold beak edge
  // eye: gold glint
  disc(572, 408, 6, [255, 200, 60], 1, 1);
  disc(573, 408, 2.5, [0, 0, 0], 1, 0.5);
}
function crowLegs() {
  // three legs, clearly separated and spread wide so all three read even
  // at 300px, talons open around the lightning
  const legs = [
    { from: [472, 392], mid: [510, 425], foot: [545, 450] },
    { from: [498, 408], mid: [535, 455], foot: [575, 495] },
    { from: [522, 418], mid: [565, 465], foot: [615, 505] },
  ];
  for (const leg of legs) {
    stroke([leg.from, leg.mid, leg.foot], 11, INK, 1);
    // three gold talon claws fanning from each foot
    for (const [dx, dy] of [[16, 13], [5, 18], [-8, 16]]) {
      stroke([[leg.foot[0], leg.foot[1]], [leg.foot[0] + dx, leg.foot[1] + dy]], 3, GOLD, 1);
    }
  }
}
function drawCrow() {
  crowPartGold(-7, -7);
  crowPartBlack();
  crowLegs();
}

// ---------- the cosmic dragon ----------
// Serpentine body coiling in from the dark lower-right toward the burst.
function dragonSpine() {
  const segs = [
    [[980, 990], [840, 910], [790, 770]],
    [[790, 770], [900, 660], [820, 560]],
    [[820, 560], [730, 470], [700, 470]],
  ];
  const pts = [];
  for (const [p0, p1, p2] of segs) pts.push(...qbezPts(p0, p1, p2, 20));
  return pts;
}
function drawDragon() {
  const pts = dragonSpine();
  const n = pts.length;
  // dark outline ribbon so the body reads against the sky
  for (let i = 0; i < n; i++) {
    const r = lerp(58, 30, i / (n - 1)) + 5;
    disc(pts[i][0], pts[i][1], r, [16, 10, 44], 1, 2);
  }
  // tapering body: thick discs, tail thick, neck thinner
  for (let i = 0; i < n; i++) {
    const r = lerp(58, 30, i / (n - 1));
    disc(pts[i][0], pts[i][1], r, DRAGON, 1, 2);
  }
  // belly highlight along the inner curve
  const belly = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    const r = lerp(58, 30, i / (n - 1));
    belly.push([pts[i][0] + (-ty / len) * r * 0.35, pts[i][1] + (tx / len) * r * 0.35]);
  }
  stroke(belly, 22, DRAGON_BELLY, 0.7);
  // scales: faint dots along the body
  for (let i = 0; i < 70; i++) {
    const idx = Math.floor(rand() * n);
    const r = lerp(58, 30, idx / (n - 1));
    const off = (rand() - 0.5) * r * 1.4;
    disc(pts[idx][0] + off, pts[idx][1] + (rand() - 0.5) * r, 2 + rand() * 2.5, DRAGON_SCALE, 0.3, 1);
  }
  // spine spikes on the outer edge
  for (let i = 6; i < n - 4; i += 7) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    const r = lerp(58, 30, i / (n - 1));
    const ox = (ty / len) * r;
    const oy = (-tx / len) * r;
    const bx = pts[i][0] + ox;
    const by = pts[i][1] + oy;
    poly([[bx - 8, by - 4], [bx + ox * 0.55, by + oy * 0.55], [bx + 8, by + 4]], [20, 14, 52], 1);
  }
  // claws: two small feet gripping along the body
  for (const [fx, fy, dir] of [[830, 600, 1], [790, 760, -1]]) {
    for (const off of [-14, 0, 14]) {
      stroke([[fx + off * 0.4, fy], [fx + off * 0.4 + dir * 22, fy + 26]], 4, [16, 10, 44], 1);
      disc(fx + off * 0.4 + dir * 22, fy + 26, 2.5, GOLD, 1, 0.5);
    }
  }
  // head: big horned wedge pointing at the burst, jaw open, mouth glowing
  disc(628, 492, 16, [255, 120, 30], 0.9, 4); // mouth glow first
  poly([[700, 470], [640, 448], [600, 470], [618, 500], [660, 512], [700, 500]], DRAGON, 1); // skull
  poly([[660, 512], [618, 500], [598, 518], [628, 534], [668, 528]], DRAGON, 1); // lower jaw
  // horns sweeping back
  stroke(qbezPts([672, 452], [724, 414], [772, 420], 16), 9, DRAGON_RIM, 1);
  stroke(qbezPts([688, 464], [738, 442], [780, 458], 16), 8, DRAGON_RIM, 1);
  // teeth
  for (const [tx, ty] of [[622, 476], [636, 482], [650, 490]]) {
    poly([[tx - 4, ty], [tx + 4, ty + 2], [tx, ty + 10]], [255, 255, 255], 1);
  }
  // whiskers trailing back from the snout
  stroke(qbezPts([606, 482], [560, 450], [518, 442], 16), 3, DRAGON_RIM, 0.8);
  stroke(qbezPts([610, 500], [568, 524], [528, 536], 16), 3, DRAGON_RIM, 0.8);
  // glowing cyan eye with slit pupil
  disc(652, 478, 18, EYE_CYAN, 0.25, 6);
  disc(652, 478, 9, EYE_CYAN, 1, 1);
  stroke([[652, 470], [652, 486]], 3, [0, 0, 0], 1);
  disc(612, 474, 3, [255, 140, 40], 1, 0.5); // nostril ember
}

// ---------- lightning the crow hurls ----------
function drawBolt() {
  const bolt = [[575, 492], [600, 515], [578, 540], [602, 565], [590, 595]];
  stroke(bolt, 10, GOLD_DEEP, 0.95);
  stroke(bolt, 4, [255, 250, 220], 1);
}

// ---------- foreground: mountain ridges + a small torii for scale ----------
function drawForeground() {
  poly([[0, 1024], [0, 950], [180, 905], [380, 955], [560, 910], [760, 960], [1024, 920], [1024, 1024]], [8, 5, 18], 1);
  poly([[0, 1024], [0, 990], [240, 960], [480, 1000], [720, 965], [1024, 995], [1024, 1024]], [5, 3, 12], 1);
  // torii gate, tiny and dark, bottom centre
  const TORII = [22, 14, 40];
  poly([[470, 1000], [470, 940], [482, 940], [482, 1000]], TORII, 1);
  poly([[542, 1000], [542, 940], [554, 940], [554, 1000]], TORII, 1);
  poly([[455, 938], [569, 938], [560, 952], [464, 952]], TORII, 1);
  poly([[468, 962], [556, 962], [556, 972], [468, 972]], TORII, 1);
  stroke([[455, 938], [569, 938]], 2, GOLD, 0.5);
}

// ---------- vignette: darken the corners so the centre hits harder ----------
function vignette() {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 512, y - 512) / 724;
      const f = 1 - 0.28 * smooth(0.55, 1.0, d);
      const i = (y * W + x) * 3;
      img[i] *= f; img[i + 1] *= f; img[i + 2] *= f;
    }
  }
}

// ---------- build the image ----------
// Order matters: the burst glows BEHIND the fighters, so the crow's three
// legs, the lightning and the dragon's head stay visible silhouetted on it.
drawSky();
drawSun();
drawBurst();
drawDragon();
drawCrow();
drawBolt();
drawForeground();
vignette();

mkdirSync(OUT, { recursive: true });
const png = encodePNG();
writeFileSync(join(OUT, 'entry.png'), png);
console.log(`wrote ${join(OUT, 'entry.png')} ${png.length} bytes ${W}x${H}`);
