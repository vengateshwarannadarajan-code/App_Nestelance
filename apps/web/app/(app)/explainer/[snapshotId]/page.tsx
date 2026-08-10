"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { X, Loader2, Brain } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SHAPWaterfallChart, type SHAPEntry } from "@/components/SHAPWaterfallChart";
import { RecommendationCard } from "@/components/RecommendationCard";
import { FeatureGateOverlay } from "@/components/FeatureGateOverlay";
import { PILLAR_COLORS } from "@/lib/constants";

type FilterPillar = "all" | "E" | "S" | "G";
type SortKey = "score" | "financial" | "effort";

// Effort values for sorting
const EFFORT_RANK = { Low: 1, Medium: 2, High: 3 };

// Mock recommendations (replaced by real SHAP-driven recs in v2)
const MOCK_RECOMMENDATIONS = [
  {
    rank: 1, themeId: "climate_transition", themeName: "Transition climatique", pillar: "E" as const,
    action: "Fixer un objectif de réduction GHG documenté",
    effort: "Low" as const, scoreImpact: 0.8, isCapping: false,
    financialImpact: "Évite jusqu'à €18 000 d'amendes CSRD",
    timeframe: "1 mois",
    csrdMapping: "ESRS E1-4",
    why: "Sans objectif documenté, votre score Transition climatique reste inférieur à 3. C'est l'un des critères les plus vérifiés par les auditeurs CSRD.",
    how: ["Définir un objectif de réduction à 3 ou 5 ans (ex: -30% d'ici 2030)", "Le faire valider par la direction et le conseil", "Le publier dans votre rapport annuel ou sur votre site"],
  },
  {
    rank: 2, themeId: "board_governance", themeName: "Gouvernance du conseil", pillar: "G" as const,
    action: "Nommer un membre indépendant au conseil",
    effort: "Medium" as const, scoreImpact: 0.6, isCapping: true,
    financialImpact: "Améliore accès financement €",
    timeframe: "3 mois",
    csrdMapping: "ESRS G1-2",
    why: "L'absence de membre indépendant plafonne votre score Gouvernance à 3/5. C'est un seuil bloquant pour les investisseurs institutionnels.",
    how: ["Identifier 2-3 profils indépendants dans votre réseau", "Formaliser la nomination en assemblée générale", "Documenter le critère d'indépendance retenu"],
  },
  {
    rank: 3, themeId: "data_privacy", themeName: "Confidentialité des données", pillar: "G" as const,
    action: "Désigner un responsable protection des données (DPO)",
    effort: "Low" as const, scoreImpact: 0.5, isCapping: true,
    financialImpact: "Évite amendes RGPD jusqu'à 4% du CA",
    timeframe: "2 semaines",
    csrdMapping: "ESRS G1-1",
    why: "Sans DPO désigné, la question seuil RGPD est non satisfaite et votre score données est plafonné. Le DPO peut être externe.",
    how: ["Mandater un DPO externe (coût ~€200-500/an)", "Publier ses coordonnées sur votre site", "Tenir un registre des traitements à jour"],
  },
  {
    rank: 4, themeId: "employee_wellbeing", themeName: "Bien-être des employés", pillar: "S" as const,
    action: "Mettre en place une enquête satisfaction annuelle",
    effort: "Low" as const, scoreImpact: 0.4, isCapping: false,
    financialImpact: "Réduit turnover estimé -15%",
    timeframe: "1 mois",
    csrdMapping: "ESRS S1-17",
    why: "Les enquêtes de satisfaction sont un signal fort pour les clients et investisseurs ESG. Elles prennent moins d'une heure à mettre en place.",
    how: ["Utiliser un outil gratuit (Google Forms, Typeform)", "Inclure 8-10 questions sur engagement, charge de travail, management", "Partager les résultats anonymisés à l'équipe"],
  },
];

export default function XAIExplainerPage() {
  const router = useRouter();
  const { snapshotId } = useParams<{ snapshotId: string }>();
  const searchParams = useSearchParams();
  const snapshotParam = searchParams.get("snapshot") ?? snapshotId;

  const [shapData, setShapData] = useState<{
    status: "pending" | "ready" | "error";
    baseline: number;
    finalScore: number;
    entries: SHAPEntry[];
  }>({ status: "pending", baseline: 2.5, finalScore: 0, entries: [] });

  const [filterPillar, setFilterPillar] = useState<FilterPillar>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [locale] = useState<"fr" | "en">("fr");

  // Poll SHAP results
  useEffect(() => {
    if (!snapshotParam) return;
    const supabase = getSupabaseBrowserClient();

    let attempts = 0;
    const maxAttempts = 15;

    async function poll() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/shap/results/${snapshotParam}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const data = await res.json();

        if (data.status === "ready") {
          // Get snapshot for final score
          const snapRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/scoring/snapshot/${snapshotParam}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } }
          );
          const snap = await snapRes.json();

          // Translate SHAP values
          const entries: SHAPEntry[] = Object.entries(data.shap_values ?? {}).map(([q_id, val]) => {
            const driver = data.top_drivers?.find((d: any) => d.question_id === q_id);
            return {
              feature: q_id, // Will be translated by backend
              question_id: q_id,
              value: null,
              contribution: val as number,
              question_type: "aspirational",
            };
          });

          setShapData({
            status: "ready",
            baseline: data.baseline_score ?? 2.5,
            finalScore: snap?.overall_score ?? 0,
            entries,
          });
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          setShapData(prev => ({ ...prev, status: "error" }));
        }
      } catch {
        attempts++;
        if (attempts < maxAttempts) setTimeout(poll, 3000);
      }
    }

    poll();
  }, [snapshotParam]);

  // Filter + sort recommendations
  const filteredRecs = MOCK_RECOMMENDATIONS
    .filter(r => filterPillar === "all" || r.pillar === filterPillar)
    .sort((a, b) => {
      if (sortKey === "score")     return b.scoreImpact - a.scoreImpact;
      if (sortKey === "effort")    return EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort];
      return b.scoreImpact - a.scoreImpact; // financial fallback
    });

  // Capping actions always first
  const sortedRecs = [
    ...filteredRecs.filter(r => r.isCapping),
    ...filteredRecs.filter(r => !r.isCapping),
  ];

  const topNegative = shapData.entries
    .filter(e => e.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)[0];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-light rounded-lg flex items-center justify-center">
            <Brain className="w-4 h-4 text-brand-mid" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Pourquoi ce score ?</h1>
            <p className="text-xs text-gray-400">Explication IA de votre résultat ESG</p>
          </div>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <FeatureGateOverlay featureName="Explication IA du score" requiredPlan="professional">
          <div className="max-w-4xl mx-auto space-y-8">

            {/* Summary card */}
            {topNegative && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <p className="text-sm font-medium text-amber-900">
                  Votre score est principalement freiné par :{" "}
                  <strong>{topNegative.feature}</strong>.{" "}
                  Corriger cela pourrait améliorer votre score de{" "}
                  <strong>+{Math.abs(topNegative.contribution * 5 / 5).toFixed(1)} points</strong>.
                </p>
              </div>
            )}

            {/* SHAP Waterfall */}
            <div className="bg-white rounded-xl shadow-card p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Facteurs d'impact sur votre score
              </h2>
              {shapData.status === "pending" ? (
                <div className="flex items-center gap-3 py-10 justify-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Analyse en cours...</span>
                </div>
              ) : shapData.status === "error" ? (
                <p className="text-sm text-gray-400 py-8 text-center">
                  L'analyse IA n'est pas encore disponible pour ce score. Réessayez dans quelques minutes.
                </p>
              ) : (
                <SHAPWaterfallChart
                  shapValues={shapData.entries}
                  baselineScore={shapData.baseline}
                  finalScore={shapData.finalScore}
                  locale={locale}
                />
              )}
            </div>

            {/* Recommendations */}
            <div>
              {/* Filter + sort bar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="text-sm font-semibold text-gray-700">
                  Recommandations ({sortedRecs.length})
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Pillar filter */}
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    {(["all", "E", "S", "G"] as FilterPillar[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setFilterPillar(p)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors
                          ${filterPillar === p
                            ? "bg-brand-mid text-white"
                            : "text-gray-500 hover:bg-gray-50"
                          }`}
                        style={filterPillar === p && p !== "all"
                          ? { backgroundColor: PILLAR_COLORS[p as "E"|"S"|"G"] }
                          : {}}
                      >
                        {p === "all" ? "Tous" : p === "E" ? "Env." : p === "S" ? "Social" : "Gouv."}
                      </button>
                    ))}
                  </div>

                  {/* Sort */}
                  <select
                    value={sortKey}
                    onChange={e => setSortKey(e.target.value as SortKey)}
                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none text-gray-600"
                  >
                    <option value="score">Impact score</option>
                    <option value="financial">Impact financier</option>
                    <option value="effort">Effort</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                {sortedRecs.map(rec => (
                  <RecommendationCard key={rec.rank} {...rec} />
                ))}
              </div>
            </div>
          </div>
        </FeatureGateOverlay>
      </div>
    </div>
  );
}
