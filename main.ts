// Rubah Ekor Sembilan di Bawah Bulan Merah — nine-tailed fox (kitsune) under a
// giant blood moon. Drawn from scratch in pure Node stdlib (software rasterizer
// + hand-rolled PNG encoder). Fully deterministic: fixed seed, no Math.random,
// no Date.now — two runs are byte-identical.
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------- seeded rng ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261117);

// ---------- framebuffer ----------
const img = new Uint8ClampedArray(W * H * 3);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function setPx(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = r; img[i + 1] = g; img[i + 2] = b;
}
function blendPx(x, y, r, g, b, a) {
  if (a <= 0) return;
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  if (a >= 1) { img[i] = r; img[i + 1] = g; img[i + 2] = b; return; }
  img[i] = img[i] + (r - img[i]) * a;
  img[i + 1] = img[i + 1] + (g - img[i + 1]) * a;
  img[i + 2] = img[i + 2] + (b - img[i + 2]) * a;
}

// ---------- shapes ----------
function fillPoly(pts, col, alpha = 1) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));
  const n = pts.length;
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) blendPx(x, y, col[0], col[1], col[2], alpha);
    }
  }
}

function fillDisc(cx, cy, r, col, alpha = 1, feather = 1.5) {
  const x0 = Math.max(0, Math.floor(cx - r - feather));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + feather));
  const y0 = Math.max(0, Math.floor(cy - r - feather));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + feather));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) blendPx(x, y, col[0], col[1], col[2], alpha);
      else if (d <= r + feather) blendPx(x, y, col[0], col[1], col[2], alpha * (1 - (d - r) / feather));
    }
  }
}

function ellipsePts(cx, cy, rx, ry, rotDeg, n = 48) {
  const rot = (rotDeg * Math.PI) / 180;
  const c = Math.cos(rot), s = Math.sin(rot);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
    pts.push([cx + ex * c - ey * s, cy + ex * s + ey * c]);
  }
  return pts;
}
function fillEllipse(cx, cy, rx, ry, rotDeg, col, alpha = 1) {
  fillPoly(ellipsePts(cx, cy, rx, ry, rotDeg), col, alpha);
}

function qbez(p0, p1, p2, n = 28) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
  return pts;
}

// Variable-width ribbon along a polyline spine (for tails, legs, neck).
function ribbon(spine, w0, w1, col, alpha = 1) {
  const m = spine.length;
  const left = [], right = [];
  for (let i = 0; i < m; i++) {
    const t = i / (m - 1);
    const w = w0 + (w1 - w0) * t;
    const [ax, ay] = spine[Math.max(0, i - 1)];
    const [bx, by] = spine[Math.min(m - 1, i + 1)];
    let dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    const [x, y] = spine[i];
    left.push([x + (nx * w) / 2, y + (ny * w) / 2]);
    right.push([x - (nx * w) / 2, y - (ny * w) / 2]);
  }
  fillPoly([...left, ...right.reverse()], col, alpha);
  const [tx, ty] = spine[m - 1];
  fillDisc(tx, ty, w1 / 2, col, alpha, 1);
}

// Thin stroke along a polyline (rim light, sparkles).
function strokePts(pts, w, col, alpha = 1) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(d / 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      fillDisc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w / 2, col, alpha, 1);
    }
  }
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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- palette ----------
const SKY_TOP = [13, 10, 36];
const SKY_LOW = [43, 20, 64];
const MOON_CORE = [216, 56, 54];
const MOON_MID = [176, 35, 40];
const MOON_RIM = [125, 23, 28];
const MOON_GLOW = [224, 88, 74];
const CRATER_DARK = [125, 26, 31];
const FOX_DARK = [46, 22, 12];
const FOX_MID = [90, 42, 18];
const FOX_LIGHT = [138, 74, 34];
const FOX_CREAM = [240, 211, 160];
const FOX_GOLD = [242, 177, 60];
const EAR_INNER = [198, 90, 74];
const NOSE = [20, 10, 6];
const EYE_AMBER = [255, 179, 71];
const PINE = [10, 6, 22];
const TORII = [110, 32, 32];
const SAKURA = [246, 168, 192];
const SAKURA_DEEP = [232, 130, 165];

const MOON = { cx: 700, cy: 290, r: 300 };

// ---------- sky ----------
function drawSky() {
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const baseR = lerp(SKY_TOP[0], SKY_LOW[0], t);
    const baseG = lerp(SKY_TOP[1], SKY_LOW[1], t);
    const baseB = lerp(SKY_TOP[2], SKY_LOW[2], t);
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - MOON.cx, y - MOON.cy);
      const glow = Math.max(0, 1 - d / 680);
      const g2 = glow * glow;
      setPx(x, y,
        clamp(baseR + g2 * 52, 0, 255),
        clamp(baseG + g2 * 8, 0, 255),
        clamp(baseB + g2 * 4, 0, 255));
    }
  }
}

function drawStars() {
  for (let i = 0; i < 170; i++) {
    const x = rand() * W;
    const y = rand() * 780;
    // keep stars out of the moon disc
    if (Math.hypot(x - MOON.cx, y - MOON.cy) < MOON.r + 12) continue;
    const r = 0.8 + rand() * 1.4;
    const a = 0.35 + rand() * 0.65;
    fillDisc(x, y, r, [235, 230, 255], a, 0.8);
    if (rand() < 0.06) {
      // bright star with a tiny cross sparkle
      strokePts([[x - 7, y], [x + 7, y]], 1, [255, 255, 255], 0.7);
      strokePts([[x, y - 7], [x, y + 7]], 1, [255, 255, 255], 0.7);
    }
  }
}

// ---------- blood moon ----------
function drawMoon() {
  // soft halo
  fillDisc(MOON.cx, MOON.cy, 430, [150, 30, 32], 0.10, 60);
  fillDisc(MOON.cx, MOON.cy, 370, [170, 38, 38], 0.12, 45);
  fillDisc(MOON.cx, MOON.cy, 325, [190, 48, 44], 0.14, 30);
  // disc with a radial gradient, painted per pixel
  const x0 = Math.max(0, Math.floor(MOON.cx - MOON.r));
  const x1 = Math.min(W - 1, Math.ceil(MOON.cx + MOON.r));
  const y0 = Math.max(0, Math.floor(MOON.cy - MOON.r));
  const y1 = Math.min(H - 1, Math.ceil(MOON.cy + MOON.r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - MOON.cx, y - MOON.cy);
      if (d > MOON.r) continue;
      const t = d / MOON.r;
      const s = smooth(0.15, 1, t);
      let r = lerp(MOON_CORE[0], MOON_RIM[0], s);
      let g = lerp(MOON_CORE[1], MOON_RIM[1], s);
      let b = lerp(MOON_CORE[2], MOON_RIM[2], s);
      // brighter heart, offset up-left
      const d2 = Math.hypot(x - (MOON.cx - 70), y - (MOON.cy - 80));
      const inner = Math.max(0, 1 - d2 / 190);
      r = lerp(r, MOON_GLOW[0], inner * 0.45);
      g = lerp(g, MOON_GLOW[1], inner * 0.45);
      b = lerp(b, MOON_GLOW[2], inner * 0.45);
      setPx(x, y, r, g, b);
    }
  }
  // craters: darker maria + a few lighter patches (seeded, fixed)
  const craters = [
    [640, 210, 34, 0.35], [780, 330, 46, 0.30], [560, 380, 26, 0.35],
    [830, 210, 22, 0.30], [700, 470, 30, 0.32], [610, 300, 16, 0.38],
    [880, 380, 18, 0.30], [520, 260, 20, 0.32], [760, 150, 14, 0.35],
    [670, 400, 12, 0.30], [920, 280, 12, 0.30], [590, 160, 12, 0.35],
  ];
  for (const [cx, cy, r, a] of craters) fillDisc(cx, cy, r, CRATER_DARK, a, 6);
  fillDisc(640, 250, 40, MOON_GLOW, 0.22, 14);
  fillDisc(800, 420, 34, MOON_GLOW, 0.18, 14);
  fillDisc(740, 180, 22, MOON_GLOW, 0.20, 10);
}

// ---------- distant ridge ----------
function drawDistantRidge() {
  fillPoly(
    [[0, 1024], [0, 905], [150, 858], [330, 900], [520, 862], [720, 905], [900, 868], [1024, 900], [1024, 1024]],
    [16, 10, 34], 1);
}

function cbez(p0, p1, p2, p3, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

// ---------- the nine tails ----------
// The fox sits facing left. The nine tails emerge from staggered points along
// the fox's rear (a bouquet, not one point) and sweep up and right across the
// blood moon on S-curved cubic spines — each tail arcs one way, then its tip
// curls the other way, tapering to a soft point with a gold tip that fades in.
// Dark russet plumes with gold tips on a crimson disc: all nine countable,
// even at 300px, and flowing like fur, not sticks.
const TAILS = [
  { base: [478, 802], c1: [420, 600], c2: [470, 300], tip: [540, 170], col: [58, 28, 14] },
  { base: [486, 790], c1: [480, 560], c2: [560, 280], tip: [640, 130], col: [66, 32, 12] },
  { base: [494, 778], c1: [560, 520], c2: [660, 280], tip: [750, 150], col: [52, 24, 16] },
  { base: [502, 766], c1: [640, 500], c2: [760, 320], tip: [840, 210], col: [70, 36, 14] },
  { base: [510, 754], c1: [700, 480], c2: [820, 360], tip: [900, 300], col: [58, 28, 14] },
  { base: [518, 742], c1: [740, 520], c2: [860, 440], tip: [930, 410], col: [66, 32, 12] },
  { base: [526, 730], c1: [760, 580], c2: [860, 540], tip: [890, 540], col: [52, 24, 16] },
  { base: [534, 722], c1: [700, 660], c2: [780, 660], tip: [810, 630], col: [70, 36, 14] },
  { base: [542, 712], c1: [620, 730], c2: [670, 720], tip: [700, 690], col: [58, 28, 14] },
];

function drawTails() {
  for (const t of TAILS) {
    const spine = cbez(t.base, t.c1, t.c2, t.tip, 32);
    // thin dark outline, so neighbouring tails stay separated
    ribbon(spine, 56, 14, [22, 10, 6], 1);
    // russet body, tapering to a soft point
    ribbon(spine, 50, 10, t.col, 1);
    // gold tip fading in over the last quarter (two steps, no hard edge)
    const s1 = spine.slice(Math.floor(spine.length * 0.75), Math.floor(spine.length * 0.88));
    const s2 = spine.slice(Math.floor(spine.length * 0.88));
    ribbon(s1, 24, 16, [214, 134, 40], 1);
    ribbon(s2, 16, 10, FOX_GOLD, 1);
    // thin moonlit highlight along the upper edge of the tail
    const hi = spine.slice(2, Math.floor(spine.length * 0.85));
    strokePts(hi, 3, [255, 205, 110], 0.5);
  }
}

// ---------- the fox ----------
function drawFox() {
  // ground shadow under the paws
  fillEllipse(410, 898, 170, 22, 0, [4, 3, 10], 0.65);
  // soft moonlit glow behind the fox, so its silhouette lifts off the sky
  fillDisc(430, 700, 195, [242, 177, 60], 0.10, 55);

  // hindquarter + torso (seated, facing left)
  fillEllipse(478, 792, 102, 84, -8, FOX_DARK, 1);
  fillEllipse(438, 706, 108, 66, -28, FOX_MID, 1);
  // lighter back highlight
  fillEllipse(452, 668, 88, 40, -28, FOX_LIGHT, 0.85);
  // belly shadow under the torso, so the body is not one flat blob
  fillEllipse(470, 748, 70, 34, -20, FOX_DARK, 0.8);

  // neck rising to the head (S-curve, tapering)
  ribbon(qbez([398, 692], [366, 648], [360, 582], 12), 66, 44, FOX_MID, 1);
  ribbon(qbez([392, 688], [362, 648], [356, 584], 12), 46, 30, FOX_LIGHT, 0.8);
  // shadow on the neck's right edge, light on its left edge — roundness
  strokePts([[396, 680], [378, 630], [372, 590]], 4, FOX_DARK, 0.7);
  strokePts([[372, 676], [352, 626], [346, 586]], 3, [200, 130, 70], 0.7);

  // chest ruff: cream zigzag fur on the front of the chest, drawn on top
  fillPoly(
    [[348, 650], [326, 688], [344, 706], [322, 740], [346, 756], [330, 782],
     [366, 786], [388, 748], [380, 706], [394, 672], [372, 648]],
    FOX_CREAM, 1);

  // head
  fillEllipse(342, 542, 60, 54, -12, FOX_MID, 1);
  fillEllipse(352, 530, 44, 38, -12, FOX_LIGHT, 0.7);
  // darker forehead patch between the ears
  fillEllipse(342, 505, 26, 18, -12, FOX_DARK, 0.9);

  // muzzle: cream lower jaw tapering left to the nose (longer, fox-like)
  fillPoly([[306, 556], [258, 542], [232, 566], [258, 594], [302, 590]], FOX_CREAM, 1);
  fillPoly([[306, 552], [260, 538], [238, 560], [264, 566], [304, 566]], FOX_MID, 1);
  // nose
  fillDisc(235, 561, 9, NOSE, 1, 1);
  fillDisc(232, 558, 3, [90, 70, 60], 0.9, 0.5);

  // ears: tall, pointed, with warm inner ears
  fillPoly([[306, 505], [292, 428], [336, 492]], FOX_DARK, 1);
  fillPoly([[368, 498], [392, 430], [402, 505]], FOX_DARK, 1);
  fillPoly([[310, 492], [302, 448], [326, 484]], EAR_INNER, 1);
  fillPoly([[372, 488], [386, 448], [394, 492]], EAR_INNER, 1);
  // gold rim light on the ear edges (moonlit side)
  strokePts([[292, 428], [336, 492]], 3, FOX_GOLD, 0.8);
  strokePts([[392, 430], [402, 505]], 3, FOX_GOLD, 0.8);

  // eye: amber, almond, with pupil + highlight
  fillEllipse(322, 532, 11, 7, -8, EYE_AMBER, 1);
  fillEllipse(320, 532, 4.5, 6, -8, [26, 13, 8], 1);
  fillDisc(325, 529, 2.5, [255, 255, 255], 0.95, 0.5);

  // front legs with a slight knee bend, tapering down to cream paws
  ribbon([[378, 720], [370, 795], [368, 878]], 28, 18, FOX_MID, 1);
  ribbon([[412, 730], [408, 800], [408, 878]], 28, 18, FOX_DARK, 1);
  fillDisc(369, 798, 15, FOX_MID, 1, 1);
  fillDisc(409, 802, 15, FOX_DARK, 1, 1);
  fillEllipse(368, 884, 20, 12, 0, FOX_CREAM, 1);
  fillEllipse(408, 884, 20, 12, 0, FOX_CREAM, 1);
  strokePts([[360, 888], [376, 888]], 2, NOSE, 0.7);
  strokePts([[400, 888], [416, 888]], 2, NOSE, 0.7);
  // hind paw tucked forward
  fillEllipse(528, 862, 26, 14, -8, FOX_DARK, 1);

  // dark back stripe ON the silhouette, defining the back (no floating line)
  strokePts([[372, 664], [410, 642], [452, 634], [498, 642], [530, 662]], 8, FOX_DARK, 0.85);
}

// ---------- sakura petals ----------
function drawSakura() {
  for (let i = 0; i < 46; i++) {
    const x = rand() * W;
    const y = rand() * 900;
    const s = 5 + rand() * 6;
    const rot = rand() * Math.PI;
    const col = rand() < 0.5 ? SAKURA : SAKURA_DEEP;
    const a = 0.55 + rand() * 0.4;
    // a petal: two small overlapping ellipses, rotated
    const c = Math.cos(rot), sn = Math.sin(rot);
    const off = s * 0.45;
    const e1x = x - off * c, e1y = y - off * sn;
    const e2x = x + off * c, e2y = y + off * sn;
    fillEllipse(e1x, e1y, s * 0.75, s * 0.5, (rot * 180) / Math.PI, col, a);
    fillEllipse(e2x, e2y, s * 0.75, s * 0.5, (rot * 180) / Math.PI, col, a);
    fillDisc(x, y, s * 0.28, [255, 220, 232], a * 0.9, 0.5);
  }
}

// ---------- foreground ----------
function drawForeground() {
  // near ridge
  fillPoly(
    [[0, 1024], [0, 962], [180, 928], [380, 962], [560, 930], [760, 968], [1024, 938], [1024, 1024]],
    [7, 4, 15], 1);
  // pines on the left
  const pine = (bx, by, h) => {
    fillPoly([[bx - 26, by], [bx, by - h], [bx + 26, by]], PINE, 1);
    fillPoly([[bx - 20, by - h * 0.45], [bx, by - h * 1.15], [bx + 20, by - h * 0.45]], PINE, 1);
    fillPoly([[bx - 14, by - h * 0.8], [bx, by - h * 1.4], [bx + 14, by - h * 0.8]], PINE, 1);
  };
  pine(70, 985, 90);
  pine(150, 975, 70);
  pine(240, 990, 100);
  pine(985, 980, 80);
  // small torii under the moon, bottom right — scale marker
  fillPoly([[836, 1024], [836, 880], [852, 880], [852, 1024]], TORII, 1);
  fillPoly([[908, 1024], [908, 880], [924, 880], [924, 1024]], TORII, 1);
  fillPoly([[822, 872], [938, 872], [930, 888], [830, 888]], TORII, 1);
  fillPoly([[840, 900], [920, 900], [916, 912], [844, 912]], TORII, 1);
  strokePts([[822, 872], [938, 872]], 2, FOX_GOLD, 0.7);
}

// ---------- vignette ----------
function vignette() {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - W / 2, y - H / 2) / 724;
      const a = smooth(0.55, 1.0, d) * 0.26;
      if (a > 0) blendPx(x, y, 0, 0, 0, a);
    }
  }
}

// ---------- paint ----------
drawSky();
drawStars();
drawMoon();
drawDistantRidge();
drawTails();
drawFox();
drawSakura();
drawForeground();
vignette();

mkdirSync(OUT, { recursive: true });
const png = encodePNG();
writeFileSync(join(OUT, 'entry.png'), png);
console.log(`wrote ${join(OUT, 'entry.png')} ${png.length} bytes ${W}x${H}`);
