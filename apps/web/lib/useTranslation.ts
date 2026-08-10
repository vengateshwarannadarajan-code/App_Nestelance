"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "./supabase/client";
import fr from "./i18n/fr.json";
import en from "./i18n/en.json";

type Locale = "fr" | "en";
type TranslationDict = Record<string, any>;

const DICTS: Record<Locale, TranslationDict> = { fr, en };

/**
 * Resolves a dot-notation key against a nested dict.
 * e.g. "auth.signup.title" → dict.auth.signup.title
 */
function resolve(dict: TranslationDict, key: string): string | undefined {
  return key.split(".").reduce<any>((acc, part) => {
    if (acc && typeof acc === "object") return acc[part];
    return undefined;
  }, dict);
}

interface UseTranslationReturn {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export function useTranslation(): UseTranslationReturn {
  const [locale, setLocaleState] = useState<Locale>("fr");

  // Load locale from localStorage or Supabase on mount
  useEffect(() => {
    const stored = (typeof localStorage !== "undefined"
      ? localStorage.getItem("ne_locale")
      : null) as Locale | null;

    if (stored === "fr" || stored === "en") {
      setLocaleState(stored);
      return;
    }

    // Try Supabase
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase
        .from("users")
        .select("locale")
        .eq("id", session.user.id)
        .single();
      if (data?.locale === "fr" || data?.locale === "en") {
        setLocaleState(data.locale);
        localStorage.setItem("ne_locale", data.locale);
      }
    });
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("ne_locale", newLocale);
    }

    // Persist to Supabase
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from("users")
        .update({ locale: newLocale })
        .eq("id", session.user.id);
    }
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const dict = DICTS[locale];
    const fallback = DICTS["fr"];

    let result = resolve(dict, key) ?? resolve(fallback, key) ?? key;

    // Variable interpolation: {varName} → value
    if (vars && typeof result === "string") {
      Object.entries(vars).forEach(([k, v]) => {
        result = (result as string).replace(`{${k}}`, String(v));
      });
    }

    return typeof result === "string" ? result : key;
  }, [locale]);

  return { t, locale, setLocale };
}
