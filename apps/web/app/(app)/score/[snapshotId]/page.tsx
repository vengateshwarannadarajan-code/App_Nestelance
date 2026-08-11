"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ScoreRing } from "@/components/ScoreRing";
import { AspirationalPerformanceSplitBar } from "@/components/AspirationalPerformanceSplitBar";
import { ArrowRight } from "lucide-react";
import { SCORE_LABELS, PILLAR_COLORS } from "@/lib/constants";

function getBand(score: number) { return Math.min(5, Math.max(0, Math.round(score))); }

// Particle animation for score ≥ 3
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full opacity-0"
          style={{
            width: Math.random() * 6 + 3,
            height: Math.random() * 6 + 3,
            backgroundColor: ["#2E7D32", "#4CAF50", "#81C784", "#A5D6A7"][i % 4],
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `particle-float ${2 + Math.random() * 3}s ease-out ${Math.random() * 2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function ScoreRevealPage() {
  const router = useRouter();
  const { snapshotId } = useParams<{ snapshotId: string }>();

  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Animation step states
  const [showRing, setShowRing] = useState(false);
  const [showNumber, setShowNumber] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const [showPillars, setShowPillars] = useState(false);
  const [showSplitBar, setShowSplitBar] = useState(false);
  const [showCTA, setShowCTA] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/scoring/snapshot/${snapshotId}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const data = await res.json();
        setSnapshot(data);
      } finally {
        setLoading(false);
      }
    });
  }, [snapshotId]);

  // Animation sequence
  useEffect(() => {
    if (!snapshot) return;
    const timers = [
      setTimeout(() => setShowRing(true),     200),
      setTimeout(() => setShowNumber(true),   800),
      setTimeout(() => setShowLabel(true),    1000),
      setTimeout(() => setShowPillars(true),  1200),
      setTimeout(() => setShowSplitBar(true), 1400),
      setTimeout(() => setShowCTA(true),      1600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [snapshot]);

  if (loading || !snapshot) {
    return (
      <div className="min-h-screen bg-[#1B2A1B] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const score = snapshot.overall_score ?? 0;
  const band = getBand(score);
  const bandLabel = SCORE_LABELS[band]?.fr ?? "";
  const pillarE = snapshot.pillar_e ?? 0;
  const pillarS = snapshot.pillar_s ?? 0;
  const pillarG = snapshot.pillar_g ?? 0;
  const isLow = score < 2;
  const isGood = score >= 3;

  return (
    <div className="min-h-screen bg-[#1B2A1B] flex items-center justify-center p-6 relative overflow-hidden">
      {isGood && <Particles />}

      <div className="text-center max-w-lg w-full relative z-10">
        {/* Low score empathy message */}
        {isLow && (
          <p className="text-white/50 text-sm mb-6 italic animate-fade-in-up">
            Vous partez de la réalité. C'est le meilleur point de départ.
          </p>
        )}

        {/* Main score ring */}
        <div className={`flex justify-center mb-6 transition-all duration-700 ${showRing ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
          <ScoreRing
            score={showNumber ? score : 0}
            animated={showNumber}
            size="large"
            showLabel={false}
          />
        </div>

        {/* Score label */}
        <div className={`transition-all duration-500 ${showLabel ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-white/60 text-sm mb-1">Votre score ESG global</p>
          <p className="text-white font-semibold text-lg">{bandLabel}</p>
        </div>

        {/* Pillar rings */}
        <div className={`flex items-center justify-center gap-8 mt-8 transition-all duration-500 ${showPillars ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {[
            { label: "Environnement", score: pillarE, pillar: "E" },
            { label: "Social",        score: pillarS, pillar: "S" },
            { label: "Gouvernance",   score: pillarG, pillar: "G" },
          ].map(({ label, score: pScore, pillar }) => (
            <div key={pillar} className="text-center">
              <ScoreRing
                score={showPillars ? pScore : 0}
                animated={showPillars}
                size="medium"
                showLabel={false}
              />
              <p className="text-white/50 text-xs mt-2">{label}</p>
            </div>
          ))}
        </div>

        {/* Split bar */}
        <div className={`mt-8 px-4 transition-all duration-500 ${showSplitBar ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <AspirationalPerformanceSplitBar
            aspirationalPct={55}
            performancePct={45}
          />
        </div>

        {/* CTA */}
        <div className={`mt-8 flex flex-col sm:flex-row gap-3 justify-center transition-all duration-500 ${showCTA ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center justify-center gap-2 bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-xl px-6 py-3 text-sm transition-colors"
          >
            Voir mon tableau de bord
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push(`/explainer/${snapshotId}`)}
            className="flex items-center justify-center gap-2 border border-white/20 text-white/80 hover:bg-white/10 rounded-xl px-6 py-3 text-sm transition-colors"
          >
            Pourquoi ce score ?
          </button>
        </div>
      </div>
    </div>
  );
}
