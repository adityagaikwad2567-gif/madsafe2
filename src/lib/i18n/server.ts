import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import type { Lang } from "./dictionaries";

/**
 * Server-side language resolution + translations-table access.
 *
 * Language source of truth on the server is the `medsafe_lang` cookie.
 * The client language switcher keeps the cookie in sync (see provider.tsx),
 * so server components and API routes render the same language the user picked.
 */

export const LANG_COOKIE = "medsafe_lang";

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "hi" || v === "mr";
}

export async function getServerLang(): Promise<Lang> {
  const store = await cookies();
  const v = store.get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "en";
}

export async function setLangCookie(lang: Lang): Promise<void> {
  const store = await cookies();
  store.set(LANG_COOKIE, lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
}

type Row = { key: string; lang: string; value: string };

let cache: Map<string, string> | null = null;

/** Loads entity='safety' rows into a `${lang}:${key}` map (per process). */
function loadOnce(): Map<string, string> {
  if (!cache) {
    const db = getDb();
    const rows = db
      .prepare("SELECT key, lang, value FROM translations WHERE entity = 'safety'")
      .all() as Row[];
    cache = new Map(rows.map((r) => [`${r.lang}:${r.key}`, r.value]));
  }
  return cache;
}

/** Force a reload (used after seeding in the same process). */
export function invalidateTranslationCache(): void {
  cache = null;
}

/** Interpolate {placeholders} in a translated string. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

/**
 * Translate a safety-content key for a language.
 * Falls back through: requested language → English source (caller-provided) → key.
 * Accepts undefined for call sites that have no language context (renders English).
 */
export function tr(
  lang: Lang | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number>
): string {
  if (lang && lang !== "en") {
    const hit = loadOnce().get(`${lang}:${key}`);
    if (hit) return interpolate(hit, params);
  }
  return interpolate(fallback, params);
}

/** Translated safety-indicator level label. */
export function levelLabel(
  lang: Lang | undefined,
  level: "green" | "yellow" | "orange" | "red"
): string {
  if (!lang || lang === "en") {
    return { green: "General Awareness", yellow: "Caution", orange: "Professional Supervision", red: "Important Warning" }[level];
  }
  return tr(lang, `level.${level}`, level);
}

/** Stable interaction translation key from two ingredient unique names. */
export function interactionKey(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `interaction.${x}__${y}`;
}
