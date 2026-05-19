/**
 * SPEC-027 tests.
 *
 * Canvas approach: happy-dom exposes `HTMLCanvasElement` with `toBlob` but
 * its `getContext('2d')` returns null, and it has no `createImageBitmap` /
 * `OffscreenCanvas`. Rather than skip the integration tests, we install
 * thin globals that simulate the browser pipeline: `createImageBitmap`
 * yields a `{ width, height }` stub, canvas context methods are stubbed,
 * and `toBlob` synthesizes a Blob whose size we control via the bitmap's
 * encoded-pixel-count proxy. This lets us exercise the *logic* of
 * `transformImage` (resize math, mime selection, hashing, quality
 * fallback) without a real raster engine.
 *
 * For `extractExif` we use real, hand-crafted JPEG/PNG byte streams —
 * no canvas needed — so EXIF/GPS round-tripping is genuinely validated.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { extractExif, transformImage } from './image';

// ---------------------------------------------------------------------------
// Hand-crafted JPEG with a tiny EXIF/GPS payload.
// ---------------------------------------------------------------------------

/**
 * Build a JPEG that:
 *   - has a valid SOI marker,
 *   - carries a single APP1 segment with an EXIF block (IFD0 → GPS sub-IFD),
 *   - has an EOI marker.
 *
 * Image data is *not* needed for extractExif — the parser only walks
 * markers. This keeps the fixture deterministic.
 */
function jpegWithGps(): Uint8Array {
  // ----- Build EXIF payload (TIFF + IFD0 + GPS IFD). -----
  // Layout (offsets relative to TIFF start):
  //   0x00 II*\0  (little-endian header) + IFD0 offset = 0x08
  //   0x08 IFD0: count=1, entry GPSInfo (0x8825) LONG x1 -> offset of GPS IFD
  //   0x08+2+12 = 0x16 next-IFD offset = 0
  //   0x1A GPS IFD start: count=3
  //        entry 1: tag 0x0001 (GPSLatitudeRef) ASCII x2 "N\0"
  //        entry 2: tag 0x0002 (GPSLatitude) RATIONAL x3 -> offset
  //        entry 3: tag 0x0003 (GPSLongitudeRef) ASCII x2 "E\0"
  //   GPS IFD = 2 + 3*12 + 4 = 42 bytes -> ends at 0x1A + 42 = 0x44
  //   0x44 RATIONAL[3] data: 39/1, 7/1, 48/10  (3*8=24 bytes)
  const tiff: number[] = [];
  // Header
  tiff.push(0x49, 0x49); // 'II' little-endian
  pushU16LE(tiff, 0x002a); // magic
  pushU32LE(tiff, 0x00000008); // IFD0 offset

  // IFD0
  pushU16LE(tiff, 1); // 1 entry
  pushU16LE(tiff, 0x8825); // GPSInfo
  pushU16LE(tiff, 4); // LONG
  pushU32LE(tiff, 1); // count
  pushU32LE(tiff, 0x0000001a); // value = pointer to GPS IFD
  pushU32LE(tiff, 0); // next IFD = none

  // GPS IFD at offset 0x1a
  pushU16LE(tiff, 3); // 3 entries

  // entry: GPSLatitudeRef ASCII[2] "N\0" — fits inline
  pushU16LE(tiff, 0x0001);
  pushU16LE(tiff, 2); // ASCII
  pushU32LE(tiff, 2); // count
  tiff.push(0x4e, 0x00, 0x00, 0x00); // "N\0\0\0"

  // entry: GPSLatitude RATIONAL[3] -> offset 0x44
  pushU16LE(tiff, 0x0002);
  pushU16LE(tiff, 5); // RATIONAL
  pushU32LE(tiff, 3); // count
  pushU32LE(tiff, 0x00000044); // value offset

  // entry: GPSLongitudeRef ASCII[2] "E\0"
  pushU16LE(tiff, 0x0003);
  pushU16LE(tiff, 2);
  pushU32LE(tiff, 2);
  tiff.push(0x45, 0x00, 0x00, 0x00);

  // next IFD = 0
  pushU32LE(tiff, 0);

  // RATIONAL data at 0x44: (39/1, 7/1, 48/10)
  pushU32LE(tiff, 39);
  pushU32LE(tiff, 1);
  pushU32LE(tiff, 7);
  pushU32LE(tiff, 1);
  pushU32LE(tiff, 48);
  pushU32LE(tiff, 10);

  // ----- Wrap in APP1 with "Exif\0\0" header. -----
  const exifPayload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const segLen = exifPayload.length + 2; // length field includes itself

  const bytes: number[] = [];
  bytes.push(0xff, 0xd8); // SOI
  bytes.push(0xff, 0xe1); // APP1
  pushU16BE(bytes, segLen);
  for (const b of exifPayload) bytes.push(b);
  // Minimal "image": a tiny SOS-like filler is unnecessary for parser.
  bytes.push(0xff, 0xd9); // EOI
  return new Uint8Array(bytes);
}

function jpegBareMinimal(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
}

function pushU16LE(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >> 8) & 0xff);
}
function pushU32LE(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
}
function pushU16BE(arr: number[], v: number): void {
  arr.push((v >> 8) & 0xff, v & 0xff);
}

function pngWithtEXt(): Uint8Array {
  // PNG sig + IHDR + tEXt("Comment\0hello") + IEND.
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = chunk('IHDR', [
    0, 0, 0, 1, // width 1
    0, 0, 0, 1, // height 1
    8, // bit depth
    2, // color type RGB
    0,
    0,
    0,
  ]);
  const text = chunk('tEXt', [
    ...stringBytes('Comment'),
    0,
    ...stringBytes('hello'),
  ]);
  const iend = chunk('IEND', []);
  return new Uint8Array([...sig, ...ihdr, ...text, ...iend]);
}

function pngBare(): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const iend = chunk('IEND', []);
  return new Uint8Array([...sig, ...ihdr, ...iend]);
}

function chunk(type: string, data: number[]): number[] {
  const len: number[] = [];
  pushU32BE(len, data.length);
  const t = stringBytes(type);
  // CRC not validated by our parser; emit zeros.
  return [...len, ...t, ...data, 0, 0, 0, 0];
}
function pushU32BE(arr: number[], v: number): void {
  arr.push(
    (v >>> 24) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 8) & 0xff,
    v & 0xff,
  );
}
function stringBytes(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Canvas pipeline shim. Installed before transformImage tests; uninstalled
// after. Intentionally minimal — just enough to exercise the code paths.
// ---------------------------------------------------------------------------

type Shim = {
  alpha: boolean; // simulate "PNG has transparency"
  bigJpeg: boolean; // first encode returns >2 MB
};

function installCanvasShim(opts: Partial<Shim> = {}): Shim {
  const shim: Shim = { alpha: false, bigJpeg: false, ...opts };

  // createImageBitmap → return source dims based on a tag the test sets.
  (globalThis as unknown as Record<string, unknown>).createImageBitmap = vi
    .fn()
    .mockImplementation(async (file: File) => {
      const dims = (file as unknown as { __dims?: { w: number; h: number } })
        .__dims ?? { w: 100, h: 100 };
      return { width: dims.w, height: dims.h, close: () => {} };
    });

  // Stub a 2D context returned from canvas.getContext('2d').
  const ctxStub = {
    drawImage: () => {},
    fillRect: () => {},
    fillStyle: '',
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      // Fill RGB, alpha = shim.alpha ? 200 : 255
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = shim.alpha ? 200 : 255;
      }
      return { data, width: w, height: h };
    },
  };
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>)
    .getContext = function patchedGetContext(type: string) {
    if (type === '2d') return ctxStub;
    return origGetContext.call(this, type as '2d');
  };

  // toBlob: synthesize a Blob whose bytes depend on (mime, quality, w, h).
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toBlob =
    function patchedToBlob(
      cb: (b: Blob) => void,
      mime: string,
      quality: number,
    ) {
      const self = this as unknown as HTMLCanvasElement;
      const w = self.width;
      const h = self.height;
      const isJpeg = mime === 'image/jpeg';
      let size: number;
      if (isJpeg) {
        if (shim.bigJpeg && quality >= 0.85) {
          size = 3 * 1024 * 1024;
        } else if (shim.bigJpeg && quality >= 0.75) {
          size = 2.5 * 1024 * 1024;
        } else if (shim.bigJpeg && quality >= 0.65) {
          size = 1.5 * 1024 * 1024;
        } else {
          size = Math.max(64, Math.floor(w * h * quality * 0.1));
        }
      } else {
        size = Math.max(64, w * h * 4);
      }
      const bytes = new Uint8Array(size);
      // Make output deterministic for sha-stability test.
      for (let i = 0; i < Math.min(bytes.length, 64); i++) {
        bytes[i] = i & 0xff;
      }
      setTimeout(
        () => cb(new Blob([bytes as BlobPart], { type: mime })),
        0,
      );
    };

  return shim;
}

function uninstallCanvasShim(): void {
  delete (globalThis as unknown as Record<string, unknown>).createImageBitmap;
  // Remove our patched own-property overrides; prototype originals re-emerge.
  delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>)
    .getContext;
  delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>)
    .toBlob;
}

function fileWithDims(
  bytes: Uint8Array,
  name: string,
  type: string,
  dims: { w: number; h: number },
): File {
  const f = new File([bytes as BlobPart], name, { type });
  (f as unknown as { __dims: { w: number; h: number } }).__dims = dims;
  return f;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractExif', () => {
  it('detects EXIF + GPS in a hand-crafted JPEG', async () => {
    const f = new File([jpegWithGps() as BlobPart], 'gps.jpg', {
      type: 'image/jpeg',
    });
    const meta = await extractExif(f);
    expect(meta.hasExif).toBe(true);
    expect(meta.hasGps).toBe(true);
    expect(meta.GPSLatitudeRef).toBe('N');
    expect(meta.GPSLongitudeRef).toBe('E');
    // 39 + 7/60 + 4.8/3600 ≈ 39.118
    expect(typeof meta.GPSLatitude).toBe('number');
    expect(meta.GPSLatitude as number).toBeGreaterThan(39);
    expect(meta.GPSLatitude as number).toBeLessThan(40);
  });

  it('reports no EXIF for a bare JPEG', async () => {
    const f = new File([jpegBareMinimal() as BlobPart], 'bare.jpg', {
      type: 'image/jpeg',
    });
    const meta = await extractExif(f);
    expect(meta.hasExif).toBe(false);
    expect(meta.hasGps).toBe(false);
  });

  it('detects tEXt metadata in PNG', async () => {
    const f = new File([pngWithtEXt() as BlobPart], 'meta.png', {
      type: 'image/png',
    });
    const meta = await extractExif(f);
    expect(meta.hasExif).toBe(true);
  });

  it('reports no EXIF for a bare PNG', async () => {
    const f = new File([pngBare() as BlobPart], 'bare.png', {
      type: 'image/png',
    });
    const meta = await extractExif(f);
    expect(meta.hasExif).toBe(false);
  });
});

describe('transformImage', () => {
  let shim: Shim;
  beforeEach(() => {
    shim = installCanvasShim();
  });
  afterEach(() => {
    uninstallCanvasShim();
    vi.restoreAllMocks();
  });

  it('strips EXIF/GPS round-trip', async () => {
    const f = fileWithDims(jpegWithGps(), 'in.jpg', 'image/jpeg', {
      w: 200,
      h: 150,
    });
    const before = await extractExif(f);
    expect(before.hasGps).toBe(true);

    const result = await transformImage(f);
    expect(result.sizeBytes).toBeLessThanOrEqual(2 * 1024 * 1024);

    const out = new File([result.blob], 'out.jpg', { type: result.mime });
    const after = await extractExif(out);
    expect(after.hasExif).toBe(false);
    expect(after.hasGps).toBe(false);
  });

  it('downscales longest edge to 2048', async () => {
    const f = fileWithDims(jpegBareMinimal(), 'big.jpg', 'image/jpeg', {
      w: 3000,
      h: 2000,
    });
    const r = await transformImage(f);
    expect(Math.max(r.dim.w, r.dim.h)).toBe(2048);
    // Aspect preserved: 3000:2000 = 3:2 → 2048 × 1365.
    expect(r.dim.w).toBe(2048);
    expect(r.dim.h).toBe(Math.round((2000 * 2048) / 3000));
  });

  it('opaque PNG re-encodes to JPEG', async () => {
    shim.alpha = false;
    const f = fileWithDims(pngBare(), 'opaque.png', 'image/png', {
      w: 200,
      h: 150,
    });
    const r = await transformImage(f);
    expect(r.mime).toBe('image/jpeg');
  });

  it('PNG with transparency stays PNG', async () => {
    shim.alpha = true;
    const f = fileWithDims(pngBare(), 'alpha.png', 'image/png', {
      w: 200,
      h: 150,
    });
    const r = await transformImage(f);
    expect(r.mime).toBe('image/png');
  });

  it('same input yields same sha256', async () => {
    const f1 = fileWithDims(jpegBareMinimal(), 'a.jpg', 'image/jpeg', {
      w: 100,
      h: 100,
    });
    const f2 = fileWithDims(jpegBareMinimal(), 'b.jpg', 'image/jpeg', {
      w: 100,
      h: 100,
    });
    const r1 = await transformImage(f1);
    const r2 = await transformImage(f2);
    expect(r1.sha256).toBe(r2.sha256);
    expect(r1.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to lower JPEG quality when oversized', async () => {
    shim.bigJpeg = true;
    const f = fileWithDims(jpegBareMinimal(), 'huge.jpg', 'image/jpeg', {
      w: 4000,
      h: 3000,
    });
    const r = await transformImage(f);
    // Ladder: 0.85 → 3MB, 0.75 → 2.5MB, 0.65 → 1.5MB ✓
    expect(r.sizeBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  });
});
