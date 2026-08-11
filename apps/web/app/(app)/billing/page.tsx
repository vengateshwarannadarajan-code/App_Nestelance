"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Star } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const PLANS = [
  {
    id: "starter", label: "Starter", price: "49", color: "#757575",
    desc: "Pour démarrer votre démarche ESG",
    features: [
      "Score ESG global",
      "Questionnaire 45 questions",
      "10 thèmes analysés",
      "Tableau de bord basique",
      "1 évaluation/an",
    ],
    locked: ["Explication IA", "Simulateur", "Rapports PDF", "Impact financier"],
  },
  {
    id: "growth", label: "Croissance", price: "149", color: "#1B5E20", popular: true,
    desc: "Pour piloter vos progrès ESG au quotidien",
    features: [
      "Tout Starter",
      "Score détaillé par thème",
      "Simulateur de conformité",
      "Impact financier calculé",
      "4 rapports PDF/an",
      "Historique 12 mois",
      "Réévaluations illimitées",
    ],
    locked: ["Explication SHAP", "Rapports multi-cadres", "API"],
  },
  {
    id: "professional", label: "Professionnel", price: "299", color: "#1565C0",
    desc: "Pour les PMEs soumises à la CSRD",
    features: [
      "Tout Croissance",
      "Explication IA (SHAP waterfall)",
      "Rapports CSRD / GRI / BRSR",
      "Rapports en marque blanche",
      "12 rapports/an",
      "Historique 36 mois",
      "Support prioritaire",
    ],
    locked: ["Accès API", "Multi-clients"],
  },
  {
    id: "consultant", label: "Consultant", price: "499", color: "#6A1B9A",
    desc: "Pour les cabinets RSE et auditeurs ESG",
    features: [
      "Tout Professionnel",
      "Tableau de bord multi-clients",
      "Carte thermique clients",
      "Accès API complet",
      "Clés API illimitées",
      "Rapports illimités",
      "SLA prioritaire",
    ],
    locked: [],
  },
] as const;

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const upgradePlan = searchParams.get("upgrade");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleSelectPlan(planId: string) {
    setLoadingPlan(planId);
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) { router.push("/signup?plan=" + planId); return; }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          plan: planId,
          success_url: `${window.location.origin}/settings/billing?success=1&plan=${planId}`,
          cancel_url: `${window.location.origin}/settings/billing`,
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Tarifs simples et transparents</h1>
          <p className="text-sm text-gray-500">Sans engagement annuel · Résiliable à tout moment</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className={`bg-white rounded-xl shadow-card flex flex-col relative overflow-hidden
                ${plan.popular ? "ring-2 ring-brand-mid" : ""}
                ${upgradePlan === plan.id ? "ring-2 ring-blue-500" : ""}
              `}
            >
              {plan.popular && (
                <div className="bg-brand-mid text-white text-xs font-semibold text-center py-1.5 flex items-center justify-center gap-1">
                  <Star className="w-3 h-3" /> Populaire
                </div>
              )}

              <div className="p-5 flex-1 flex flex-col">
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: plan.color }}>
                    {plan.label}
                  </p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-bold text-gray-900">€{plan.price}</span>
                    <span className="text-sm text-gray-400">/mois</span>
                  </div>
                  <p className="text-xs text-gray-500">{plan.desc}</p>
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-5 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-700">
                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: plan.color }} />
                      {f}
                    </li>
                  ))}
                  {plan.locked.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-400 opacity-50">
                      <span className="w-3.5 h-3.5 shrink-0 mt-0.5 text-center leading-none">×</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={loadingPlan !== null}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{
                    backgroundColor: plan.color,
                    color: "white",
                  }}
                >
                  {loadingPlan === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  Choisir {plan.label}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Paiement sécurisé par Stripe · TVA non incluse pour les entreprises françaises hors UE
        </p>
      </div>
    </div>
  );
}
