"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type State = "form" | "verify-email" | "error";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan") ?? "starter";

  const [state, setState] = useState<State>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  // ── Validation ─────────────────────────────────────────────
  function validate() {
    const errs: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Adresse email invalide";
    }
    if (password.length < 8) {
      errs.password = "Le mot de passe doit contenir au moins 8 caractères";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Email/password signup ───────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { plan: planParam },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      if (error.message.includes("already registered") || error.message.includes("already exists")) {
        setErrors({ email: "Un compte existe déjà avec cet email" });
      } else {
        setErrors({ general: error.message });
      }
      return;
    }

    setState("verify-email");
  }

  // ── Google OAuth ────────────────────────────────────────────
  async function handleGoogleSignIn() {
    setOauthLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?plan=${planParam}`,
      },
    });
    if (error) {
      setErrors({ general: "La connexion Google a échoué. Réessayez ou utilisez votre email." });
      setOauthLoading(false);
    }
  }

  // ── Verify email state ──────────────────────────────────────
  if (state === "verify-email") {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-brand-mid" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Vérifiez votre email</h1>
          <p className="text-gray-500 mb-6">
            Un lien de confirmation a été envoyé à <strong>{email}</strong>.<br />
            Cliquez sur le lien pour activer votre compte.
          </p>
          <button
            onClick={() => setState("form")}
            className="text-sm text-brand-accent hover:underline"
          >
            Utiliser une autre adresse
          </button>
        </div>
      </AuthLayout>
    );
  }

  // ── Main form ───────────────────────────────────────────────
  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Créer un compte</h1>
      <p className="text-sm text-gray-500 mb-8">
        Commencez gratuitement · Résultat en 5 minutes · Sans carte bancaire
      </p>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={oauthLoading || loading}
        className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-6 disabled:opacity-50"
      >
        {oauthLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continuer avec Google
      </button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs text-gray-400 bg-white px-3">
          ou avec votre email
        </div>
      </div>

      {/* Email/password form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {errors.general && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {errors.general}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Adresse email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors
              ${errors.email
                ? "border-red-400 focus:border-red-500 bg-red-50"
                : "border-gray-200 focus:border-brand-accent"
              }`}
            placeholder="vous@entreprise.fr"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-600">{errors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Mot de passe
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-lg border px-3.5 py-2.5 pr-10 text-sm outline-none transition-colors
                ${errors.password
                  ? "border-red-400 focus:border-red-500 bg-red-50"
                  : "border-gray-200 focus:border-brand-accent"
                }`}
              placeholder="8 caractères minimum"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || oauthLoading}
          className="w-full bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-lg px-4 py-3 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Créer mon compte
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-brand-accent font-medium hover:underline">
          Se connecter
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-gray-400">
        En créant un compte, vous acceptez nos{" "}
        <Link href="/legal/terms" className="hover:underline">CGU</Link>{" "}
        et notre{" "}
        <Link href="/legal/privacy" className="hover:underline">politique de confidentialité</Link>.
      </p>
    </AuthLayout>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-card p-8">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 bg-brand-mid rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="font-semibold text-gray-900">Nest Élance</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
