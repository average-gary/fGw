/**
 * Image transform pipeline (SPEC-027).
 *
 * Contract: every photo headed for Blossom upload (SPEC-016) is first
 * passed through `transformImage`, which:
 *   - decodes the source via `createImageBitmap` (or an `Image` element
 *     fallback for environments that lack `createImageBitmap`),
 *   - re-encodes via canvas, dropping all EXIF/metadata blocks,
 *   - resizes so the longest edge is <= 2048 px,
 *   - emits JPEG (quality 0.85, retrying down to 0.55 to land under 2 MB)
 *     unless the source is a PNG with a non-opaque pixel,
 *   - hashes the *output* bytes (the bytes Blossom will host).
 *
 * `extractExif` is intentionally minimal — just enough to assert before
 * vs after a transform that EXIF/GPS were stripped. It is **not** a
 * general-purpose EXIF parser.
 */

export type TransformedImage = {
  blob: Blob;
  sha256: string;
  dim: { w: number; h: number };
  mime: 'image/jpeg' | 'image/png';
  sizeBytes: number;
};

const MAX_EDGE = 2048;
const TARGET_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY_LADDER = [0.85, 0.75, 0.65, 0.55];

// ---------------------------------------------------------------------------
// transformImage
// ---------------------------------------------------------------------------

export async function transformImage(file: File): Promise<TransformedImage> {
  const bitmap = await decodeToBitmap(file);
  const { width: srcW, height: srcH } = bitmap;
  const longest = Math.max(srcW, srcH);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const keepPng =
    file.type === 'image/png' && (await hasTransparency(bitmap, srcW, srcH));
  const mime: 'image/jpeg' | 'image/png' = keepPng ? 'image/png' : 'image/jpeg';

  let blob = await encode(bitmap, w, h, mime, JPEG_QUALITY_LADDER[0]!);
  if (mime === 'image/jpeg' && blob.size > TARGET_BYTES) {
    for (let i = 1; i < JPEG_QUALITY_LADDER.length; i++) {
      blob = await encode(bitmap, w, h, mime, JPEG_QUALITY_LADDER[i]!);
      if (blob.size <= TARGET_BYTES) break;
    }
    if (blob.size > TARGET_BYTES) {
      console.warn(
        `[image] JPEG still ${blob.size} bytes after quality 0.55; ` +
          `accepting (best effort).`,
      );
    }
  }

  // Release bitmap if the runtime supports it.
  if (typeof (bitmap as ImageBitmap).close === 'function') {
    try {
      (bitmap as ImageBitmap).close();
    } catch {
      // ignore
    }
  }

  const arrBuf = await blob.arrayBuffer();
  const sha256 = await sha256Hex(arrBuf);
  return { blob, sha256, dim: { w, h }, mime, sizeBytes: blob.size };
}

type BitmapLike = {
  width: number;
  height: number;
  close?: () => void;
};

async function decodeToBitmap(file: File): Promise<BitmapLike> {
  if (typeof globalThis.createImageBitmap === 'function') {
    return globalThis.createImageBitmap(file);
  }
  // Fallback: HTMLImageElement. Used in test environments (happy-dom)
  // and very old webviews.
  return new Promise<BitmapLike>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e instanceof Error ? e : new Error('image decode failed'));
    };
    img.src = url;
  });
}

async function hasTransparency(
  bitmap: BitmapLike,
  srcW: number,
  srcH: number,
): Promise<boolean> {
  // Probe on a small downsampled canvas to keep this cheap.
  const probeMax = 64;
  const probeScale = Math.min(1, probeMax / Math.max(srcW, srcH));
  const pw = Math.max(1, Math.round(srcW * probeScale));
  const ph = Math.max(1, Math.round(srcH * probeScale));
  const { ctx } = makeCanvas(pw, ph);
  if (!ctx) return false;
  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, pw, ph);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, pw, ph).data;
  } catch {
    return false;
  }
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a !== undefined && a < 255) return true;
  }
  return false;
}

async function encode(
  bitmap: BitmapLike,
  w: number,
  h: number,
  mime: 'image/jpeg' | 'image/png',
  quality: number,
): Promise<Blob> {
  const { canvas, ctx } = makeCanvas(w, h);
  if (ctx) {
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, w, h);
  }
  // OffscreenCanvas path
  if (
    typeof OffscreenCanvas !== 'undefined' &&
    canvas instanceof OffscreenCanvas
  ) {
    return canvas.convertToBlob({ type: mime, quality });
  }
  // HTMLCanvasElement path
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('canvas.toBlob produced null'));
      },
      mime,
      quality,
    );
  });
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): {
  canvas: AnyCanvas;
  ctx: AnyCtx | null;
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    return { canvas: c, ctx };
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return { canvas: c, ctx };
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return s;
}

// ---------------------------------------------------------------------------
// extractExif (test-only verifier; see module header)
// ---------------------------------------------------------------------------

export async function extractExif(
  file: File,
): Promise<Record<string, unknown>> {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  if (view.byteLength < 4) return { hasExif: false, hasGps: false };

  // JPEG: starts with 0xFFD8.
  if (view.getUint16(0) === 0xffd8) {
    return parseJpegExif(view, u8);
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47
  ) {
    return parsePngMetadata(view, u8);
  }
  return { hasExif: false, hasGps: false };
}

function parseJpegExif(
  view: DataView,
  u8: Uint8Array,
): Record<string, unknown> {
  const out: Record<string, unknown> = { hasExif: false, hasGps: false };
  let off = 2;
  const len = view.byteLength;
  while (off < len - 1) {
    if (u8[off] !== 0xff) break;
    const marker = u8[off + 1] ?? 0;
    off += 2;
    // Standalone markers (no length): 0xD0–0xD9, 0x01.
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue;
    if (off + 2 > len) break;
    const segLen = view.getUint16(off);
    if (segLen < 2 || off + segLen > len) break;
    if (marker === 0xe1) {
      // APP1: check for "Exif\0\0".
      const headStart = off + 2;
      if (
        headStart + 6 <= len &&
        u8[headStart] === 0x45 &&
        u8[headStart + 1] === 0x78 &&
        u8[headStart + 2] === 0x69 &&
        u8[headStart + 3] === 0x66 &&
        u8[headStart + 4] === 0x00 &&
        u8[headStart + 5] === 0x00
      ) {
        out.hasExif = true;
        const tiffStart = headStart + 6;
        parseTiffForGps(view, tiffStart, off + segLen, out);
      }
    }
    off += segLen;
  }
  return out;
}

function parseTiffForGps(
  view: DataView,
  tiffStart: number,
  segEnd: number,
  out: Record<string, unknown>,
): void {
  if (tiffStart + 8 > segEnd) return;
  const byte0 = view.getUint8(tiffStart);
  const byte1 = view.getUint8(tiffStart + 1);
  const little = byte0 === 0x49 && byte1 === 0x49;
  const big = byte0 === 0x4d && byte1 === 0x4d;
  if (!little && !big) return;
  const magic = view.getUint16(tiffStart + 2, little);
  if (magic !== 0x002a) return;
  const ifd0Off = view.getUint32(tiffStart + 4, little);
  const ifd0Abs = tiffStart + ifd0Off;
  if (ifd0Abs + 2 > segEnd) return;
  const count = view.getUint16(ifd0Abs, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd0Abs + 2 + i * 12;
    if (entry + 12 > segEnd) return;
    const tag = view.getUint16(entry, little);
    if (tag === 0x8825) {
      // GPS sub-IFD pointer (LONG).
      const gpsOff = view.getUint32(entry + 8, little);
      out.hasGps = true;
      parseGpsIfd(view, tiffStart + gpsOff, tiffStart, segEnd, little, out);
      return;
    }
  }
}

function parseGpsIfd(
  view: DataView,
  ifdAbs: number,
  tiffStart: number,
  segEnd: number,
  little: boolean,
  out: Record<string, unknown>,
): void {
  if (ifdAbs + 2 > segEnd) return;
  const count = view.getUint16(ifdAbs, little);
  for (let i = 0; i < count; i++) {
    const entry = ifdAbs + 2 + i * 12;
    if (entry + 12 > segEnd) return;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const valCount = view.getUint32(entry + 4, little);
    if (tag === 0x0001 && type === 2 && valCount >= 1) {
      out.GPSLatitudeRef = String.fromCharCode(view.getUint8(entry + 8));
    } else if (tag === 0x0003 && type === 2 && valCount >= 1) {
      out.GPSLongitudeRef = String.fromCharCode(view.getUint8(entry + 8));
    } else if ((tag === 0x0002 || tag === 0x0004) && type === 5) {
      // RATIONAL[3] — degrees, minutes, seconds.
      const dataOff = view.getUint32(entry + 8, little) + tiffStart;
      const parts: number[] = [];
      for (let r = 0; r < Math.min(3, valCount); r++) {
        if (dataOff + r * 8 + 8 > segEnd) break;
        const num = view.getUint32(dataOff + r * 8, little);
        const den = view.getUint32(dataOff + r * 8 + 4, little);
        parts.push(den === 0 ? 0 : num / den);
      }
      const dec = (parts[0] || 0) + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
      if (tag === 0x0002) out.GPSLatitude = dec;
      else out.GPSLongitude = dec;
    }
  }
}

function parsePngMetadata(
  view: DataView,
  u8: Uint8Array,
): Record<string, unknown> {
  const out: Record<string, unknown> = { hasExif: false, hasGps: false };
  let off = 8;
  const len = view.byteLength;
  while (off + 8 <= len) {
    const chunkLen = view.getUint32(off);
    const t0 = u8[off + 4] ?? 0;
    const t1 = u8[off + 5] ?? 0;
    const t2 = u8[off + 6] ?? 0;
    const t3 = u8[off + 7] ?? 0;
    const type = String.fromCharCode(t0, t1, t2, t3);
    if (type === 'IEND') break;
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      out.hasExif = true; // textual metadata — treat as "metadata present".
    } else if (type === 'eXIf') {
      out.hasExif = true;
      // Embedded TIFF stream — reuse GPS detector.
      const tiffStart = off + 8;
      parseTiffForGps(view, tiffStart, tiffStart + chunkLen, out);
    }
    off += 8 + chunkLen + 4; // length+type+data+crc
  }
  return out;
}
