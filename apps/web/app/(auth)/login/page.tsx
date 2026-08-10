"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2, X } from "lucide-react";

type LoginState = "form" | "reset-sent";
type ModalState = "closed" | "open" | "sent" | "error";

export default function LoginPage() {
  const router = useRouter();

  const [state, setState] = useState<LoginState>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [loading, setLoading] = useState(false);

  // Reset modal
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  // ── Login submit ────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    if (!email) return setErrors({ email: "Email requis" });
    if (!password) return setErrors({ password: "Mot de passe requis" });

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        setErrors({ general: "Email ou mot de passe incorrect" });
      } else if (error.message.includes("Email not confirmed")) {
        setErrors({ general: "Veuillez confirmer votre email avant de vous connecter" });
      } else {
        setErrors({ general: error.message });
      }
      return;
    }

    router.push("/dashboard");
  }

  // ── Password reset ──────────────────────────────────────────
  async function handleResetRequest() {
    if (!resetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      setResetError("Adresse email invalide");
      return;
    }

    setResetLoading(true);
    setResetError("");

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    setResetLoading(false);

    if (error) {
      if (error.message.includes("rate limit")) {
        setResetError("Trop de tentatives. Réessayez dans quelques minutes.");
      } else {
        setResetError(error.message);
      }
      return;
    }

    setModalState("sent");
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Connexion</h1>
      <p className="text-sm text-gray-500 mb-8">
        Accédez à votre tableau de bord ESG
      </p>

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
              ${errors.email ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-brand-accent"}`}
            placeholder="vous@entreprise.fr"
          />
          {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Mot de passe
            </label>
            <button
              type="button"
              onClick={() => { setModalState("open"); setResetEmail(email); }}
              className="text-xs text-brand-accent hover:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-lg border px-3.5 py-2.5 pr-10 text-sm outline-none transition-colors
                ${errors.password ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-brand-accent"}`}
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
          {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-lg px-4 py-3 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Se connecter
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="text-brand-accent font-medium hover:underline">
          Créer un compte gratuitement
        </Link>
      </p>

      {/* Password reset modal */}
      {modalState !== "closed" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 relative">
            <button
              onClick={() => { setModalState("closed"); setResetError(""); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>

            {modalState === "sent" ? (
              <div className="text-center py-2">
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-brand-mid" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  Un lien de réinitialisation a été envoyé
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Vérifiez votre boîte mail à <strong>{resetEmail}</strong>.
                  Le lien expire dans 1 heure.
                </p>
                <p className="text-xs text-gray-400">
                  Lien expiré ?{" "}
                  <button
                    onClick={() => { setModalState("open"); }}
                    className="text-brand-accent hover:underline"
                  >
                    Ce lien a expiré. Demandez un nouveau lien.
                  </button>
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Réinitialiser le mot de passe
                </h3>
                <p className="text-sm text-gray-500 mb-5">
                  Entrez votre email et nous vous enverrons un lien de réinitialisation.
                </p>

                {resetError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700 mb-4">
                    {resetError}
                  </div>
                )}

                <div className="mb-4">
                  <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Adresse email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 focus:border-brand-accent px-3.5 py-2.5 text-sm outline-none"
                    placeholder="vous@entreprise.fr"
                  />
                </div>

                <button
                  onClick={handleResetRequest}
                  disabled={resetLoading}
                  className="w-full bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resetLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Envoyer le lien
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

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
