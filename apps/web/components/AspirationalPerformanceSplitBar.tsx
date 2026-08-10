"use client";

import { useState } from "react";

interface AspirationalPerformanceSplitBarProps {
  aspirationalPct: number;   // 0–100
  performancePct: number;    // 0–100
  pillar?: "E" | "S" | "G";
  showTooltip?: boolean;
}

const PILLAR_BENCHMARKS: Record<"E" | "S" | "G", number> = {
  E: 61.2,
  S: 76.7,
  G: 38.1,
};

const PILLAR_LABELS: Record<"E" | "S" | "G", string> = {
  E: "Environnement",
  S: "Social",
  G: "Gouvernance",
};

export function AspirationalPerformanceSplitBar({
  aspirationalPct, performancePct, pillar, showTooltip = true,
}: AspirationalPerformanceSplitBarProps) {
  const [tooltip, setTooltip] = useState(false);
  const benchmarkPct = pillar ? PILLAR_BENCHMARKS[pillar] : null;

  // Normalise so sum = 100
  const total = aspirationalPct + performancePct;
  const aspW = total > 0 ? (aspirationalPct / total) * 100 : 50;
  const perfW = total > 0 ? (performancePct / total) * 100 : 50;

  return (
    <div className="w-full">
      {/* Labels row */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[#1565C0] font-medium flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#1565C0] inline-block" />
          Engagements ({Math.round(aspW)}%)
        </span>
        {pillar && (
          <span className="text-xs text-gray-400">
            Pilier {PILLAR_LABELS[pillar]}
          </span>
        )}
        <span className="text-xs text-[#2E7D32] font-medium flex items-center gap-1">
          Performance ({Math.round(perfW)}%)
          <span className="w-2 h-2 rounded-sm bg-[#2E7D32] inline-block" />
        </span>
      </div>

      {/* Bar */}
      <div
        className="relative w-full rounded-full overflow-hidden cursor-pointer"
        style={{ height: 8 }}
        onMouseEnter={() => showTooltip && setTooltip(true)}
        onMouseLeave={() => setTooltip(false)}
      >
        {/* Aspirational segment */}
        <div
          className="absolute left-0 top-0 h-full rounded-l-full transition-all duration-700"
          style={{ width: `${aspW}%`, backgroundColor: "#1565C0" }}
        >
          {aspW > 20 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-white font-medium">
              {Math.round(aspW)}%
            </span>
          )}
        </div>

        {/* Performance segment */}
        <div
          className="absolute right-0 top-0 h-full rounded-r-full transition-all duration-700"
          style={{ width: `${perfW}%`, backgroundColor: "#2E7D32" }}
        >
          {perfW > 20 && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-white font-medium">
              {Math.round(perfW)}%
            </span>
          )}
        </div>

        {/* Pillar benchmark tick */}
        {benchmarkPct !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-white/80 z-10"
            style={{ left: `${benchmarkPct}%` }}
            title={`Référence sectorielle : ${benchmarkPct}%`}
          />
        )}

        {/* Tooltip */}
        {tooltip && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-20 shadow-lg">
            Votre score reflète vos politiques ET vos résultats réels
            <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        )}
      </div>

      {/* Benchmark label */}
      {benchmarkPct !== null && (
        <div className="flex mt-1" style={{ paddingLeft: `${benchmarkPct}%` }}>
          <span className="text-[9px] text-gray-400 -ml-4">référence</span>
        </div>
      )}
    </div>
  );
}
