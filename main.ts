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
// legs, talons and the dragon's head stay visible silhouetted on the glow).
// Deliberately NO circles and NO rings: an irregular starburst with wildly
// varying ray lengths and a soft feathered core, so it can never read as a
// target or a second sun. ----------
function drawBurst() {
  const cx = 615;
  const cy = 515;
  disc(cx, cy, 210, [255, 180, 60], 0.20, 70); // outer glow, soft
  disc(cx, cy, 115, [255, 150, 40], 0.45, 30); // mid glow, soft
  // irregular rays: fixed lengths, angles and widths, no two alike
  const rays = [
    { a: -168, l: 150, w: 12 }, { a: -142, l: 235, w: 9 }, { a: -118, l: 125, w: 16 },
    { a: -96, l: 260, w: 10 }, { a: -70, l: 165, w: 18 }, { a: -44, l: 240, w: 8 },
    { a: -20, l: 140, w: 15 }, { a: 4, l: 275, w: 9 }, { a: 28, l: 155, w: 17 },
    { a: 52, l: 225, w: 10 }, { a: 78, l: 135, w: 14 }, { a: 102, l: 250, w: 9 },
    { a: 128, l: 170, w: 16 }, { a: 154, l: 215, w: 11 },
  ];
  for (const r of rays) {
    const ang = (r.a * Math.PI) / 180;
    const bx = cx + Math.cos(ang) * 55;
    const by = cy + Math.sin(ang) * 55;
    const tx = cx + Math.cos(ang) * r.l;
    const ty = cy + Math.sin(ang) * r.l;
    const px = -Math.sin(ang) * r.w;
    const py = Math.cos(ang) * r.w;
    poly([[bx + px, by + py], [tx, ty], [bx - px, by - py]], [255, 200, 80], 0.6);
  }
  // hot core: soft and feathered, no hard rim
  disc(cx, cy, 72, [255, 230, 150], 0.95, 18);
  disc(cx, cy, 38, [255, 255, 255], 1, 10);
  // gold shards flying out of the collision
  const shards = [
    [[700, 420], [760, 380], [742, 428]],
    [[540, 430], [500, 372], [556, 446]],
    [[700, 610], [762, 648], [716, 566]],
    [[530, 600], [478, 652], [556, 566]],
    [[760, 500], [838, 500], [768, 534]],
    [[470, 520], [396, 540], [478, 556]],
  ];
  for (const s of shards) poly(s, [255, 205, 90], 0.9);
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
// Dives from the sun toward the burst: one coherent bird, not a blob.
// Sleek body angled nose-down, a BIG head with a long beak aimed at the
// dragon, a tall notched wing, a fanned tail, and THREE thick legs with
// gold rims and gold talons, fanned wide and backlit on the burst glow so
// each leg counts even at 300px.
const CROW_BODY = { cx: 450, cy: 355, rx: 140, ry: 56, rot: -25 };
const CROW_HEAD = { cx: 568, cy: 422, rx: 58, ry: 52, rot: -25 };
const CROW_WING_UP = [[440, 320], [395, 225], [360, 150], [400, 180], [445, 245], [485, 305], [520, 360]];
const CROW_WING_LOW = [[455, 400], [380, 465], [305, 515], [335, 498], [360, 518], [390, 495], [425, 465]];
const CROW_BEAK = [[612, 400], [685, 500], [622, 462]];
// Solid tail fan (one piece, two shallow notches): a fan of separate
// feathers read as a hand on the bright sun, a solid fan reads as a tail.
const CROW_TAIL = [[340, 285], [240, 230], [220, 245], [255, 265], [235, 280], [270, 295], [255, 315], [310, 325], [345, 320]];
function crowBodyShapes(col, dx, dy) {
  const shift = (pts) => pts.map((p) => [p[0] + dx, p[1] + dy]);
  poly(shift(CROW_WING_UP), col, 1);
  poly(shift(CROW_WING_LOW), col, 1);
  poly(shift(CROW_TAIL), col, 1);
  poly(ellipsePts(CROW_BODY.cx + dx, CROW_BODY.cy + dy, CROW_BODY.rx, CROW_BODY.ry, CROW_BODY.rot), col, 1);
  poly(ellipsePts(CROW_HEAD.cx + dx, CROW_HEAD.cy + dy, CROW_HEAD.rx, CROW_HEAD.ry, CROW_HEAD.rot), col, 1);
  poly(shift(CROW_BEAK), col, 1);
}
function crowLegs() {
  // three legs: thick black bars with a gold rim (a wider gold under-stroke
  // beneath the black stroke), fanned wide, talons open around the bolt.
  // Each leg is ~21px wide with ~60px gaps: countable even at 300px.
  const legs = [
    { from: [478, 420], mid: [500, 485], foot: [530, 545] },
    { from: [512, 432], mid: [558, 500], foot: [608, 565] },
    { from: [545, 438], mid: [625, 500], foot: [700, 545] },
  ];
  for (const leg of legs) {
    stroke([leg.from, leg.mid, leg.foot], 30, GOLD, 1);
    stroke([leg.from, leg.mid, leg.foot], 21, INK, 1);
    // three gold talon claws fanning from each foot
    for (const [dx, dy] of [[-24, 16], [0, 27], [24, 15]]) {
      stroke([[leg.foot[0], leg.foot[1]], [leg.foot[0] + dx, leg.foot[1] + dy]], 5, GOLD, 1);
    }
  }
}
function drawCrow() {
  crowBodyShapes(GOLD, -9, -9); // gold under-copy, shifted toward the sun: a gold rim
  // gold under-beak, slightly larger than the black beak: a gold outline
  poly([[606, 396], [692, 504], [620, 468]], GOLD, 1);
  crowBodyShapes(INK, 0, 0);
  // gold lower edge of the beak
  stroke([[625, 455], [680, 495]], 3, GOLD, 0.9);
  // eye: gold glint, big enough to read
  disc(578, 408, 8, [255, 200, 60], 1, 1);
  disc(579, 408, 3.5, [0, 0, 0], 1, 0.5);
  crowLegs();
}

// ---------- the cosmic dragon ----------
// A dragon, not a worm: a segmented armored body (dark separator bands,
// pale segmented belly, tall gold-tipped dorsal spines), a thick muscular
// mid-body tapering to neck and tail, a BIG horned head with an open
// glowing jaw and fangs, and two clawed legs reaching for the fight.
function dragonSpine() {
  const segs = [
    [[990, 1005], [860, 920], [800, 790]],
    [[800, 790], [910, 680], [840, 570]],
    [[840, 570], [820, 550], [800, 545]],
  ];
  const pts = [];
  for (const [p0, p1, p2] of segs) pts.push(...qbezPts(p0, p1, p2, 20));
  return pts;
}
function dragonRadius(t) {
  // muscular mid-body, tapering to neck and tail
  return 26 + 40 * Math.pow(Math.sin(Math.PI * clamp(0.05 + 0.95 * t, 0, 1)), 0.8);
}
function drawDragon() {
  const pts = dragonSpine();
  const n = pts.length;
  const rad = (i) => dragonRadius(i / (n - 1));
  const tangent = (i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    return [tx / len, ty / len];
  };
  // dark outline ribbon so the body reads against the sky
  for (let i = 0; i < n; i++) disc(pts[i][0], pts[i][1], rad(i) + 6, [16, 10, 44], 1, 2);
  // tapering body
  for (let i = 0; i < n; i++) disc(pts[i][0], pts[i][1], rad(i), DRAGON, 1, 2);
  // rim light on the burst side (upper-right edge)
  const rim = [];
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tangent(i);
    rim.push([pts[i][0] + (-ty) * rad(i) * 0.75, pts[i][1] + tx * rad(i) * 0.75]);
  }
  stroke(rim, 5, DRAGON_RIM, 0.5);
  // armor segment separators: dark bands across the body
  for (let i = 6; i < n - 2; i += 12) {
    const [tx, ty] = tangent(i);
    const r = rad(i);
    stroke(
      [[pts[i][0] - ty * r * 0.95, pts[i][1] + tx * r * 0.95], [pts[i][0] + ty * r * 0.95, pts[i][1] - tx * r * 0.95]],
      7, [20, 12, 50], 0.9,
    );
  }
  // pale segmented belly along the lower-left side
  const belly = [];
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tangent(i);
    belly.push([pts[i][0] + ty * rad(i) * 0.45, pts[i][1] - tx * rad(i) * 0.45]);
  }
  stroke(belly, 26, [150, 130, 235], 0.8);
  for (let i = 6; i < n - 2; i += 12) {
    const [tx, ty] = tangent(i);
    const r = rad(i);
    const bx = pts[i][0] + ty * r * 0.45;
    const by = pts[i][1] - tx * r * 0.45;
    stroke(
      [[bx - ty * r * 0.4, by + tx * r * 0.4], [bx + ty * r * 0.4, by - tx * r * 0.4]],
      5, [30, 20, 70], 0.9,
    );
  }
  // dorsal spines: tall triangles with gold tips along the upper-right edge
  for (let i = 4; i < n - 2; i += 9) {
    const [tx, ty] = tangent(i);
    const r = rad(i);
    const nx = -ty;
    const ny = tx;
    const bx = pts[i][0] + nx * r * 0.8;
    const by = pts[i][1] + ny * r * 0.8;
    const tipx = pts[i][0] + nx * (r + 36);
    const tipy = pts[i][1] + ny * (r + 36);
    poly([[bx - tx * 10, by - ty * 10], [tipx, tipy], [bx + tx * 10, by + ty * 10]], [22, 14, 54], 1);
    poly(
      [[tipx - tx * 5 - nx * 10, tipy - ty * 5 - ny * 10], [tipx, tipy], [tipx + tx * 5 - nx * 10, tipy + ty * 5 - ny * 10]],
      GOLD, 1,
    );
  }
  // tail spade
  const tp = pts[0];
  const [ttx, tty] = tangent(0);
  poly(
    [[tp[0] - tty * 16, tp[1] + ttx * 16], [tp[0] - ttx * 60, tp[1] - tty * 60], [tp[0] + tty * 16, tp[1] - ttx * 16]],
    [22, 14, 54], 1,
  );
  // clawed legs: gold-rimmed limbs reaching for the fight, big gold claws
  const dragonLegs = [
    { from: [795, 575], mid: [760, 625], foot: [730, 670] },
    { from: [830, 720], mid: [800, 770], foot: [770, 815] },
  ];
  for (const leg of dragonLegs) {
    stroke([leg.from, leg.mid, leg.foot], 30, GOLD, 1);
    stroke([leg.from, leg.mid, leg.foot], 22, DRAGON, 1);
    stroke([[leg.from[0] + 6, leg.from[1]], [leg.mid[0] + 6, leg.mid[1]], [leg.foot[0] + 6, leg.foot[1]]], 8, DRAGON_BELLY, 0.7);
    for (const [dx, dy] of [[-30, 8], [-16, 26], [2, 30], [20, 22]]) {
      stroke([[leg.foot[0], leg.foot[1]], [leg.foot[0] + dx, leg.foot[1] + dy]], 5, GOLD, 1);
    }
  }
  // head: BIG angular skull, open glowing jaw, fangs, branched horns.
  // Kept clear of the crow's beak tip (678, 498): the snout stops at
  // (725, 525) with a gap of bright burst glow between the two fighters.
  disc(765, 560, 18, [255, 90, 25], 0.85, 5); // mouth glow first
  poly([[725, 525], [770, 490], [830, 488], [868, 520], [855, 560], [800, 575], [745, 555]], DRAGON, 1); // skull
  poly([[770, 560], [740, 540], [730, 555], [765, 580], [815, 585], [840, 565]], DRAGON, 1); // lower jaw
  // big horns sweeping back, gold-tipped, one branched
  stroke(qbezPts([830, 495], [880, 450], [915, 455], 16), 15, DRAGON_RIM, 1);
  stroke(qbezPts([880, 452], [905, 420], [915, 412], 12), 8, DRAGON_RIM, 1);
  stroke(qbezPts([840, 520], [890, 495], [920, 500], 16), 13, DRAGON_RIM, 1);
  disc(915, 455, 7, GOLD, 1, 1);
  disc(920, 500, 6, GOLD, 1, 1);
  disc(915, 412, 4, GOLD, 1, 1);
  // upper fangs pointing down, lower fangs pointing up
  for (const [fx, fy] of [[745, 545], [770, 550], [795, 555]]) {
    poly([[fx - 5, fy], [fx + 5, fy + 2], [fx, fy + 18]], [255, 255, 255], 1);
  }
  for (const [fx, fy] of [[755, 568], [780, 572]]) {
    poly([[fx - 4, fy], [fx + 4, fy], [fx, fy - 14]], [255, 255, 255], 1);
  }
  // whiskers trailing from the snout
  stroke(qbezPts([728, 532], [680, 510], [640, 500], 16), 3, DRAGON_RIM, 0.8);
  stroke(qbezPts([732, 548], [690, 570], [655, 585], 16), 3, DRAGON_RIM, 0.8);
  // glowing cyan eye with slit pupil, brow ridge above
  disc(785, 520, 22, EYE_CYAN, 0.3, 7);
  disc(785, 520, 13, EYE_CYAN, 1, 1);
  stroke([[785, 510], [785, 530]], 4, [0, 0, 0], 1);
  stroke([[765, 505], [805, 500]], 6, [20, 12, 50], 1);
  disc(732, 530, 3, [255, 140, 40], 1, 0.5); // nostril ember
}

// ---------- lightning the crow hurls: a long jagged bolt striking down
// from the talons to the mountain ridge ----------
function drawBolt() {
  const bolt = [[612, 566], [640, 600], [615, 630], [645, 665], [620, 705], [650, 745], [625, 790], [648, 830], [622, 870]];
  stroke(bolt, 12, GOLD_DEEP, 0.95);
  stroke(bolt, 5, [255, 250, 220], 1);
}

// ---------- foreground: mountain ridges, a BIG torii and pines ----------
// The bottom third was empty before. The ridges are higher now, the torii
// is a real landmark (not a speck), and pines ground the composition.
function drawForeground() {
  // back ridge, higher than before
  poly([[0, 1024], [0, 935], [170, 875], [370, 925], [560, 870], [760, 930], [1024, 885], [1024, 1024]], [8, 5, 18], 1);
  // front ridge
  poly([[0, 1024], [0, 985], [240, 950], [480, 995], [720, 955], [1024, 990], [1024, 1024]], [5, 3, 12], 1);
  // pines standing on the back ridge
  const PINES = [[120, 893, 1.0], [280, 902, 0.8], [680, 906, 1.1], [900, 906, 0.9]];
  for (const [px, py, s] of PINES) {
    poly([[px - 4 * s, py], [px + 4 * s, py], [px, py - 14 * s]], [6, 4, 14], 1); // trunk
    poly([[px - 26 * s, py - 12 * s], [px + 26 * s, py - 12 * s], [px, py - 38 * s]], [6, 4, 14], 1);
    poly([[px - 20 * s, py - 30 * s], [px + 20 * s, py - 30 * s], [px, py - 52 * s]], [6, 4, 14], 1);
    poly([[px - 13 * s, py - 46 * s], [px + 13 * s, py - 46 * s], [px, py - 64 * s]], [6, 4, 14], 1);
  }
  // torii gate, big and readable, bottom centre
  const TORII = [22, 14, 40];
  poly([[448, 1024], [448, 862], [466, 862], [466, 1024]], TORII, 1);
  poly([[558, 1024], [558, 862], [576, 862], [576, 1024]], TORII, 1);
  poly([[425, 860], [599, 860], [590, 878], [434, 878]], TORII, 1);
  poly([[440, 900], [584, 900], [584, 914], [440, 914]], TORII, 1);
  stroke([[425, 860], [599, 860]], 3, GOLD, 0.6);
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
