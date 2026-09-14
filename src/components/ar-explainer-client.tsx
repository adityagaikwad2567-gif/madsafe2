"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ScanLine, Camera, Upload, RefreshCw, Loader2, ScanSearch, CheckCircle2, Car, CalendarClock,
  Pill, Thermometer, TriangleAlert, Info, X,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

type Box = {
  kind: "name" | "ingredients" | "warnings" | "expiry" | "storage" | "nodriving";
  label: string;
  text: string;
  tone: "teal" | "navy" | "amber" | "orange" | "red" | "green";
  top: number; left: number; width: number; height: number;
};

type ArResponse = {
  status: "identified" | "not_found";
  message: string;
  confidence: number | null;
  feature: { slug: string; name: string; verification: string; expiry: { state: string; date?: string; days?: number }; boxes: Box[] } | null;
  steps: Array<{ label: string; status: "done" | "pending" }>;
  demoNote: string;
};

type Phase = "viewfinder" | "scanning" | "result";

const TONE_STYLES: Record<Box["tone"], string> = {
  teal: "border-teal-300 bg-teal-500/15 shadow-[0_0_18px_rgba(45,212,191,0.35)]",
  navy: "border-sky-300 bg-sky-500/15 shadow-[0_0_18px_rgba(56,189,248,0.3)]",
  amber: "border-amber-300 bg-amber-500/20 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
  orange: "border-orange-300 bg-orange-500/20 shadow-[0_0_18px_rgba(251,146,60,0.35)]",
  red: "border-red-400 bg-red-500/25 shadow-[0_0_18px_rgba(248,113,113,0.4)]",
  green: "border-emerald-300 bg-emerald-500/15 shadow-[0_0_18px_rgba(52,211,153,0.3)]",
};

const TONE_CHIP: Record<Box["tone"], string> = {
  teal: "bg-teal-600", navy: "bg-sky-600", amber: "bg-amber-500",
  orange: "bg-orange-500", red: "bg-red-600", green: "bg-emerald-600",
};

const KIND_ICON: Record<Box["kind"], typeof Pill> = {
  name: Pill, ingredients: Pill, warnings: TriangleAlert,
  expiry: CalendarClock, storage: Thermometer, nodriving: Car,
};

/** Demo pack expiry: computed once per module load (630 days out ≈ ~21 months). */
const DEMO_PACK_EXP = new Date(Date.now() + 630 * 86400_000).toISOString().slice(0, 10);

/** A stylized demo pack rendered behind the overlay so the AR demo is self-contained. */
function DemoPack({ blurry = false }: { blurry?: boolean }) {
  return (
    <div className={`absolute inset-6 rounded-xl border-2 border-white/25 bg-white/95 p-4 shadow-2xl ${blurry ? "blur-[2.5px] scale-[1.02]" : ""}`}>
      <div className="flex h-full flex-col justify-between rounded-lg bg-gradient-to-b from-sky-50 to-white p-4">
        <div>
          <p className="text-lg font-bold tracking-tight text-navy-900">Dolo 650</p>
          <p className="text-[10px] font-medium text-slate-500">Paracetamol Tablets IP 650 mg · Micro Labs (demo)</p>
        </div>
        <div className="space-y-1.5 text-[9px] leading-tight text-slate-600">
          <p><span className="font-semibold text-navy-900">Each uncoated tablet contains:</span> Paracetamol IP 650 mg</p>
          <p className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">Warning: may cause drowsiness — avoid driving if affected</p>
          <p><span className="font-semibold text-navy-900">Mfr.:</span> Micro Labs (demo) · <span className="font-semibold text-navy-900">Store:</span> below 30°C</p>
          <p className="font-mono font-semibold text-slate-700">MFG: 08/2024 &nbsp; EXP: {DEMO_PACK_EXP}</p>
          <p className="font-mono text-[8px] text-slate-400">BATCH MSF-2601 · 8901234500017</p>
        </div>
      </div>
    </div>
  );
}

export function ArExplainerClient() {
  const { t } = useI18n();
  const params = useSearchParams();
  const slugFocus = params.get("slug");
  const [phase, setPhase] = useState<Phase>("viewfinder");
  const [mode, setMode] = useState<"camera" | "demo">("demo");
  const [cameraOn, setCameraOn] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [blurry, setBlurry] = useState(false);
  const [result, setResult] = useState<ArResponse | null>(null);
  const [selected, setSelected] = useState<Box | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const openCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setMode("camera");
      setCameraOn(true);
      setPhase("viewfinder");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError("Camera unavailable — switched to the demo pack view.");
      setMode("demo");
      setCameraOn(false);
    }
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCameraOn(false);
    setFrozen(false);
    setPhase("viewfinder");
    setResult(null);
  }, []);

  const runDetection = useCallback(async (opts?: { uncertain?: boolean; slug?: string }) => {
    setPhase("scanning");
    setSelected(null);
    setBlurry(Boolean(opts?.uncertain));
    try {
      await new Promise((r) => setTimeout(r, 900)); // staged detection beat
      const res = await fetch("/api/ar/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          opts?.uncertain
            ? { uncertain: true }
            : { query: opts?.slug ?? "Dolo 650" }
        ),
      });
      const data: ArResponse = await res.json();
      if (!res.ok || data.status === "not_found") {
        setError(data.message ?? "Detection failed.");
        setPhase("viewfinder");
        return;
      }
      setResult(data);
      setPhase("result");
    } catch {
      setError("Detection failed — please try again.");
      setPhase("viewfinder");
    }
  }, []);

  // Deep link: /ar?slug=... projects that medicine directly once on mount.
  const ranSlug = useRef(false);
  useEffect(() => {
    if (slugFocus && !ranSlug.current) {
      ranSlug.current = true;
      runDetection({ slug: slugFocus });
    }
  }, [slugFocus, runDetection]);

  const capture = async () => {
    if (mode === "camera" && videoRef.current && canvasRef.current) {
      // Freeze the live frame onto the canvas overlay.
      const v = videoRef.current;
      const c = canvasRef.current;
      c.width = v.videoWidth || 640;
      c.height = v.videoHeight || 480;
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setFrozen(true);
      setCameraOn(false);
    }
    await runDetection();
  };

  const reset = () => {
    setPhase("viewfinder");
    setResult(null);
    setSelected(null);
    setError(null);
    setBlurry(false);
    setFrozen(false);
    if (mode === "camera") {
      openCamera();
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-navy-900">{t("ar.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {t("ar.sub")}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Viewfinder */}
        <div className="lg:col-span-3">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[2rem] border border-slate-200 bg-navy-950 shadow-[var(--shadow-soft)]">
            {/* Live camera */}
            <video ref={videoRef} className={`absolute inset-0 h-full w-full object-cover ${mode === "camera" && cameraOn && phase !== "result" ? "" : "hidden"}`} muted playsInline />

            {/* Frozen camera frame */}
            <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full object-cover ${frozen ? "" : "hidden"}`} />

            {/* Demo pack backdrop */}
            {mode === "demo" || (!cameraOn && !frozen) ? (
              <div className={`absolute inset-0 bg-gradient-to-b from-navy-900 to-navy-950 ${phase === "scanning" ? "animate-pulse" : ""}`}>
                <DemoPack blurry={blurry} />
              </div>
            ) : null}

            {/* Frame guide */}
            {phase !== "result" ? (
              <div className="pointer-events-none absolute inset-5 rounded-2xl border-2 border-teal-400/40">
                <span className="absolute -left-1 -top-1 h-5 w-5 rounded-tl-lg border-l-4 border-t-4 border-teal-300" />
                <span className="absolute -right-1 -top-1 h-5 w-5 rounded-tr-lg border-r-4 border-t-4 border-teal-300" />
                <span className="absolute -bottom-1 -left-1 h-5 w-5 rounded-bl-lg border-b-4 border-l-4 border-teal-300" />
                <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-br-lg border-b-4 border-r-4 border-teal-300" />
              </div>
            ) : null}

            {/* Scanning sweep */}
            {phase === "scanning" ? (
              <div className="absolute inset-0">
                <div className="animate-scanline absolute inset-x-6 h-1 rounded bg-teal-300 shadow-[0_0_24px_4px_rgba(94,234,212,0.8)]" />
                <div className="absolute inset-x-0 bottom-16 flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-navy-950/80 px-3.5 py-1.5 text-xs font-semibold text-teal-200">
                    <Loader2 size={13} className="animate-spin" /> {t("ar.detecting")}
                  </span>
                </div>
              </div>
            ) : null}

            {/* AR overlay boxes */}
            {phase === "result" && result?.feature ? (
              <div className="absolute inset-0 animate-fade-up">
                {result.feature.boxes.map((b) => {
                  const Icon = KIND_ICON[b.kind] ?? Info;
                  return (
                    <button
                      key={b.kind}
                      onClick={() => setSelected(b)}
                      className={`group absolute rounded-lg border-2 transition hover:scale-[1.02] ${TONE_STYLES[b.tone]}`}
                      style={{ top: `${b.top * 100}%`, left: `${b.left * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}
                      aria-label={`${b.label}: ${b.text}`}
                    >
                      <span className={`absolute -top-2.5 left-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white ${TONE_CHIP[b.tone]}`}>
                        <Icon size={9} /> {b.label}
                      </span>
                    </button>
                  );
                })}
                <button onClick={reset} className="absolute right-3 top-3 rounded-full bg-navy-950/80 p-2 text-white hover:bg-navy-900" aria-label="Scan again">
                  <RefreshCw size={15} />
                </button>
              </div>
            ) : null}

            {/* Viewfinder controls */}
            {phase === "viewfinder" ? (
              <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2.5">
                {mode === "camera" && cameraOn ? (
                  <>
                    <button onClick={capture} className="inline-flex items-center gap-1.5 rounded-full bg-teal-500 px-4 py-2 text-xs font-bold text-navy-950 hover:bg-teal-400">
                      <ScanSearch size={14} /> {t("ar.explain")}
                    </button>
                    <button onClick={stopCamera} className="rounded-full bg-navy-950/80 p-2 text-white hover:bg-navy-900" aria-label="Stop camera">
                      <X size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={openCamera} className="inline-flex items-center gap-1.5 rounded-full bg-teal-500 px-4 py-2 text-xs font-bold text-navy-950 hover:bg-teal-400">
                      <Camera size={14} /> {t("ar.openCamera")}
                    </button>
                    <button onClick={() => runDetection()} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white ring-1 ring-white/25 hover:bg-white/20">
                      <ScanLine size={14} /> {t("ar.demoPack")}
                    </button>
                    <button onClick={() => runDetection({ uncertain: true })} className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white ring-1 ring-white/25 hover:bg-white/20">
                      {t("ar.unclear")}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* Source row */}
          {result ? (
            <div className="mx-auto mt-3 flex max-w-sm flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {result.confidence !== null ? <>{t("ar.confidence")}: <strong className="text-navy-900">{Math.round(result.confidence * 100)}%</strong></> : null}
              </span>
              <span>{result.feature?.verification === "verified" ? "Verified demo record" : "Unverified record"}</span>
            </div>
          ) : null}
        </div>

        {/* Details panel */}
        <div className="space-y-4 lg:col-span-2">
          {error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>
          ) : null}

          {phase === "result" && result?.feature ? (
            <>
              <Card className="animate-fade-up">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-navy-900">{result.feature.name}</h2>
                    <p className="text-xs text-slate-500">{result.message}</p>
                  </div>
                  <Badge tone={result.feature.verification === "verified" ? "teal" : "amber"}>
                    {result.feature.verification === "verified" ? "Verified" : "Unverified"}
                  </Badge>
                </div>
                {result.feature.expiry.state !== "unknown" ? (
                  <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    result.feature.expiry.state === "expired" ? "border-red-200 bg-red-50 text-red-700"
                    : result.feature.expiry.state === "near" ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}>
                    <CalendarClock size={12} />
                    {result.feature.expiry.state === "expired" ? "Expired" : result.feature.expiry.state === "near" ? "Near expiry" : "Valid"} · {result.feature.expiry.date}
                  </p>
                ) : null}
                <Link href={`/medicines/${result.feature.slug}`} className="mt-3 inline-block text-xs font-semibold text-teal-700 hover:underline">
                  {t("ar.fullProfile")}
                </Link>
              </Card>

              <Card className="animate-fade-up">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("ar.zones")}</h3>
                <ul className="mt-2.5 space-y-2">
                  {result.feature.boxes.map((b) => {
                    const Icon = KIND_ICON[b.kind] ?? Info;
                    return (
                      <li key={b.kind}>
                        <button
                          onClick={() => setSelected(b)}
                          className="flex w-full items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-left transition hover:border-teal-200 hover:bg-teal-50/40"
                        >
                          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white ${TONE_CHIP[b.tone]}`}>
                            <Icon size={12} />
                          </span>
                          <span>
                            <span className="block text-xs font-bold text-navy-900">{b.label}</span>
                            <span className="mt-0.5 block line-clamp-2 text-xs text-slate-600">{b.text}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </>
          ) : null}

          {phase !== "result" ? (
            <Card>
              <h3 className="text-sm font-bold text-navy-900">How this works</h3>
              <ol className="mt-2.5 space-y-2 text-xs text-slate-600">
                {["Frame captured (demo pack or camera)", "Text & barcode regions detected", "Medicine identified", "Verified database lookup", "Label zones projected"].map((s, i) => (
                  <li key={s} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-50 text-[10px] font-bold text-navy-700">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
                Prototype: zones are projected from the verified database with on-record coordinates. Production would
                use real OCR plus on-device text recognition to locate regions in the lens. Nothing is diagnosed here —
                it is your pack, annotated.
              </p>
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-navy-900">Try it:</p>
                <p className="mt-1">1. “Use demo pack” → full projection · 2. “Unclear frame” → low-confidence fallback on the blurry pack · 3. Tap any zone for details.</p>
              </div>
            </Card>
          ) : null}

          {selected ? (
            <Card className="animate-fade-up border-teal-200">
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                  {(() => { const Icon = KIND_ICON[selected.kind] ?? Info; return <Icon size={15} className="text-teal-600" />; })()}
                  {selected.label}
                </h3>
                <button onClick={() => setSelected(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={14} /></button>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{selected.text}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
