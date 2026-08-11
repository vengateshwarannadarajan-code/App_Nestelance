"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, AlertTriangle, FileText, TrendingDown } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { FeatureGateOverlay } from "@/components/FeatureGateOverlay";

function formatEur(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `€${Math.round(n / 1_000)} k`;
  return `€${n}`;
}

function ProbabilityBadge({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  const color = pct >= 50 ? "#B71C1C" : pct >= 25 ? "#E65100" : "#2E7D32";
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: color }}
    >
      {pct}% de probabilité
    </span>
  );
}

export default function FinancialPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [showMethod, setShowMethod] = useState(false);
  const [companyId, setCompanyId] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }

      const { data: profile } = await supabase
        .from("users").select("company_id").eq("id", session.user.id).single();
      if (!profile?.company_id) { router.push("/onboarding/profile"); return; }
      setCompanyId(profile.company_id);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/financial/risk/${profile.company_id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (res.ok) setData(await res.json());
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand-mid" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Impact financier calculé</h1>
          <p className="text-sm text-gray-500 mt-1">
            Amendes, contrats perdus, coûts carbone — estimés sur 18 mois.
          </p>
        </div>

        <FeatureGateOverlay featureName="Calculateur d'impact financier" requiredPlan="growth">
          {!data ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-800">
                Complétez votre évaluation ESG pour obtenir votre analyse financière.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Total risk card */}
              <div className="bg-white rounded-xl shadow-card p-6 border-l-4 border-red-500">
                <p className="text-xs text-gray-500 mb-1">Risque financier estimé sur 18 mois</p>
                <p className="text-4xl font-bold text-red-600 mb-2">
                  {formatEur(data.total_risk)}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-gray-600">
                    Score actuel : <strong>{data.current_score?.toFixed(1)}/5</strong>
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm text-brand-mid">
                    À score 3.5 : {formatEur(data.target_total)}
                    <span className="text-brand-mid font-semibold ml-1">
                      (économie {formatEur(data.potential_savings)})
                    </span>
                  </span>
                </div>
              </div>

              {/* Three risk categories */}
              <RiskCard
                icon={<FileText className="w-5 h-5 text-red-500" />}
                title="Amendes réglementaires CSRD"
                amount={data.breakdown?.regulatory_fines?.amount ?? 0}
                prob={data.breakdown?.regulatory_fines?.probability ?? 0}
                description="Non-conformité CSRD et réglementations sectorielles ESG sur 18 mois."
              />
              <RiskCard
                icon={<TrendingDown className="w-5 h-5 text-orange-500" />}
                title="Contrats EU à risque"
                amount={data.breakdown?.lost_contracts?.amount ?? 0}
                prob={data.breakdown?.lost_contracts?.probability ?? 0}
                description={`Basé sur ${Math.round((data.breakdown?.lost_contracts?.eu_pct ?? 0) * 100)}% de CA provenant de clients EU soumis à CSRD.`}
              />
              <RiskCard
                icon={<span className="text-lg">🌡️</span>}
                title="Coût carbone résiduel"
                amount={data.breakdown?.carbon_costs?.amount ?? 0}
                prob={1}
                description={`${data.breakdown?.carbon_costs?.tonnes ?? 0} tCO₂e × €${data.breakdown?.carbon_costs?.price_per_tonne}/tonne (prix marché EU ETS).`}
                hideProb
              />

              {/* T-FIN-003: Methodology section */}
              <div className="bg-white rounded-xl shadow-card overflow-hidden">
                <button
                  onClick={() => setShowMethod(!showMethod)}
                  className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Comment ce calcul est-il effectué ?
                  {showMethod ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {showMethod && (
                  <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                    <MethodItem
                      title="Amendes réglementaires"
                      text="0,5% de votre chiffre d'affaires annuel, pondéré par la probabilité de non-conformité selon votre score ESG actuel, extrapolé sur 18 mois."
                    />
                    <MethodItem
                      title="Contrats perdus"
                      text="Basé sur la part de votre chiffre d'affaires provenant de clients EU qui intègrent des critères ESG dans leurs appels d'offres. La probabilité de perte augmente avec un score faible."
                    />
                    <MethodItem
                      title="Coût carbone"
                      text="Vos émissions Scope 1+2 déclarées multipliées par €65 par tonne de CO₂e, correspondant au prix moyen du marché carbone européen (EU ETS 2025)."
                    />
                    <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
                      Ces estimations sont indicatives. Elles ne constituent pas un conseil juridique ou financier.
                      Adapté des méthodologies de risque ESG LSEG et MSCI.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </FeatureGateOverlay>
      </div>
    </div>
  );
}

function RiskCard({
  icon, title, amount, prob, description, hideProb,
}: {
  icon: React.ReactNode;
  title: string;
  amount: number;
  prob: number;
  description: string;
  hideProb?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold text-gray-900">{formatEur(amount)}</p>
          {!hideProb && <ProbabilityBadge prob={prob} />}
        </div>
      </div>
    </div>
  );
}

function MethodItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="pt-3">
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-xs text-gray-500 leading-relaxed">{text}</p>
    </div>
  );
}
