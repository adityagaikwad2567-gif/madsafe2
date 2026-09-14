/**
 * Generates MedSafe PWA icons (192, 512, maskable variants) without dependencies.
 * Design: deep-navy rounded square, teal cross, white capsule — matches the brand.
 * Run: node scripts/make-icons.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const SIZE = 512;
const OUT = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

// ── tiny PNG encoder (RGBA, 8-bit) ──────────────────────────────
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── brand drawing helpers (normalized 0..1 coords) ─────────────
const NAVY = [10, 37, 64, 255];
const NAVY_DARK = [7, 27, 48, 255];
const TEAL = [13, 148, 136, 255];
const TEAL_LIGHT = [45, 212, 191, 255];
const WHITE = [255, 255, 255, 255];
const AMBER = [251, 191, 36, 255];

function inRoundedSquare(x, y, pad, r) {
  const min = pad, max = 1 - pad;
  if (x < min || x > max || y < min || y > max) return false;
  const cx = Math.max(min + r, Math.min(x, max - r));
  const cy = Math.max(min + r, Math.min(y, max - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inCapsule(x, y, cx, cy, halfLen, halfWid, angle) {
  const dx = x - cx, dy = y - cy;
  const rx = dx * Math.cos(angle) + dy * Math.sin(angle);
  const ry = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const clamped = Math.max(-halfLen + halfWid, Math.min(rx, halfLen - halfWid));
  return (rx - clamped) ** 2 + ry ** 2 <= halfWid * halfWid;
}

/** Renders one frame of the icon. maskable keeps art in the 80% safe zone. */
function render(maskable) {
  const scale = maskable ? 0.82 : 1.0; // shrink art for maskable safe zone
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const cx = 0.5, cy = 0.5;
  const pad = maskable ? 0.09 : 0.045;
  const rad = maskable ? 0.17 : 0.14;

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const x = px / SIZE, y = py / SIZE;
      let color;

      if (inRoundedSquare(x, y, pad, rad)) {
        // subtle diagonal gradient navy -> darker navy
        const t = (x + y) / 2;
        color = [
          Math.round(NAVY[0] + (NAVY_DARK[0] - NAVY[0]) * t),
          Math.round(NAVY[1] + (NAVY_DARK[1] - NAVY[1]) * t),
          Math.round(NAVY[2] + (NAVY_DARK[2] - NAVY[2]) * t),
          255,
        ];

        // teal medical cross (upper-left area)
        const ax = (x - cx) / scale + cx, ay = (y - cy) / scale + cy;
        const crossC = { x: 0.44, y: 0.44 };
        const armW = 0.055, armL = 0.15;
        const inCross =
          (Math.abs(ax - crossC.x) <= armW && Math.abs(ay - crossC.y) <= armL) ||
          (Math.abs(ay - crossC.y) <= armW && Math.abs(ax - crossC.x) <= armL);
        if (inCross) color = TEAL_LIGHT;

        // white capsule (lower-right, tilted -35°) with teal band
        const capC = { x: 0.58, y: 0.60 };
        const angle = -35 * (Math.PI / 180);
        if (inCapsule(ax, ay, capC.x, capC.y, 0.155, 0.085, angle)) {
          const dx = ax - capC.x, dy = ay - capC.y;
          const rx = dx * Math.cos(angle) + dy * Math.sin(angle);
          // band across the middle of the capsule
          color = Math.abs(rx) <= 0.028 ? TEAL : WHITE;
        }

        // amber awareness dot (top-right) — the "safety alert" motif
        const dotC = { x: 0.68, y: 0.30 };
        if (inCircle(ax, ay, dotC.x, dotC.y, 0.055)) color = AMBER;
        if (inCircle(ax, ay, dotC.x, dotC.y - 0.012, 0.012)) color = NAVY; // ! mark
      } else {
        color = [0, 0, 0, 0];
      }

      const i = (py * SIZE + px) * 4;
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = color[3];
    }
  }
  return buf;
}

function downscale(rgba, size) {
  const out = Buffer.alloc(size * size * 4);
  const f = SIZE / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(SIZE - 1, Math.floor((x + 0.5) * f));
      const sy = Math.min(SIZE - 1, Math.floor((y + 0.5) * f));
      const si = (sy * SIZE + sx) * 4;
      const di = (y * size + x) * 4;
      rgba.copy(out, di, si, si + 4);
    }
  }
  return out;
}

const full = render(false);
const mask = render(true);

const targets = [
  { file: "icon-192.png", rgba: downscale(full, 192), size: 192, maskable: false },
  { file: "icon-512.png", rgba: full, size: 512, maskable: false },
  { file: "icon-maskable-192.png", rgba: downscale(mask, 192), size: 192, maskable: true },
  { file: "icon-maskable-512.png", rgba: mask, size: 512, maskable: true },
];

for (const t of targets) {
  fs.writeFileSync(path.join(OUT, t.file), encodePng(t.size, t.size, t.rgba));
  console.log("wrote", t.file);
}
console.log("done.");
