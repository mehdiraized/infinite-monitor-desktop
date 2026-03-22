#!/usr/bin/env node
'use strict';

/**
 * scripts/generate-icons.js
 *
 * Generates placeholder app icons using only Node.js built-ins (no extra deps).
 * Produces a dark-background PNG with the "∞" glyph drawn in a light colour.
 *
 * Output:
 *   assets/icon.png   – 512×512 (used by Linux + electron-builder fallback)
 *
 * For production you should replace these with professionally designed icons:
 *   assets/icon.icns  – macOS  (512×512 base, multi-res)
 *   assets/icon.ico   – Windows (multi-res ICO)
 *   assets/icon.png   – Linux  (512×512)
 *
 * electron-builder can auto-generate .icns/.ico from a 512×512 PNG if you
 * have the `electron-icon-builder` package installed (see README).
 */

const zlib = require('zlib');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// ── Minimal PNG encoder ───────────────────────────────────────────────────────

/** CRC-32 lookup table */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Encodes an RGBA pixel array (Uint8Array, row-major) as a PNG.
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array} pixels  – length = w * h * 4 (RGBA)
 * @returns {Buffer}
 */
function encodePNG(w, h, pixels) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  // Raw scanlines with filter byte 0 (None)
  const raw = Buffer.allocUnsafe(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: None
    const rowBuf = Buffer.from(pixels.buffer, y * w * 4, w * 4);
    rowBuf.copy(raw, y * (1 + w * 4) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon drawing ──────────────────────────────────────────────────────────────

/**
 * Generates a simple square icon:
 *   - Dark background (#09090b ≈ zinc-950)
 *   - Rounded corners
 *   - A centred infinity "∞" glyph approximated with Bézier curves
 *
 * @param {number} size  (e.g. 512)
 * @returns {Buffer} PNG bytes
 */
function generateIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  // Background colour (zinc-950: #09090b)
  const BG = [9, 9, 11, 255];
  // Glyph colour (zinc-300: #d4d4d8)
  const FG = [212, 212, 216, 255];

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 0] = BG[0];
    pixels[i * 4 + 1] = BG[1];
    pixels[i * 4 + 2] = BG[2];
    pixels[i * 4 + 3] = BG[3];
  }

  // Apply rounded corners (radius = 22% of size)
  const radius = Math.round(size * 0.22);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = isInsideRoundedRect(x, y, size, size, radius);
      if (!inside) {
        const idx = (y * size + x) * 4;
        pixels[idx + 3] = 0; // transparent outside rounded corners
      }
    }
  }

  // Draw the ∞ symbol using two offset filled circles (lemniscate approximation)
  const cx = size / 2;
  const cy = size / 2;
  const lobeR = size * 0.175;  // radius of each lobe
  const offset = size * 0.155; // horizontal offset of each lobe centre
  const strokeW = size * 0.065; // stroke width

  drawInfinityGlyph(pixels, size, cx, cy, lobeR, offset, strokeW, FG);

  return encodePNG(size, size, pixels);
}

function isInsideRoundedRect(x, y, w, h, r) {
  const dx = Math.max(r - x, 0, x - (w - r - 1));
  const dy = Math.max(r - y, 0, y - (h - r - 1));
  return dx * dx + dy * dy <= r * r;
}

/**
 * Draws the ∞ glyph by rendering two rings (annuli) and then punching
 * out the crossing region so the glyph looks like a proper infinity sign.
 */
function drawInfinityGlyph(pixels, size, cx, cy, lobeR, offset, strokeW, color) {
  const innerR = lobeR - strokeW;
  const outerR = lobeR;
  const lx = cx - offset; // left lobe centre x
  const rx = cx + offset; // right lobe centre x

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dxL = x - lx, dyL = y - cy;
      const dxR = x - rx, dyR = y - cy;
      const distL = Math.sqrt(dxL * dxL + dyL * dyL);
      const distR = Math.sqrt(dxR * dxR + dyR * dyR);

      const inLeftRing  = distL >= innerR && distL <= outerR;
      const inRightRing = distR >= innerR && distR <= outerR;

      // Paint if in either ring (union gives a connected ∞ shape)
      if (inLeftRing || inRightRing) {
        const idx = (y * size + x) * 4;
        // Anti-alias at the outer edge
        const minDist = Math.min(
          inLeftRing  ? Math.min(distL - innerR, outerR - distL) : Infinity,
          inRightRing ? Math.min(distR - innerR, outerR - distR) : Infinity
        );
        const alpha = Math.min(1, minDist * 2.5) * (color[3] / 255);
        blendPixel(pixels, idx, color, alpha);
      }
    }
  }
}

function blendPixel(pixels, idx, color, alpha) {
  if (alpha <= 0) return;
  const bg = [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
  const bgA = pixels[idx + 3] / 255;
  const outA = alpha + bgA * (1 - alpha);
  if (outA === 0) return;
  pixels[idx + 0] = Math.round((color[0] * alpha + bg[0] * bgA * (1 - alpha)) / outA);
  pixels[idx + 1] = Math.round((color[1] * alpha + bg[1] * bgA * (1 - alpha)) / outA);
  pixels[idx + 2] = Math.round((color[2] * alpha + bg[2] * bgA * (1 - alpha)) / outA);
  pixels[idx + 3] = Math.round(outA * 255);
}

// ── Entry point ───────────────────────────────────────────────────────────────

console.log('Generating placeholder icons…');

const pngPath = path.join(ASSETS_DIR, 'icon.png');
fs.writeFileSync(pngPath, generateIcon(512));
console.log(`  ✓ assets/icon.png (512×512)`);

console.log('\nNote: Replace assets/icon.png with a real icon for production.');
console.log('      Run `npx electron-icon-builder --input=assets/icon.png --output=assets/`');
console.log('      to generate .icns (macOS) and .ico (Windows) variants.\n');
