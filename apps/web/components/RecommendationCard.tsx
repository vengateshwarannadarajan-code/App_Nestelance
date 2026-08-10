"use client";

import { useState } from "react";
import { Key, ChevronDown, ChevronUp } from "lucide-react";

type Effort = "Low" | "Medium" | "High";

interface RecommendationCardProps {
  rank: number;
  action: string;           // max 10 words
  themeId: string;
  themeName: string;
  pillar: "E" | "S" | "G";
  effort: Effort;
  scoreImpact: number;      // e.g. 0.4
  financialImpact?: string; // e.g. "€12 000 évités"
  timeframe?: string;       // e.g. "3 mois"
  csrdMapping?: string;
  isCapping?: boolean;
  why?: string;             // 2-sentence explanation
  how?: string[];           // 3 bullet points
}

const EFFORT_CONFIG: Record<Effort, { label: string; labelEn: string; color: string; bg: string }> = {
  Low:    { label: "Facile",     labelEn: "Easy",   color: "#2E7D32", bg: "#E8F5E9" },
  Medium: { label: "Moyen",      labelEn: "Medium", color: "#E65100", bg: "#FFF3E0" },
  High:   { label: "Difficile",  labelEn: "Hard",   color: "#B71C1C", bg: "#FFEBEE" },
};

const PILLAR_COLORS: Record<"E" | "S" | "G", string> = {
  E: "#2E7D32",
  S: "#1565C0",
  G: "#6A1B9A",
};

export function RecommendationCard({
  rank, action, themeId, themeName, pillar, effort,
  scoreImpact, financialImpact, timeframe, csrdMapping,
  isCapping, why, how,
}: RecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const effortCfg = EFFORT_CONFIG[effort];
  const pillarColor = PILLAR_COLORS[pillar];
  const effortBorderColor = effortCfg.color;

  return (
    <div
      className="bg-white rounded-xl shadow-card overflow-hidden transition-shadow hover:shadow-card-hover"
      style={{ borderLeft: `4px solid ${effortBorderColor}` }}
    >
      <div className="p-5">
        {/* Top row */}
        <div className="flex items-start gap-4">
          {/* Rank number */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
            style={{ backgroundColor: pillarColor }}
          >
            {rank}
          </div>

          <div className="flex-1 min-w-0">
            {/* Action title */}
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900 leading-snug flex-1">{action}</p>
              {/* Score impact badge */}
              <span
                className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full text-white"
                style={{ backgroundColor: "#2E7D32" }}
              >
                +{scoreImpact.toFixed(1)} pts
              </span>
            </div>

            {/* Theme + effort row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                style={{ backgroundColor: pillarColor }}
              >
                {themeName}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ color: effortCfg.color, backgroundColor: effortCfg.bg }}
              >
                {effortCfg.label}
              </span>
              {timeframe && (
                <span className="text-xs text-gray-400">⏱ {timeframe}</span>
              )}
            </div>

            {/* Financial impact */}
            {financialImpact && (
              <p className="mt-1.5 text-xs text-gray-600">
                💰 {financialImpact}
              </p>
            )}

            {/* Capping indicator */}
            {isCapping && (
              <div className="flex items-center gap-1.5 mt-2 bg-purple-50 rounded-lg px-2.5 py-1.5">
                <Key className="w-3 h-3 text-purple-600 shrink-0" />
                <span className="text-xs text-purple-700 font-medium">Débloque le plafond de score</span>
              </div>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-3 text-xs text-brand-accent hover:text-brand-dark transition-colors ml-12"
        >
          {expanded ? (
            <><ChevronUp className="w-3.5 h-3.5" /> Réduire</>
          ) : (
            <><ChevronDown className="w-3.5 h-3.5" /> Voir le détail</>
          )}
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="ml-12 mt-3 space-y-3 border-t border-gray-100 pt-3">
            {why && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Pourquoi ça compte</p>
                <p className="text-xs text-gray-600 leading-relaxed">{why}</p>
              </div>
            )}
            {how && how.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Comment faire</p>
                <ul className="space-y-1">
                  {how.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-brand-mid font-bold shrink-0 mt-0.5">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {csrdMapping && (
              <p className="text-[10px] text-gray-400 font-mono">CSRD : {csrdMapping}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
