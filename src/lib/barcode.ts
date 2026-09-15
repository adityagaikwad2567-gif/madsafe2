/**
 * Real barcode/QR decoding — dual engine, no external API.
 *
 *  1. BarcodeDetector API (Chrome/Android, hardware-accelerated) when present.
 *  2. ZXing (@zxing/library, pure JS) as the universal fallback.
 *
 * Supports EAN-13/EAN-8/UPC/Code128/Code39/ITF/QR — the encodings found on
 * Indian medicine packs. Decoding happens entirely on the device.
 */

export type DetectedCode = { value: string; format: string };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

type DetectorLike = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string; format?: string }>> };

async function getDetector(): Promise<DetectorLike | null> {
  const w = window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => DetectorLike };
  if (!w.BarcodeDetector) return null;
  try {
    return new w.BarcodeDetector({ formats: FORMATS });
  } catch {
    return null;
  }
}

/** ZXing fallback — dynamically imported so it never enters the initial bundle. */
async function zxingDecode(source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement): Promise<DetectedCode | null> {
  try {
    const zx = await import("@zxing/library");
    const reader = new zx.BrowserMultiFormatReader();
    // ZXing 0.23 ships partial TS types; these methods exist at runtime
    // (verified against the prototype chain) — minimal local typing instead.
    const r = reader as unknown as {
      decodeFromImageUrl: (url: string) => Promise<{ getText: () => string; getBarcodeFormat: () => unknown }>;
      reset: () => void;
    };
    try {
      const canvas = await toCanvas(source);
      const result = await r.decodeFromImageUrl(canvas.toDataURL("image/png"));
      return { value: result.getText(), format: String(result.getBarcodeFormat()) };
    } finally {
      r.reset();
    }
  } catch {
    return null;
  }
}

/** Normalizes any image source to a canvas (ZXing's decodeFromCanvas requirement). */
async function toCanvas(source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement): Promise<HTMLCanvasElement> {
  if (source instanceof HTMLCanvasElement) return source;
  const canvas = document.createElement("canvas");
  if (source instanceof HTMLVideoElement) {
    canvas.width = source.videoWidth || 640;
    canvas.height = source.videoHeight || 480;
  } else {
    canvas.width = source.naturalWidth || source.width || 640;
    canvas.height = source.naturalHeight || source.height || 480;
  }
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Decode a barcode/QR from a captured canvas (camera frame). */
export async function decodeBarcodeFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const detector = await getDetector();
  if (detector) {
    try {
      const hits = await detector.detect(canvas);
      if (hits[0]?.rawValue) return hits[0].rawValue;
    } catch {
      /* fall through to ZXing */
    }
  }
  const zx = await zxingDecode(canvas);
  return zx?.value ?? null;
}

/** Decode a barcode/QR from an uploaded image File. */
export async function decodeBarcodeFromFile(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await decodeBarcodeFromCanvas(canvas);
  } catch {
    return null;
  }
}
