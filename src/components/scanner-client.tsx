"use client";

/**
 * MedSafe scanner — REAL recognition, no demo substitution.
 *
 *  • Camera mode   : live getUserMedia preview; on error an honest message and
 *                    a manual path — never a silent demo scan.
 *  • Capture       : grabs a frame and runs REAL on-device OCR (tesseract.js).
 *  • Barcode mode  : live decode from the video stream (BarcodeDetector API,
 *                    ZXing fallback) — plus manual entry and file decode.
 *  • Upload        : REAL barcode attempt + REAL OCR on the actual image.
 *  • Voice         : real SpeechRecognition when the browser provides it.
 *
 * Every failure state is shown to the user. The app never pretends a scan
 * succeeded and never substitutes a demo medicine for an unrecognized one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Glasses } from "lucide-react";
import Link from "next/link";
import {
  Camera, Upload, Barcode, Search, Mic, ScanLine, Loader2, AlertTriangle, CheckCircle2, HelpCircle,
  Video, VideoOff, CameraOff, Pencil, Keyboard, MicOff,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { decodeBarcodeFromCanvas, decodeBarcodeFromFile } from "@/lib/barcode";
import { runOcr } from "@/lib/ocr";

type Step = { label: string; detail: string; status: "done" | "pending" };
type Candidate = {
  slug: string; name: string; brand_name: string | null; generic_name: string | null;
  manufacturer: string | null; strength: string | null;
};
type ScanResult = {
  status: "identified" | "uncertain" | "not_found";
  message: string;
  confidence: number | null;
  candidates: Candidate[];
  steps: Step[];
  ocrText: string[];
};

type Mode = "camera" | "upload" | "barcode" | "manual" | "voice";

type ZxContinuousReader = {
  decodeFromVideoElementContinuously: (v: HTMLVideoElement, cb: (res: string | null, err?: unknown) => void) => void;
  reset: () => void;
};

const SCAN_STEPS_LABELS = [
  "Image captured / decoded",
  "OCR & barcode extraction",
  "Medicine identification",
  "Verified database lookup",
  "Safety analysis",
];

export function ScannerClient() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => {
    const p = params.get("mode");
    // Whitelist: old links may carry ?mode=demo — sanitize to a real mode.
    return p && ["camera", "upload", "barcode", "manual", "voice"].includes(p) ? (p as Mode) : "camera";
  });
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null); // real processing stage text
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [barcodeHit, setBarcodeHit] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanRef = useRef(false); // guards the continuous barcode loop

  useEffect(() => {
    return () => {
      scanRef.current = false;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const stopCamera = useCallback(() => {
    scanRef.current = false;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCameraOn(false);
    setBarcodeHit(null);
  }, []);

  /** Real pipeline: sends recognized text/code to the matcher. No demo injection. */
  const identify = useCallback(
    async (payload: { mode: Mode; query?: string; barcode?: string; ocrConfidence?: number }) => {
      setBusy(true);
      setResult(null);
      setStage(null);
      setSteps(SCAN_STEPS_LABELS.map((label, i) => ({ label, detail: i === 0 ? "current" : "pending", status: "pending" })));
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data: ScanResult = await res.json();
        setSteps(data.steps.map((s) => ({ ...s, status: "done", detail: "completed" })));
        setResult(data);
      } catch {
        setResult(null);
        setSteps(null);
        setStage("Could not reach the MedSafe server. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const openCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "This browser does not expose camera capture (requires HTTPS or a compatible browser). Use image upload or manual search instead."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (e) {
      setCameraOn(false);
      const name = (e as DOMException)?.name;
      setCameraError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings, or use image upload / manual search below."
          : name === "NotFoundError"
            ? "No camera was found on this device. Use image upload or manual search instead."
            : "Camera could not be started. Use image upload or manual search instead."
      );
    }
  }, []);

  /** REAL OCR on the live video frame. */
  const captureFromCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    stopCamera();
    setBusy(true);
    setResult(null);
    setSteps(SCAN_STEPS_LABELS.map((label, i) => ({ label, detail: i === 0 ? "current" : "pending", status: "pending" })));
    setStage("Capturing frame…");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    // Barcode first (fast, exact); OCR otherwise.
    const code = await decodeBarcodeFromCanvas(canvas);
    if (code) {
      setStage(null);
      await identify({ mode: "barcode", barcode: code });
      return;
    }
    setStage("Running on-device OCR — first run downloads the language model…");
    const ocr = await runOcr(dataUrl, setStage);
    setQuery(ocr.text);
    setStage(null);
    await identify({ mode: "camera", query: ocr.text, ocrConfidence: ocr.confidence ?? undefined });
  }, [stopCamera, identify]);

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setResult(null);
        setSteps(null);
        setStage("That file is not an image. Please upload a JPG or PNG photo of the medicine package.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setResult(null);
        setSteps(null);
        setStage("That image is larger than 10 MB. Please upload a smaller photo.");
        return;
      }
      setBusy(true);
      setResult(null);
      setSteps(SCAN_STEPS_LABELS.map((label, i) => ({ label, detail: i === 0 ? "current" : "pending", status: "pending" })));
      setStage("Checking for a barcode…");
      const code = await decodeBarcodeFromFile(file);
      if (code) {
        setStage(null);
        await identify({ mode: "barcode", barcode: code });
        return;
      }
      setStage("Running on-device OCR — first run downloads the language model…");
      const ocr = await runOcr(file, setStage);
      setQuery(ocr.text);
      setStage(null);
      await identify({ mode: "upload", query: ocr.text, ocrConfidence: ocr.confidence ?? undefined });
    },
    [identify]
  );

  /** Continuous REAL barcode detection from the live stream. */
  const startLiveBarcode = useCallback(async () => {
    setCameraError(null);
    await openCamera();
    scanRef.current = true;
    setBarcodeHit(null);
    let detector: { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } | null = null;
    try {
      const w = window as unknown as { BarcodeDetector?: new (o?: unknown) => { detect: (s: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } };
      if (w.BarcodeDetector) detector = new w.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] });
    } catch {
      detector = null;
    }
    let reader: ZxContinuousReader | null = null;
    if (!detector) {
      try {
        const zx = await import("@zxing/library");
        // ZXing 0.23's TS types omit the continuous-decode helpers that exist
        // at runtime — verified against the prototype chain.
        reader = new zx.BrowserMultiFormatReader() as unknown as ZxContinuousReader;
      } catch {
        setCameraError("Barcode detection is not available in this browser. Type the number below the pack instead.");
        return;
      }
    }
    const tick = async () => {
      if (!scanRef.current) return;
      const video = videoRef.current;
      if (detector && video && video.readyState >= 2) {
        try {
          const hits = await detector.detect(video);
          if (hits[0]?.rawValue) {
            const value = hits[0].rawValue;
            setBarcodeHit(value);
            scanRef.current = false;
            await identify({ mode: "barcode", barcode: value });
            return;
          }
        } catch {
          /* transient decode errors are expected on blurry frames */
        }
      }
      setTimeout(tick, 220);
    };
    if (reader && videoRef.current) {
      reader.decodeFromVideoElementContinuously(videoRef.current, (res: string | null) => {
        if (res && scanRef.current) {
          setBarcodeHit(res);
          scanRef.current = false;
          reader.reset();
          identify({ mode: "barcode", barcode: res });
        }
      });
    } else {
      void tick();
    }
  }, [openCamera, identify]);

  const startVoice = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string; onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
        onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string; onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
        onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void;
      };
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setVoiceUnavailable(true);
      return;
    }
    const rec = new SR();
    rec.lang = lang === "hi" ? "hi-IN" : lang === "mr" ? "mr-IN" : "en-IN";
    setListening(true);
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      setQuery(text);
      if (text) identify({ mode: "voice", query: text });
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") setStage("Microphone permission was denied. Allow mic access, or type the medicine name instead.");
    };
    rec.onend = () => setListening(false);
    rec.start();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">{t("scan.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("scan.sub")}</p>
      </div>

      {/* Mode tabs */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([
          { id: "camera", icon: Camera, label: t("scan.camera") },
          { id: "upload", icon: Upload, label: t("scan.upload") },
          { id: "barcode", icon: Barcode, label: t("scan.barcode") },
          { id: "manual", icon: Search, label: t("scan.manual") },
          { id: "voice", icon: Mic, label: t("scan.voice") },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { if (mode !== id) stopCamera(); setMode(id); }}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3.5 text-xs font-semibold transition ${
              mode === id
                ? "border-teal-500 bg-teal-50 text-teal-800 shadow-[var(--shadow-card)]"
                : "border-slate-200 bg-white text-slate-600 hover:border-teal-200"
            }`}
          >
            <Icon size={19} />
            <span className="text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      <Link
        href="/ar"
        className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white px-4 py-3 transition hover:border-teal-300"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white">
            <Glasses size={17} />
          </span>
          <span>
            <span className="block text-sm font-bold text-navy-900">AR Medicine Explainer</span>
            <span className="block text-xs text-slate-500">Project name, expiry & warning highlights onto a pack — new</span>
          </span>
        </span>
        <span className="text-xs font-semibold text-teal-700">Open →</span>
      </Link>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Input panel */}
        <Card>
          {mode === "camera" ? (
            <div>
              <div className="relative mb-4 aspect-video overflow-hidden rounded-2xl bg-navy-950">
                <video ref={videoRef} className={`h-full w-full object-cover ${cameraOn ? "" : "hidden"}`} muted playsInline />
                {!cameraOn ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-navy-200">
                    <ScanLine size={34} className="text-teal-400" />
                    <p className="text-xs">Camera preview appears here</p>
                    <div className="relative mt-2 h-10 w-10 overflow-hidden rounded-lg">
                      <div className="animate-scanline absolute inset-x-1 h-0.5 bg-teal-300" />
                    </div>
                  </div>
                ) : (
                  <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-teal-400/60" />
                )}
              </div>
              {cameraOn ? (
                <div className="flex flex-wrap gap-2">
                  <button onClick={captureFromCamera} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                    <ScanLine size={16} /> Capture &amp; identify
                  </button>
                  <button onClick={stopCamera} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                    <VideoOff size={15} /> Stop
                  </button>
                </div>
              ) : (
                <button onClick={openCamera} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
                  <Camera size={16} /> {t("scan.camera")}
                </button>
              )}
              {cameraError ? (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <CameraOff size={13} className="mt-0.5 shrink-0" />
                  {cameraError}
                </p>
              ) : (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                  <Video size={13} className="mt-0.5 shrink-0" />
                  Live preview uses your real camera. On capture, recognition runs on this device — the photo never leaves your phone unless you choose to identify.
                </p>
              )}
            </div>
          ) : null}

          {mode === "upload" ? (
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-teal-400 hover:bg-teal-50/40">
                <Upload size={26} className="text-teal-600" />
                <span className="text-sm font-semibold text-navy-900">{t("scan.upload")}</span>
                <span className="text-xs text-slate-500">JPG or PNG of the medicine strip / package · max 10 MB</span>
                <input type="file" accept="image/*" className="hidden" onChange={onFile} />
              </label>
              <p className="mt-3 text-xs text-slate-500">
                The image is processed on your device — only the recognized text is kept in privacy-friendly scan history.
              </p>
            </div>
          ) : null}

          {mode === "barcode" ? (
            <div>
              <div className="relative mb-4 aspect-video overflow-hidden rounded-2xl bg-navy-950">
                <video ref={videoRef} className={`h-full w-full object-cover ${cameraOn ? "" : "hidden"}`} muted playsInline />
                {!cameraOn ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-navy-200">
                    <Barcode size={34} className="text-teal-400" />
                    <p className="text-xs">Point the camera at the barcode</p>
                  </div>
                ) : barcodeHit ? (
                  <div className="absolute inset-x-4 bottom-4 rounded-xl bg-teal-600/90 px-3 py-2 text-center text-xs font-semibold text-white">
                    Detected: {barcodeHit}
                  </div>
                ) : (
                  <div className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-teal-400/70" />
                )}
              </div>
              {cameraOn ? (
                <button onClick={stopCamera} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                  <VideoOff size={15} /> Stop camera
                </button>
              ) : (
                <button onClick={startLiveBarcode} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
                  <Barcode size={16} /> Scan with camera
                </button>
              )}
              {cameraError ? (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <CameraOff size={13} className="mt-0.5 shrink-0" />
                  {cameraError}
                </p>
              ) : null}
              <div className="mt-4">
                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy-900">
                  <Keyboard size={13} /> Or type / paste the barcode or QR value
                </label>
                <div className="flex gap-2">
                  <input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    inputMode="numeric"
                    placeholder="e.g. 8901234500017"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  />
                  <button
                    onClick={() => barcode.trim() && identify({ mode: "barcode", barcode: barcode.trim() })}
                    disabled={busy || !barcode.trim()}
                    className="shrink-0 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    Identify
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                A barcode or QR code can help identify a product, but it cannot independently prove that a medicine is genuine or safe. Always check the packaging and consult a pharmacist when needed.
              </p>
            </div>
          ) : null}

          {mode === "manual" ? (
            <div>
              <label className="mb-2 block text-xs font-semibold text-navy-900">Medicine name</label>
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && query.trim() && identify({ mode: "manual", query })}
                  placeholder="e.g. Dolo 650, Coldrid, Moxikind-CV…"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
                <button
                  onClick={() => query.trim() && identify({ mode: "manual", query })}
                  disabled={busy || !query.trim()}
                  className="shrink-0 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  Search
                </button>
              </div>
              <ManualSuggestions onPick={(s) => { setQuery(s); identify({ mode: "manual", query: s }); }} />
            </div>
          ) : null}

          {mode === "voice" ? (
            <div>
              <button
                onClick={startVoice}
                disabled={busy}
                className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 px-6 py-10 transition ${
                  listening ? "border-teal-400 bg-teal-50" : "border-dashed border-slate-300 bg-slate-50 hover:border-teal-300"
                }`}
              >
                <span className={`flex h-14 w-14 items-center justify-center rounded-full ${listening ? "animate-pulse bg-teal-600 text-white" : "bg-white text-teal-600 shadow"}`}>
                  <Mic size={24} />
                </span>
                <span className="text-sm font-semibold text-navy-900">
                  {listening ? "Listening…" : t("scan.voice")}
                </span>
                <span className="text-xs text-slate-500">English · हिंदी · मराठी — uses your browser&rsquo;s speech recognition</span>
              </button>
              {voiceUnavailable ? (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <MicOff size={13} className="mt-0.5 shrink-0" />
                  Voice input is not available in this browser (works best in Chrome / Edge). Type the medicine name instead.
                </p>
              ) : null}
              {query ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Heard: “{query}”</p> : null}
            </div>
          ) : null}
        </Card>

        {/* Pipeline + result panel */}
        <div>
          <Card className="mb-4">
            <h2 className="mb-3 text-sm font-bold text-navy-900">{t("scan.steps")}</h2>
            {stage ? (
              <p className="mb-3 flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-xs font-medium text-teal-800">
                <Loader2 size={14} className="animate-spin" /> {stage}
              </p>
            ) : null}
            {steps ? (
              <ol className="space-y-2.5">
                {steps.map((s) => (
                  <li key={s.label} className="flex items-center gap-2.5 text-sm">
                    {s.status === "done" ? (
                      <CheckCircle2 size={16} className="shrink-0 text-teal-600" />
                    ) : busy && s.detail === "current" ? (
                      <Loader2 size={16} className="shrink-0 animate-spin text-teal-600" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-200" />
                    )}
                    <span className={s.status === "done" ? "text-navy-900" : "text-slate-400"}>{s.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-400">Run a scan to see the identification pipeline.</p>
            )}
          </Card>

          {result ? (
            <Card className="animate-fade-up">
              {result.status === "identified" ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-teal-800">
                      <CheckCircle2 size={17} className="text-teal-600" /> {t("scan.identified")}
                    </h2>
                    <Badge tone="teal">{t("scan.confidence")}: {Math.round((result.confidence ?? 0) * 100)}%</Badge>
                  </div>
                  <div className="space-y-2.5">
                    {result.candidates.map((c) => (
                      <Link
                        key={c.slug}
                        href={`/medicines/${c.slug}`}
                        className="block rounded-xl border border-slate-200 p-3.5 transition hover:border-teal-300 hover:bg-teal-50/30"
                      >
                        <p className="text-sm font-bold text-navy-900">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.generic_name ?? c.brand_name} {c.strength ? `· ${c.strength}` : ""} · {c.manufacturer}</p>
                      </Link>
                    ))}
                  </div>
                </>
              ) : result.status === "uncertain" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                    <AlertTriangle size={17} /> {t("scan.uncertain")}
                  </p>
                  <p className="mt-1.5 text-xs text-amber-800">{result.message}</p>
                  {result.ocrText.length ? (
                    <div className="mt-3">
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                        <Pencil size={12} /> Recognized text — correct it and search:
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && query.trim() && identify({ mode: "manual", query })}
                          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
                        />
                        <button
                          onClick={() => query.trim() && identify({ mode: "manual", query })}
                          disabled={busy || !query.trim()}
                          className="shrink-0 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Search
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setMode("manual")} className="mt-3 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700">
                      Search manually instead
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <HelpCircle size={17} /> {t("scan.notfound")}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-600">{result.message}</p>
                  <button onClick={() => setMode("manual")} className="mt-3 rounded-xl bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-700">
                    Search manually instead
                  </button>
                </div>
              )}

              {result.ocrText?.length ? (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{result.ocrText.join(" · ")}</p>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ManualSuggestions({ onPick }: { onPick: (slug: string) => void }) {
  const suggestions = ["Dolo 650", "Coldrid Cold & Flu", "Moxikind-CV 625", "Primolut-N", "Meftal-Spas", "Alerzo"];
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-teal-50 hover:text-teal-700"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
