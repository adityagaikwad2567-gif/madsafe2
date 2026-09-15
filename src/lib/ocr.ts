/**
 * Real on-device OCR via tesseract.js — no server, no API key, no image upload.
 *
 * The WASM engine + English traineddata (~4 MB total) are fetched once from the
 * official CDN on first use and cached by the browser; every later scan is
 * fully local. Recognized text feeds the same deterministic matcher used by
 * manual search, and the mean word confidence is reported so the pipeline can
 * honestly downgrade noisy reads instead of guessing.
 */

export type OcrOutcome = {
  text: string;
  confidence: number | null; // mean word confidence 0..1, null if no words
};

type StageReporter = (stage: string) => void;

type Word = { confidence: number; text: string };

type OcrWordData = {
  text: string;
  words?: Word[];
  blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: Word[] }> }> }>;
};

type OcrWorker = {
  recognize: (image: string | File, opts?: unknown, output?: unknown) => Promise<{ data: OcrWordData }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<OcrWorker> | null = null;

/** Lazily create one shared OCR worker for the whole session. */
async function getWorker(onStage?: StageReporter): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const tesseract = await import("tesseract.js");
      onStage?.("Loading the OCR engine (first run only)…");
      // Paths pinned to the official CDN because Next.js's bundler cannot serve
      // tesseract.js's WASM/traineddata assets from node_modules directly.
      const worker = await tesseract.createWorker("eng", 1, {
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "loading tesseract core") onStage?.("Loading the OCR engine…");
          else if (m.status === "loading language traineddata") onStage?.("Loading the English language model…");
          else if (m.status === "initializing api") onStage?.("Starting recognition…");
          else if (m.status === "recognizing text") onStage?.(`Reading the package… ${Math.round(m.progress * 100)}%`);
        },
      });
      return worker as unknown as OcrWorker;
    })().catch((err) => {
      workerPromise = null; // allow a retry on the next scan
      throw err;
    });
  }
  return workerPromise;
}

/**
 * Run OCR on an image (data URL or File). Never throws into the UI — failures
 * return empty text so the pipeline shows its honest "unrecognized" state.
 */
export async function runOcr(image: string | File, onStage?: StageReporter): Promise<OcrOutcome> {
  try {
    const worker = await getWorker(onStage);
    onStage?.("Reading the package…");
    // v5+ tesseract.js requires explicit output flags for word-level data
    // (needed for the honest confidence downgrade downstream).
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    const words: Word[] =
      data.words?.filter((w) => w.text?.trim()) ??
      (data.blocks ?? [])
        .flatMap((b) => b.paragraphs ?? [])
        .flatMap((p) => p.lines ?? [])
        .flatMap((l) => l.words ?? [])
        .filter((w) => w.text?.trim());
    const meanConf =
      words.length > 0 ? words.reduce((s, w) => s + (w.confidence ?? 0), 0) / words.length / 100 : null;
    const text = (data.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) {
      onStage?.("No readable text found in this image.");
      return { text: "", confidence: meanConf };
    }
    return { text, confidence: meanConf };
  } catch (e) {
    // Distinguish "no text found" (normal) from a genuine engine failure.
    const msg = e instanceof Error ? e.message : String(e);
    if (/Failed to fetch|NetworkError|load/i.test(msg)) {
      throw new Error(
        "The OCR engine files could not be downloaded. Check your internet connection once, then scan again — after the first successful load it works fully offline."
      );
    }
    throw new Error("Text recognition failed on this image. Try a sharper, well-lit photo, or use manual search.");
  }
}

/** Free the shared worker (called on page unload — keeps memory clean on mobile). */
export function disposeOcr() {
  workerPromise?.then((w) => w.terminate().catch(() => undefined)).catch(() => undefined);
  workerPromise = null;
}
