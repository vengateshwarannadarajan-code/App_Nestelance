"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ScoreRing } from "@/components/ScoreRing";
import { ThemeScoreCard } from "@/components/ThemeScoreCard";
import { AspirationalPerformanceSplitBar } from "@/components/AspirationalPerformanceSplitBar";
import { THEMES, SCORE_LABELS, PILLAR_COLORS } from "@/lib/constants";

function getBand(s: number) { return Math.min(5, Math.max(0, Math.round(s))); }

type HistoryLine = "overall" | "E" | "S" | "G";

export default function DashboardPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [prevSnapshot, setPrevSnapshot] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeLines, setActiveLines] = useState<Set<HistoryLine>>(new Set(["overall", "E", "S", "G"]));

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }

      const { data: profile } = await supabase
        .from("users").select("company_id").eq("id", session.user.id).single();
      if (!profile?.company_id) { router.push("/onboarding/profile"); return; }
      setCompanyId(profile.company_id);

      const { data: company } = await supabase
        .from("companies").select("name").eq("id", profile.company_id).single();
      setCompanyName(company?.name ?? "");

      // Fetch all snapshots for history chart (T-SCORE-007 + T-SCORE-009)
      const snapsRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/scoring/snapshots/${profile.company_id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const snapsData = await snapsRes.json();
      const allSnaps = snapsData.snapshots ?? [];
      setSnapshots(allSnaps);

      if (allSnaps.length > 0) setSnapshot(allSnaps[0]);
      if (allSnaps.length > 1) setPrevSnapshot(allSnaps[1]);

      setLoading(false);
    });
  }, []);

  // T-SCORE-008: Recalculer button
  async function handleRecalculate() {
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    router.push(`/onboarding/questionnaire?reload=1`);
  }

  function toggleLine(line: HistoryLine) {
    setActiveLines(prev => {
      const next = new Set(prev);
      next.has(line) ? next.delete(line) : next.add(line);
      return next;
    });
  }

  // Trend arrow vs previous snapshot
  function Trend({ current, prev }: { current: number; prev: number | undefined }) {
    if (prev === undefined) return null;
    const diff = current - prev;
    if (Math.abs(diff) < 0.05) return <Minus className="w-3 h-3 text-gray-400" />;
    return diff > 0
      ? <TrendingUp className="w-3 h-3 text-brand-mid" />
      : <TrendingDown className="w-3 h-3 text-red-500" />;
  }

  // History chart data
  const chartData = [...snapshots].reverse().map((s: any, i: number) => ({
    date: new Date(s.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
    overall: s.overall_score,
    E: s.pillar_e,
    S: s.pillar_s,
    G: s.pillar_g,
  }));

  if (loading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[0,1,2].map(i => (
            <div key={i} className="bg-white rounded-xl h-32 animate-skeleton" />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-4">
          {Array.from({length:10}).map((_,i) => (
            <div key={i} className="bg-white rounded-xl h-40 animate-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-brand-light rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-7 h-7 text-brand-mid" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Aucun score disponible</h2>
          <p className="text-sm text-gray-500 mb-5">Complétez le questionnaire ESG pour obtenir votre premier score.</p>
          <button
            onClick={() => router.push("/onboarding/questionnaire")}
            className="bg-brand-mid text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Commencer l'évaluation →
          </button>
        </div>
      </div>
    );
  }

  const themeScores = snapshot.theme_scores ?? {};
  const lastUpdated = new Date(snapshot.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={snapshot.overall_score} size="small" animated={false} />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{companyName}</h1>
            <p className="text-sm text-gray-400">
              {SCORE_LABELS[getBand(snapshot.overall_score)]?.fr} · Mis à jour le {lastUpdated}
            </p>
          </div>
        </div>
        <button
          onClick={handleRecalculate}
          className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Recalculer
        </button>
      </div>

      {/* Pillar cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Environnement", key: "pillar_e", pillar: "E" as const },
          { label: "Social",        key: "pillar_s", pillar: "S" as const },
          { label: "Gouvernance",   key: "pillar_g", pillar: "G" as const },
        ].map(({ label, key, pillar }) => (
          <div key={pillar} className="bg-white rounded-xl shadow-card p-5 flex items-center gap-4">
            <ScoreRing score={snapshot[key] ?? 0} size="medium" animated />
            <div>
              <p className="text-sm font-medium text-gray-700">{label}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Trend current={snapshot[key]} prev={prevSnapshot?.[key]} />
                {prevSnapshot && (
                  <span className="text-xs text-gray-400">
                    {((snapshot[key] ?? 0) - (prevSnapshot[key] ?? 0) > 0 ? "+" : "")}
                    {((snapshot[key] ?? 0) - (prevSnapshot[key] ?? 0)).toFixed(1)} vs précédent
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Theme grid (T-SCORE-006) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {THEMES.map(theme => {
          const score = themeScores[theme.id] ?? 0;
          const pillar = theme.pillar as "E" | "S" | "G";
          return (
            <ThemeScoreCard
              key={theme.id}
              themeId={theme.id}
              themeName={theme.label.fr}
              pillar={pillar}
              score={score}
              cappingMet={true}
              aspirationalPct={55}
              performancePct={45}
              materialityWeight={0.75}
            />
          );
        })}
      </div>

      {/* Split bar */}
      <div className="bg-white rounded-xl shadow-card p-5 mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-4">Répartition Engagements / Performance</p>
        <div className="space-y-4">
          {(["E", "S", "G"] as const).map(pillar => (
            <div key={pillar}>
              <p className="text-xs text-gray-500 mb-1.5">
                {pillar === "E" ? "Environnement" : pillar === "S" ? "Social" : "Gouvernance"}
              </p>
              <AspirationalPerformanceSplitBar
                aspirationalPct={55} performancePct={45} pillar={pillar}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Score history chart (T-SCORE-007) */}
      <div className="bg-white rounded-xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <p className="text-sm font-semibold text-gray-700">Historique des scores</p>
          <div className="flex gap-2 flex-wrap">
            {([
              { key: "overall", label: "Global",         color: "#2E7D32" },
              { key: "E",       label: "Environnement",  color: PILLAR_COLORS.E },
              { key: "S",       label: "Social",          color: PILLAR_COLORS.S },
              { key: "G",       label: "Gouvernance",     color: PILLAR_COLORS.G },
            ] as const).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleLine(key as HistoryLine)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border
                  ${activeLines.has(key as HistoryLine) ? "opacity-100" : "opacity-40"}`}
                style={{ borderColor: color, color }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {chartData.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-gray-400 mb-2">
              Complétez votre prochain bilan pour voir votre progression
            </p>
            <button
              onClick={handleRecalculate}
              className="flex items-center gap-1.5 text-xs text-brand-accent hover:underline"
            >
              Refaire mon évaluation <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} tick={{ fontSize: 11 }} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)", fontSize: 12 }}
              />
              {activeLines.has("overall") && (
                <Line type="monotone" dataKey="overall" name="Global" stroke="#2E7D32"
                  strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              )}
              {activeLines.has("E") && (
                <Line type="monotone" dataKey="E" name="Environnement" stroke={PILLAR_COLORS.E}
                  strokeWidth={1.5} dot={{ r: 2.5 }} strokeDasharray="4 2" />
              )}
              {activeLines.has("S") && (
                <Line type="monotone" dataKey="S" name="Social" stroke={PILLAR_COLORS.S}
                  strokeWidth={1.5} dot={{ r: 2.5 }} strokeDasharray="4 2" />
              )}
              {activeLines.has("G") && (
                <Line type="monotone" dataKey="G" name="Gouvernance" stroke={PILLAR_COLORS.G}
                  strokeWidth={1.5} dot={{ r: 2.5 }} strokeDasharray="4 2" />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
