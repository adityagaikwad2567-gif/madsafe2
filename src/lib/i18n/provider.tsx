"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DICTS, LANGS, type Lang } from "./dictionaries";

type I18nCtx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };

const Ctx = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => DICTS.en[k] ?? k });

const STORAGE_KEY = "medsafe_lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    // Client-only preference hydration after mount (avoids SSR hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored && ["en", "hi", "mr"].includes(stored)) setLangState(stored);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    // Keep the server-side language in sync so server-rendered pages
    // (medicine profiles, cabinet, AR) render the same language.
    document.cookie = `medsafe_lang=${l}; path=/; max-age=${365 * 86400}; samesite=lax`;
  };

  const t = (key: string) => DICTS[lang][key] ?? DICTS.en[key] ?? key;

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 text-xs font-medium">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            lang === l.code ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:text-teal-700"
          }`}
          aria-label={`Switch language to ${l.native}`}
        >
          {compact ? l.code.toUpperCase() : l.native}
        </button>
      ))}
    </div>
  );
}

export type { Lang };
