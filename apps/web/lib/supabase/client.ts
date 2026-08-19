import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseBrowserClient() {
  if (client) return client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // createBrowserClient() throws synchronously on an empty URL/key,
    // which takes down the entire page at import time (confirmed live:
    // every route crashed uncaught the moment env vars were unset).
    // Falling back to a harmless placeholder means only an actual auth
    // call fails, not the whole app.
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — " +
        "set them in Railway's Variables tab and redeploy (NEXT_PUBLIC_* " +
        "vars are baked in at build time, so a restart alone won't pick them up).",
    );
  }

  client = createBrowserClient(
    SUPABASE_URL || "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY || "placeholder-anon-key",
  );
  return client;
}

// Default export for convenience
export const supabase = (() => {
  if (typeof window === "undefined") return null as any;
  return getSupabaseBrowserClient();
})();
