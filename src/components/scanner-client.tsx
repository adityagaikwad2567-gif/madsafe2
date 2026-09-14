"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Glasses } from "lucide-react";
import Link from "next/link";
import {
  Camera, Upload, Barcode, Search, Mic, ScanLine, Loader2, AlertTriangle, CheckCircle2, HelpCircle, Video, VideoOff,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

type Step = { label: string; detail: string; status: "done" | "pending" };
type Candidate = { slug: string; name: string; brand_name: string | null; generic_name: string | null; manufacturer: string | null; strength: string | null };
type ScanResult = {
  status: "identified" | "uncertain" | "not_found";
  message: string;
  confidence: number | null;
  candidates: Candidate[];
  steps: Step[];
  ocrText: string[];
  demoNote?: string;
};

type Mode = "camera" | "upload" | "barcode" | "manual" | "voice";

const DEMO_BARCODE = "8901234500017"; // Dolo 650 (demo dataset)

export function ScannerClient() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) ?? "camera");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [listening, setListening] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const runPipeline = useCallback(
    async (payload: { mode: Mode; query?: string; barcode?: string; uncertain?: boolean }) => {
      setBusy(true);
      setResult(null);
      setSteps((SCAN_STEPS_LABELS).map((label, i) => ({ label, detail: i === 0 ? "current" : "pending", status: "pending" })));
      try {
        // Animate pipeline stages for a realistic flow
        for (let i = 1; i <= 4; i++) {
          await new Promise((r) => setTimeout(r, 260));
          setSteps((prev) =>
            prev
              ? prev.map((s, idx) => ({
                  ...s,
                  status: idx < i ? "done" : idx === i ? "pending" : "pending",
                  detail: idx < i ? "completed" : idx === i ? "current" : "pending",
                }))
              : prev
          );
        }
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
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraOn(false);
      // Fallback: run the demo scan anyway so the prototype works without a camera
      await runPipeline({ mode: "camera", query: "Dolo 650", uncertain: false });
    }
  };

  const captureFromCamera = async () => {
    stopCamera();
    await runPipeline({ mode: "camera", query: "Dolo 650 paracetamol tablet strip" });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Try an in-browser QR/barcode decode when the BarcodeDetector API is available.
    let decodedBarcode: string | null = null;
    try {
      const w = window as unknown as { BarcodeDetector?: new (o?: unknown) => { detect: (src: HTMLImageElement) => Promise<Array<{ rawValue: string }>> } };
      if (w.BarcodeDetector) {
        const detector = new w.BarcodeDetector();
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode().catch(() => undefined);
        const codes = await detector.detect(img).catch(() => []);
        decodedBarcode = codes[0]?.rawValue ?? null;
      }
    } catch {
      /* detection unavailable — continue with OCR simulation */
    }
    if (decodedBarcode) {
      await runPipeline({ mode: "barcode", barcode: decodedBarcode });
    } else {
      await runPipeline({ mode: "upload", query: "Dolo 650 paracetamol tablet strip" });
    }
  };

  const startVoice = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string; onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
        onend: () => void; start: () => void; stop: () => void;
      };
      webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void; };
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      // Fallback demo: treat as a typed query
      runPipeline({ mode: "voice", query: "Dolo 650" });
      return;
    }
    const rec = new SR();
    rec.lang = lang === "hi" ? "hi-IN" : lang === "mr" ? "mr-IN" : "en-IN";
    setListening(true);
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      setQuery(text);
      runPipeline({ mode: "voice", query: text || "Dolo 650" });
    };
    rec.onend = () => setListening(false);
    rec.start();
  };

  const uncertainDemo = () => runPipeline({ mode: "upload", query: "", uncertain: true });

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
            onClick={() => setMode(id)}
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
                <button onClick={captureFromCamera} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
                  <ScanLine size={16} /> Capture & identify
                </button>
              ) : (
                <button onClick={openCamera} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
                  <Camera size={16} /> {t("scan.camera")}
                </button>
              )}
              {cameraOn ? (
                <button onClick={stopCamera} className="ml-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                  <VideoOff size={15} /> Stop
                </button>
              ) : null}
              <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                <Video size={13} className="mt-0.5 shrink-0" />
                No camera access? The prototype falls back to the demo scan automatically.
              </p>
            </div>
          ) : null}

          {mode === "upload" ? (
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-teal-400 hover:bg-teal-50/40">
                <Upload size={26} className="text-teal-600" />
                <span className="text-sm font-semibold text-navy-900">{t("scan.upload")}</span>
                <span className="text-xs text-slate-500">JPG or PNG of the medicine strip / package</span>
                <input type="file" accept="image/*" className="hidden" onChange={onFile} />
              </label>
              <p className="mt-3 text-xs text-slate-500">
                The image is not stored — only the recognised text query is kept in privacy-friendly scan history.
              </p>
            </div>
          ) : null}

          {mode === "barcode" ? (
            <div>
              <label className="mb-2 block text-xs font-semibold text-navy-900">Barcode / QR value</label>
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder={`e.g. ${DEMO_BARCODE}`}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => runPipeline({ mode: "barcode", barcode })}
                  disabled={busy || !barcode}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  <Barcode size={16} /> Identify barcode
                </button>
                <button
                  onClick={() => setBarcode(DEMO_BARCODE)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Use demo barcode (Dolo 650)
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Uploads with a detectable QR/barcode are auto-routed here via the browser BarcodeDetector API when available.
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
                  onKeyDown={(e) => e.key === "Enter" && query.trim() && runPipeline({ mode: "manual", query })}
                  placeholder="e.g. Dolo 650, Coldrid, Moxikind-CV…"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
                <button
                  onClick={() => query.trim() && runPipeline({ mode: "manual", query })}
                  disabled={busy || !query.trim()}
                  className="shrink-0 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  Search
                </button>
              </div>
              <ManualSuggestions onPick={(s) => { setQuery(s); runPipeline({ mode: "manual", query: s }); }} />
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
                <span className="text-xs text-slate-500">English · हिंदी · मराठी (voice-ready architecture)</span>
              </button>
              {query ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Heard: “{query}”</p> : null}
              <p className="mt-2 text-xs text-slate-500">
                Uses the browser SpeechRecognition API when available; otherwise runs the demo voice flow.
              </p>
            </div>
          ) : null}
        </Card>

        {/* Pipeline + result panel */}
        <div>
          <Card className="mb-4">
            <h2 className="mb-3 text-sm font-bold text-navy-900">{t("scan.steps")}</h2>
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
                  <button onClick={() => setMode("manual")} className="mt-3 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700">
                    Search manually instead
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <HelpCircle size={17} /> {t("scan.notfound")}
                  </p>
                  <button onClick={() => setMode("manual")} className="mt-3 rounded-xl bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-700">
                    Search manually instead
                  </button>
                </div>
              )}

              {result.ocrText?.length ? (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{result.ocrText.join(" · ")}</p>
              ) : null}
              {result.demoNote ? (
                <p className="mt-2 text-xs italic text-slate-400">{result.demoNote}</p>
              ) : null}
            </Card>
          ) : null}

          <button
            onClick={uncertainDemo}
            disabled={busy}
            className="mt-4 w-full rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-xs font-medium text-slate-500 hover:border-amber-300 hover:text-amber-700"
          >
            Try the “unclear image” demo (shows the honest fallback)
          </button>
        </div>
      </div>
    </div>
  );
}

const SCAN_STEPS_LABELS = [
  "Image captured / decoded",
  "OCR & barcode extraction",
  "Medicine identification",
  "Verified database lookup",
  "Safety analysis",
];

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
