'use strict';
/* Generates build/icon.png (1024×1024) — SleepCoding night-moon mark.
   Pure Node: shapes rasterized by math, PNG encoded manually. No deps. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- minimal PNG encoder ---------------- */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- drawing ---------------- */
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const clamp = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (t) => t * t * (3 - 2 * t);

const BG_IN  = [35, 42, 61];    // #232a3d
const BG_OUT = [16, 19, 31];    // #10131f
const MOON_A = [255, 232, 179]; // #ffe8b3
const MOON_B = [240, 180, 60];  // #f0b43c
const STAR   = [207, 230, 255]; // #cfe6ff

const STARS = [
  [300, 290, 15], [706, 332, 12], [250, 650, 11],
  [760, 600, 13], [560, 208, 10], [420, 190, 8]
];

const S = 2; // supersampling

function sample(u, v) { // u,v in 0..1024 space
  const dx = u - 512, dy = v - 512;
  const dBg = Math.hypot(dx, dy);
  if (dBg > 500) return [0, 0, 0, 0];           // transparent corners

  let col = mix(BG_OUT, BG_IN, smooth(clamp(1 - dBg / 500)));

  // soft halo around the moon
  const dMoonEdge = Math.hypot(u - 500, v - 520) - 270;
  if (dMoonEdge > -60 && dMoonEdge < 130) {
    const g = Math.exp(-Math.max(0, dMoonEdge) / 55) * 0.35
            + (dMoonEdge < 0 ? 0.15 : 0);
    col = mix(col, MOON_A, clamp(g) * 0.35);
  }

  // stars
  for (const [sx, sy, sr] of STARS) {
    const d = Math.hypot(u - sx, v - sy);
    if (d < sr * 3) {
      const i = clamp(1 - d / (sr * 2.6));
      col = mix(col, STAR, i * 0.85);
    }
  }

  // crescent = inside moon circle, outside offset cutter circle
  const inMoon = ((u - 500) ** 2 + (v - 520) ** 2) < 270 ** 2;
  const inCut  = ((u - 645) ** 2 + (v - 405) ** 2) < 238 ** 2;
  if (inMoon && !inCut) {
    const t = clamp(Math.hypot(u - 500, v - 520) / 270);
    col = mix(MOON_A, MOON_B, smooth(t) * 0.9);
  }

  return [col[0], col[1], col[2], 255];
}

function main() {
  const SIZE = 1024, BIG = SIZE * S;
  const big = Buffer.alloc(BIG * BIG * 4);
  for (let y = 0; y < BIG; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < BIG; x++) {
      const u = (x + 0.5) / S;
      const c = sample(u, v);
      const i = (y * BIG + x) * 4;
      big[i] = c[0]; big[i + 1] = c[1]; big[i + 2] = c[2]; big[i + 3] = c[3];
    }
  }
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const i = ((y * S + sy) * BIG + (x * S + sx)) * 4;
          r += big[i]; g += big[i + 1]; b += big[i + 2]; a += big[i + 3];
        }
      const n = S * S, o = (y * SIZE + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  const dir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon.png'), encodePNG(SIZE, SIZE, out));
  console.log('build/icon.png written (1024×1024)');
}
main();