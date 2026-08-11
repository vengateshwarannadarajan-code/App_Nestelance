"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Star, Leaf, ArrowLeft } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PRICING_PLANS } from "@/lib/constants";

/**
 * Public pricing page — reachable by logged-out visitors (unlike (app)/billing,
 * which sits behind the (app) layout's auth redirect to /login and can never
 * be reached by an anonymous visitor). Shares PRICING_PLANS with the in-app
 * billing page so the numbers can't drift out of sync again.
 *
 * useSearchParams() must be wrapped in Suspense for static generation to succeed.
 */
export default function PublicPricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const upgradePlan = searchParams.get("upgrade");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleSelectPlan(planId: string) {
    setLoadingPlan(planId);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push(`/signup?plan=${planId}`);
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          plan: planId,
          success_url: `${window.location.origin}/settings?tab=subscription&success=1&plan=${planId}`,
          cancel_url: `${window.location.origin}/pricing`,
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
    <div className="min-h-screen bg-surface">
      <nav className="sticky top-0 z-50 bg-white border-b border-border h-16 flex items-center justify-between px-6 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Leaf size={22} className="text-brand-mid" />
          <span className="text-lg font-extrabold text-brand-dark tracking-tight">Nest Élance</span>
        </Link>
        <Link href="/" className="flex items-center gap-1.5 text-sm text-muted hover:text-brand-dark transition-colors">
          <ArrowLeft size={14} /> Retour à l&apos;accueil
        </Link>
      </nav>

      <div className="p-6 md:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 pt-6">
            <h1 className="text-3xl font-extrabold text-brand-dark mb-2">Tarifs simples et transparents</h1>
            <p className="text-sm text-muted">Sans engagement annuel · Résiliable à tout moment</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING_PLANS.map(plan => (
              <div
                key={plan.id}
                className={`bg-card rounded-xl shadow-card flex flex-col relative overflow-hidden
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
                    <p className="text-xs text-muted">{plan.desc}</p>
                  </div>

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
                    style={{ backgroundColor: plan.color, color: "white" }}
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
    </div>
  );
}
