#!/usr/bin/env node
'use strict';

/**
 * scripts/generate-icons.js
 *
 * Generates a high-quality app icon using only Node.js built-ins.
 *
 * Design:
 *   - Dark background (#09090b) with a subtle violet radial glow
 *   - macOS-style rounded corners (22% radius)
 *   - Glowing infinity "∞" symbol with indigo→violet gradient and multi-layer glow
 *
 * Output:
 *   assets/icon.png  – 512×512 (used by all platforms; electron-builder
 *                      converts to .icns/.ico at build time)
 */

const zlib = require('zlib');
const path = require('path');
const fs   = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// ── Minimal PNG encoder ───────────────────────────────────────────────────────

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
  const lenBuf  = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf  = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(w, h, pixels) {
  const SIG  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;

  const raw = Buffer.allocUnsafe(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    Buffer.from(pixels.buffer, y * w * 4, w * 4).copy(raw, y * (1 + w * 4) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInsideRoundedRect(x, y, w, h, r) {
  const dx = Math.max(r - x, 0, x - (w - r - 1));
  const dy = Math.max(r - y, 0, y - (h - r - 1));
  return dx * dx + dy * dy <= r * r;
}

/**
 * Alpha-blend `color` at `alpha` onto the existing pixel at `idx`.
 * Handles premultiplied alpha correctly.
 */
function blendPixel(pixels, idx, color, alpha) {
  if (alpha <= 0) return;
  if (alpha >= 1) {
    pixels[idx]   = color[0];
    pixels[idx+1] = color[1];
    pixels[idx+2] = color[2];
    pixels[idx+3] = 255;
    return;
  }
  const bgA = pixels[idx+3] / 255;
  const outA = alpha + bgA * (1 - alpha);
  if (outA <= 0) return;
  pixels[idx]   = Math.round((color[0] * alpha + pixels[idx]   * bgA * (1 - alpha)) / outA);
  pixels[idx+1] = Math.round((color[1] * alpha + pixels[idx+1] * bgA * (1 - alpha)) / outA);
  pixels[idx+2] = Math.round((color[2] * alpha + pixels[idx+2] * bgA * (1 - alpha)) / outA);
  pixels[idx+3] = Math.round(outA * 255);
}

/** Linear interpolation between two RGB colours. */
function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ── Icon drawing ──────────────────────────────────────────────────────────────

/**
 * Draws one "ring layer" of the infinity symbol:
 *   outer edge at `outerR`, inner edge at `innerR`, with 1px anti-aliasing.
 *   `color` is [r,g,b], `maxAlpha` is the peak opacity.
 */
function drawInfinityRing(pixels, size, lx, rx, cy, outerR, innerR, color, maxAlpha) {
  const y0 = Math.max(0, Math.floor(cy - outerR - 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + outerR + 1));
  for (let y = y0; y <= y1; y++) {
    const xl0 = Math.max(0, Math.floor(lx - outerR - 1));
    const xl1 = Math.min(size - 1, Math.ceil(lx + outerR + 1));
    const xr0 = Math.max(0, Math.floor(rx - outerR - 1));
    const xr1 = Math.min(size - 1, Math.ceil(rx + outerR + 1));

    for (let seg = 0; seg < 2; seg++) {
      const x0 = seg === 0 ? xl0 : xr0;
      const x1 = seg === 0 ? xl1 : xr1;
      const cx2 = seg === 0 ? lx  : rx;
      for (let x = x0; x <= x1; x++) {
        const dL = Math.sqrt((x - lx) * (x - lx) + (y - cy) * (y - cy));
        const dR = Math.sqrt((x - rx) * (x - rx) + (y - cy) * (y - cy));
        const inL = dL >= innerR - 0.5 && dL <= outerR + 0.5;
        const inR = dR >= innerR - 0.5 && dR <= outerR + 0.5;
        if (!inL && !inR) continue;

        const edgeL = inL ? Math.min(dL - innerR, outerR - dL) : -1;
        const edgeR = inR ? Math.min(dR - innerR, outerR - dR) : -1;
        const edge  = Math.max(edgeL, edgeR);  // pick the "more inside" value
        const alpha = Math.min(1, Math.max(0, edge + 0.5)) * maxAlpha;
        if (alpha <= 0) continue;

        blendPixel(pixels, (y * size + x) * 4, color, alpha);
      }
    }
  }
}

/**
 * Draws the main gradient stroke of the infinity symbol.
 * Colour transitions: indigo → violet → light-violet, left to right.
 */
function drawInfinityGradient(pixels, size, lx, rx, cy, outerR, innerR) {
  const colorL = [99,  102, 241]; // #6366f1 indigo
  const colorM = [139, 92,  246]; // #8b5cf6 violet
  const colorR = [167, 139, 250]; // #a78bfa light violet

  const xMin = lx - outerR;
  const xMax = rx + outerR;
  const xSpan = xMax - xMin;

  const y0 = Math.max(0, Math.floor(cy - outerR - 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + outerR + 1));

  for (let y = y0; y <= y1; y++) {
    const x0 = Math.max(0, Math.floor(xMin - 1));
    const x1 = Math.min(size - 1, Math.ceil(xMax + 1));
    for (let x = x0; x <= x1; x++) {
      const dL = Math.sqrt((x - lx) * (x - lx) + (y - cy) * (y - cy));
      const dR = Math.sqrt((x - rx) * (x - rx) + (y - cy) * (y - cy));
      const inL = dL >= innerR - 0.5 && dL <= outerR + 0.5;
      const inR = dR >= innerR - 0.5 && dR <= outerR + 0.5;
      if (!inL && !inR) continue;

      const edgeL = inL ? Math.min(dL - innerR, outerR - dL) : -1;
      const edgeR = inR ? Math.min(dR - innerR, outerR - dR) : -1;
      const edge  = Math.max(edgeL, edgeR);
      const alpha = Math.min(1, Math.max(0, edge + 0.5));
      if (alpha <= 0) continue;

      // Horizontal gradient across the symbol
      const t = Math.max(0, Math.min(1, (x - xMin) / xSpan));
      const color = t < 0.5 ? lerpColor(colorL, colorM, t * 2) : lerpColor(colorM, colorR, (t - 0.5) * 2);

      blendPixel(pixels, (y * size + x) * 4, color, alpha);
    }
  }
}

/**
 * Generates the full app icon at `size`×`size`.
 */
function generateIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  // ── Background: dark zinc with soft violet radial glow ─────────────────────
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / (size * 0.45);
      const dy = (y - cy) / (size * 0.45);
      const d  = Math.sqrt(dx * dx + dy * dy);
      const g  = Math.pow(Math.max(0, 1 - d), 2.2) * 0.22;

      const idx  = (y * size + x) * 4;
      pixels[idx]   = Math.round(9  + g * 90);   // R: #09 → subtle purple
      pixels[idx+1] = Math.round(9  + g * 10);   // G: nearly unchanged
      pixels[idx+2] = Math.round(11 + g * 210);  // B: #0b → blue-ish glow
      pixels[idx+3] = 255;
    }
  }

  // ── Rounded corners (macOS style, 22% radius) ─────────────────────────────
  const cornerR = Math.round(size * 0.22);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isInsideRoundedRect(x, y, size, size, cornerR)) {
        pixels[(y * size + x) * 4 + 3] = 0;
      }
    }
  }

  // ── Infinity symbol geometry ───────────────────────────────────────────────
  const lobeR  = size * 0.172;   // ring outer radius
  const offsetX = size * 0.152;  // horizontal distance of each lobe centre from icon centre
  const strokeW = size * 0.060;  // stroke width
  const lx = cx - offsetX;       // left lobe centre x
  const rx = cx + offsetX;       // right lobe centre x

  const outerR = lobeR;
  const innerR = lobeR - strokeW;

  // Layer 1 – widest outer glow (very soft, dark purple)
  drawInfinityRing(pixels, size, lx, rx, cy, outerR + size * 0.055, Math.max(0, innerR - size * 0.02), [88, 28, 220], 0.06);

  // Layer 2 – mid glow (indigo, soft)
  drawInfinityRing(pixels, size, lx, rx, cy, outerR + size * 0.030, Math.max(0, innerR - size * 0.01), [99, 102, 241], 0.14);

  // Layer 3 – close glow (violet)
  drawInfinityRing(pixels, size, lx, rx, cy, outerR + size * 0.014, Math.max(0, innerR - size * 0.004), [139, 92, 246], 0.30);

  // Layer 4 – main gradient stroke
  drawInfinityGradient(pixels, size, lx, rx, cy, outerR, innerR);

  // Layer 5 – inner specular highlight (thin bright edge on inside of stroke)
  const hlW = strokeW * 0.18;
  drawInfinityRing(pixels, size, lx, rx, cy, innerR + hlW, innerR, [220, 210, 255], 0.45);

  return encodePNG(size, size, pixels);
}

// ── Entry point ───────────────────────────────────────────────────────────────

console.log('Generating icon…');
const pngPath = path.join(ASSETS_DIR, 'icon.png');
fs.writeFileSync(pngPath, generateIcon(512));
console.log('  ✓ assets/icon.png  (512×512)');
console.log('    electron-builder converts to .icns/.ico at build time.\n');
