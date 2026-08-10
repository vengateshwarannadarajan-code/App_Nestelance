"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

export interface SHAPEntry {
  feature: string;        // plain French label (already translated)
  question_id: string;
  value: number | boolean | null;  // user's answer
  contribution: number;   // raw SHAP value
  question_type?: "aspirational" | "performance";
}

interface SHAPWaterfallChartProps {
  shapValues: SHAPEntry[];
  baselineScore: number;
  finalScore: number;
  locale?: "fr" | "en";
}

function formatContribution(raw: number): string {
  // Convert raw SHAP to point display: divide by 5 range, multiply by 5
  const pts = (raw / 5) * 5;
  return pts >= 0 ? `+${pts.toFixed(2)} pts` : `${pts.toFixed(2)} pts`;
}

function formatAnswer(value: SHAPEntry["value"], locale: string): string {
  if (value === null || value === undefined) return locale === "fr" ? "Non renseigné" : "Not provided";
  if (typeof value === "boolean") {
    if (locale === "fr") return value ? "Oui" : "Non";
    return value ? "Yes" : "No";
  }
  return String(value);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  locale: string;
}

function CustomTooltip({ active, payload, locale }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d: SHAPEntry & { contribution: number } = payload[0]?.payload;
  if (!d) return null;

  const isPositive = d.contribution >= 0;
  const typeLabel = d.question_type === "aspirational"
    ? (locale === "fr" ? "Engagement" : "Commitment")
    : "Performance";
  const typeColor = d.question_type === "aspirational" ? "#1565C0" : "#2E7D32";

  return (
    <div className="bg-white rounded-xl shadow-modal border border-gray-100 p-4 max-w-xs text-sm">
      <p className="font-semibold text-gray-900 mb-2 leading-snug">{d.feature}</p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">{locale === "fr" ? "Votre réponse" : "Your answer"}</span>
          <span className="font-medium text-gray-800">{formatAnswer(d.value, locale)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">{locale === "fr" ? "Impact" : "Impact"}</span>
          <span className="font-semibold" style={{ color: isPositive ? "#2E7D32" : "#E53935" }}>
            {formatContribution(d.contribution)}
          </span>
        </div>
        <div className="flex justify-between gap-4 mt-1">
          <span className="text-gray-500">Type</span>
          <span
            className="px-2 py-0.5 rounded-full text-white text-[10px] font-medium"
            style={{ backgroundColor: typeColor }}
          >
            {typeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SHAPWaterfallChart({
  shapValues, baselineScore, finalScore, locale = "fr",
}: SHAPWaterfallChartProps) {
  // Sort by absolute contribution descending, take top 12
  const sorted = [...shapValues]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 12);

  // Build top 3 positive/negative for aria description
  const positives = sorted.filter(s => s.contribution > 0).slice(0, 3);
  const negatives = sorted.filter(s => s.contribution < 0).slice(0, 3);

  const ariaDesc = [
    locale === "fr"
      ? `Principaux facteurs positifs : ${positives.map(p => p.feature).join(", ")}.`
      : `Main positive factors: ${positives.map(p => p.feature).join(", ")}.`,
    locale === "fr"
      ? `Principaux facteurs négatifs : ${negatives.map(n => n.feature).join(", ")}.`
      : `Main negative factors: ${negatives.map(n => n.feature).join(", ")}.`,
  ].join(" ");

  const chartData = sorted.map(s => ({
    ...s,
    // Positive = green bar going right, negative = red going left
    displayValue: s.contribution,
    barColor: s.contribution >= 0 ? "#2E7D32" : "#E53935",
    // Truncate label for chart display
    shortLabel: s.feature.length > 28 ? s.feature.slice(0, 26) + "…" : s.feature,
  }));

  return (
    <div>
      <div
        className="overflow-x-auto"
        role="img"
        aria-label={`Graphique SHAP. ${ariaDesc}`}
      >
        <div style={{ minWidth: 600 }}>
          <ResponsiveContainer width="100%" height={Math.max(300, sorted.length * 40)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 80, left: 8, bottom: 8 }}
            >
              <XAxis
                type="number"
                domain={["auto", "auto"]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v.toFixed(2)}
              />
              <YAxis
                type="category"
                dataKey="shortLabel"
                width={200}
                tick={{ fontSize: 11, fill: "#374151" }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine x={0} stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
              <Tooltip
                content={<CustomTooltip locale={locale} />}
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
              />
              <Bar dataKey="displayValue" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.barColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Score summary */}
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">{locale === "fr" ? "Score de base" : "Baseline"}</p>
          <p className="text-lg font-bold text-gray-600">{baselineScore.toFixed(1)}</p>
        </div>
        <div className="flex-1 mx-4 h-px bg-gray-200 relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-gray-400 bg-white px-2">
              {locale === "fr" ? "vos réponses" : "your answers"}
            </span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">{locale === "fr" ? "Votre score" : "Your score"}</p>
          <p className="text-lg font-bold text-brand-mid">{finalScore.toFixed(1)}</p>
        </div>
      </div>
    </div>
  );
}
