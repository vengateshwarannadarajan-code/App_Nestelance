"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Loader2, Info } from "lucide-react";

const COUNTRIES = [
  { code: "FR", label: "France" },
  { code: "DE", label: "Allemagne" },
  { code: "ES", label: "Espagne" },
  { code: "IT", label: "Italie" },
  { code: "BE", label: "Belgique" },
  { code: "NL", label: "Pays-Bas" },
  { code: "PT", label: "Portugal" },
  { code: "PL", label: "Pologne" },
  { code: "CH", label: "Suisse" },
  { code: "LU", label: "Luxembourg" },
];

const REVENUE_BANDS = [
  { value: "<500k",    label: "Moins de 500 000 €" },
  { value: "500k-1m",  label: "500 000 € – 1 M€" },
  { value: "1m-10m",   label: "1 M€ – 10 M€" },
  { value: "10m-50m",  label: "10 M€ – 50 M€" },
  { value: ">50m",     label: "Plus de 50 M€" },
];

interface FormData {
  name: string;
  country: string;
  revenueBand: string;
  euSupplyChainPct: string;
  scope12Emissions: string;
}

interface FormErrors {
  name?: string;
  country?: string;
  revenueBand?: string;
  euSupplyChainPct?: string;
  scope12Emissions?: string;
  general?: string;
}

export default function CompanyProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    name: "",
    country: "FR",
    revenueBand: "",
    euSupplyChainPct: "",
    scope12Emissions: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [euTooltip, setEuTooltip] = useState(false);

  function update(field: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: FormErrors = {};

    if (!form.name.trim()) errs.name = "Le nom de l'entreprise est requis";

    if (!form.revenueBand) errs.revenueBand = "Veuillez sélectionner une tranche de chiffre d'affaires";

    if (form.euSupplyChainPct !== "") {
      const val = parseFloat(form.euSupplyChainPct);
      if (isNaN(val) || val < 0 || val > 100) {
        errs.euSupplyChainPct = "La valeur doit être comprise entre 0 et 100";
      }
    }

    if (form.scope12Emissions !== "") {
      const val = parseFloat(form.scope12Emissions);
      if (isNaN(val) || val < 0) {
        errs.scope12Emissions = "Veuillez entrer une valeur positive en tCO₂e";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) { router.push("/login"); return; }

    // Default eu_supply_chain_pct to 0 if blank (T-PROFILE-004)
    const euPct = form.euSupplyChainPct === "" ? 0 : parseFloat(form.euSupplyChainPct);
    const emissions = form.scope12Emissions === "" ? null : parseFloat(form.scope12Emissions);

    try {
      // POST /api/companies
      const companyRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/companies`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: form.name.trim(),
            country: form.country,
            revenue_band: form.revenueBand,
            eu_supply_chain_pct: euPct,
            scope12_emissions_t: emissions,
          }),
        }
      );

      if (!companyRes.ok) throw new Error("Erreur lors de la création de l'entreprise");
      const { id: companyId } = await companyRes.json();

      // PATCH user to link company — store scope12 for questionnaire pre-fill (T-PROFILE-005)
      await supabase
        .from("users")
        .update({ company_id: companyId })
        .eq("id", session.user.id);

      // Store scope12 in sessionStorage for questionnaire pre-fill (T-PROFILE-005)
      if (emissions !== null) {
        sessionStorage.setItem("prefill_scope12", String(emissions));
      }

      router.push("/onboarding/industry");
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : "Une erreur est survenue" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {["Profil", "Secteur", "Questionnaire"].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                ${i === 0 ? "bg-brand-mid text-white" : "bg-gray-200 text-gray-500"}`}>
                {i + 1}
              </div>
              <span className={`text-sm ${i === 0 ? "text-brand-dark font-medium" : "text-gray-400"}`}>
                {step}
              </span>
              {i < 2 && <div className="w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-card p-8">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Votre entreprise</h1>
          <p className="text-sm text-gray-500 mb-7">
            Ces informations permettent de calibrer votre score ESG à votre secteur et taille.
          </p>

          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-5">
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Company name */}
            <Field label="Nom de l'entreprise" required error={errors.name}>
              <input
                type="text"
                value={form.name}
                onChange={e => update("name", e.target.value)}
                placeholder="Maison Dupont SAS"
                className={inputCls(!!errors.name)}
              />
            </Field>

            {/* Country */}
            <Field label="Pays d'établissement" required error={errors.country}>
              <select
                value={form.country}
                onChange={e => update("country", e.target.value)}
                className={inputCls(!!errors.country)}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </Field>

            {/* Revenue band */}
            <Field label="Chiffre d'affaires annuel" required error={errors.revenueBand}>
              <select
                value={form.revenueBand}
                onChange={e => update("revenueBand", e.target.value)}
                className={inputCls(!!errors.revenueBand)}
              >
                <option value="">Sélectionner une tranche</option>
                {REVENUE_BANDS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>

            {/* EU supply chain % */}
            <Field
              label="Part du chiffre d'affaires liée à des clients EU"
              hint="optionnel"
              error={errors.euSupplyChainPct}
              tooltip={euTooltip}
              onTooltipToggle={() => setEuTooltip(!euTooltip)}
              tooltipText="Sans cette donnée, le risque de perte de contrats sera estimé à zéro dans le calculateur d'impact financier."
            >
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.euSupplyChainPct}
                  onChange={e => update("euSupplyChainPct", e.target.value)}
                  placeholder="0"
                  className={`${inputCls(!!errors.euSupplyChainPct)} pr-10`}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </Field>

            {/* Scope 1+2 emissions */}
            <Field
              label="Émissions Scope 1 + 2 estimées"
              hint="optionnel — pré-remplit la question climatique"
              error={errors.scope12Emissions}
            >
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={form.scope12Emissions}
                  onChange={e => update("scope12Emissions", e.target.value)}
                  placeholder="450"
                  className={`${inputCls(!!errors.scope12Emissions)} pr-20`}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">tCO₂e/an</span>
              </div>
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-lg py-3 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Continuer vers la sélection du secteur →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function inputCls(hasError: boolean) {
  return `w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors
    ${hasError
      ? "border-red-400 bg-red-50 focus:border-red-500"
      : "border-gray-200 bg-white focus:border-brand-accent"}`;
}

function Field({
  label, required, hint, error, children, tooltip, onTooltipToggle, tooltipText
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  tooltip?: boolean;
  onTooltipToggle?: () => void;
  tooltipText?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {hint && <span className="text-xs text-gray-400">— {hint}</span>}
        {tooltipText && (
          <button type="button" onClick={onTooltipToggle} className="text-gray-400 hover:text-gray-600">
            <Info className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {tooltip && tooltipText && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mb-2">
          {tooltipText}
        </div>
      )}
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
