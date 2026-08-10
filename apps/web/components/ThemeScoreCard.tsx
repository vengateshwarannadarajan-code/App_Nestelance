"use client";

import { Lock } from "lucide-react";
import { SCORE_COLORS, SCORE_LABELS, PILLAR_COLORS, THEME_ICONS } from "@/lib/constants";
import { MaterialityBadge, type MaterialityLevel } from "@/components/MaterialityBadge";
import type { LucideIcon } from "lucide-react";

interface ThemeScoreCardProps {
  themeId: string;
  themeName: string;
  pillar: "E" | "S" | "G";
  score: number;
  cappingMet: boolean;
  aspirationalPct: number;
  performancePct: number;
  materialityWeight: number;
  topAction?: string;
  loading?: boolean;
}

function getMaterialityLevel(weight: number): MaterialityLevel {
  if (weight >= 1.0) return "Critical";
  if (weight >= 0.75) return "Material";
  if (weight >= 0.25) return "Relevant";
  return "NotRelevant";
}

function getBand(score: number): number {
  return Math.min(5, Math.max(0, Math.round(score)));
}

export function ThemeScoreCard({
  themeId, themeName, pillar, score, cappingMet,
  aspirationalPct, performancePct, materialityWeight,
  topAction, loading,
}: ThemeScoreCardProps) {
  const band = getBand(score);
  const color = SCORE_COLORS[band] ?? "#757575";
  const pillarColor = PILLAR_COLORS[pillar];
  const matLevel = getMaterialityLevel(materialityWeight);
  const Icon: LucideIcon = THEME_ICONS[themeId] ?? THEME_ICONS["default"];

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-card p-5 animate-skeleton">
        <div className="flex items-center justify-between mb-4">
          <div className="w-8 h-8 bg-gray-100 rounded-lg" />
          <div className="w-16 h-5 bg-gray-100 rounded-full" />
        </div>
        <div className="w-24 h-4 bg-gray-100 rounded mb-3" />
        <div className="w-12 h-8 bg-gray-100 rounded mb-2" />
        <div className="w-full h-1.5 bg-gray-100 rounded mt-4" />
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-xl shadow-card overflow-hidden flex flex-col hover:shadow-card-hover transition-shadow"
      style={{ borderTop: `3px solid ${pillarColor}` }}
    >
      <div className="p-5 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: pillarColor + "18" }}
          >
            <Icon className="w-4.5 h-4.5" style={{ color: pillarColor }} size={18} />
          </div>
          <MaterialityBadge level={matLevel} size="sm" />
        </div>

        {/* Theme name */}
        <p className="text-sm font-semibold text-gray-800 mb-2 leading-snug">{themeName}</p>

        {/* Score */}
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>
            {score.toFixed(1)}
          </span>
          <span className="text-sm text-gray-400">/5</span>
        </div>

        {/* Band label */}
        <span className="text-xs font-medium" style={{ color }}>
          {SCORE_LABELS[band]?.fr ?? ""}
        </span>

        {/* Capping warning */}
        {!cappingMet && (
          <div className="flex items-center gap-1.5 mt-2 bg-purple-50 rounded-lg px-2.5 py-1.5">
            <Lock className="w-3 h-3 text-purple-600 shrink-0" />
            <span className="text-xs text-purple-700">Plafonné à 3</span>
          </div>
        )}

        {/* Top action */}
        {topAction && (
          <p className="mt-2 text-xs text-gray-500 line-clamp-2 leading-relaxed">
            → {topAction}
          </p>
        )}
      </div>

      {/* Score band bar at bottom */}
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
    </div>
  );
}
