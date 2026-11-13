'use strict';
// Generates build/icon.png (512x512): spectrum bars in one bright turquoise on a dark rounded square. No dependencies.
// Run: node tools/make-icon.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const S = 512, SS = 3;                                           // size, supersampling per axis
const TURQ = [32, 232, 212];                                    // the one bar colour
const bars = [0.34, 0.58, 0.82, 0.62, 0.95, 0.7, 0.46, 0.28];   // relative heights
const hsl = (h, s, l) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
const inRR = (x, y, x0, y0, x1, y1, r) => { if (x < x0 || x > x1 || y < y0 || y > y1) return false; const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
function sample(x, y) {                                          // -> [r,g,b,a] at a point
  if (!inRR(x, y, 16, 16, S - 16, S - 16, 104)) return [0, 0, 0, 0];
  const t = y / S, bg = [8 + 14 * t, 12 + 14 * t, 38 + 26 * t];  // deep blue gradient
  const n = bars.length, pad = 84, bw = (S - pad * 2) / n, base = S - 96;
  for (let i = 0; i < n; i++) {
    const x0 = pad + i * bw + bw * 0.16, x1 = pad + (i + 1) * bw - bw * 0.16, h = bars[i] * (S - 200), y0 = base - h;
    if (inRR(x, y, x0, y0, x1, base, (x1 - x0) / 2.4)) return [TURQ[0], TURQ[1], TURQ[2], 255];
    const gy = base + 14; if (x > x0 && x < x1 && y > gy && y < gy + 5 * (1 - 0.0)) return [TURQ[0] * 0.55, TURQ[1] * 0.55, TURQ[2] * 0.55, 150];   // dim reflection hint
  }
  return [bg[0], bg[1], bg[2], 255];
}
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const p = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS); r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3]; }
    const o = y * (S * 4 + 1) + 1 + x * 4, cnt = SS * SS;
    raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0; raw[o + 3] = Math.round(a / cnt);
  }
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = buf => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), cr = Buffer.alloc(4); len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, '..', 'build', 'icon.png'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, png); console.log('wrote', out, png.length, 'bytes');
