"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Label,
} from "recharts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SCORE_COLORS, SCORE_LABELS } from "@/lib/constants";

type Horizon = 6 | 12 | 24;

export interface SimulatorAction {
  question_id: string;
  label: string;
  themeId: string;
  themeName: string;
  pillar: "E" | "S" | "G";
  new_value: boolean | number;
  month: number;
  scoreImpact: number;
}

interface TimelineSimulatorProps {
  baseResponses: Record<string, any>;
  previousResponses?: Record<string, any>;
  sectorGroup: string;
  currentScore: number;
  availableActions?: SimulatorAction[];
  token: string;
}

type ProjectionPoint = {
  month: number;
  label: string;
  withActions: number;
  doNothing: number;
};

const SCORE_BAND_ZONES = [
  { y1: 0, y2: 1, color: "#FFEBEE" },
  { y1: 1, y2: 2, color: "#FFF3E0" },
  { y1: 2, y2: 3, color: "#FFFDE7" },
  { y1: 3, y2: 4, color: "#F1F8E9" },
  { y1: 4, y2: 5, color: "#E8F5E9" },
];

// Default available actions (populated from XAI recommendations in v2)
const DEFAULT_ACTIONS: SimulatorAction[] = [
  { question_id: "climate_transition_q3", label: "Objectif de réduction GHG", themeId: "climate_transition", themeName: "Transition climatique", pillar: "E", new_value: true, month: 1, scoreImpact: 0.4 },
  { question_id: "board_governance_q1", label: "Membre indépendant au conseil", themeId: "board_governance", themeName: "Gouvernance du conseil", pillar: "G", new_value: true, month: 3, scoreImpact: 0.3 },
  { question_id: "data_privacy_q1", label: "DPO désigné + politique RGPD", themeId: "data_privacy", themeName: "Confidentialité des données", pillar: "G", new_value: true, month: 1, scoreImpact: 0.25 },
  { question_id: "ethics_anticorruption_q3", label: "Dispositif d'alerte éthique", themeId: "ethics_anticorruption", themeName: "Éthique & anti-corruption", pillar: "G", new_value: true, month: 2, scoreImpact: 0.2 },
  { question_id: "employee_wellbeing_q4", label: "Enquête satisfaction annuelle", themeId: "employee_wellbeing", themeName: "Bien-être des employés", pillar: "S", new_value: true, month: 2, scoreImpact: 0.2 },
  { question_id: "circular_economy_q3", label: "Démarche d'éco-conception", themeId: "circular_economy", themeName: "Économie circulaire", pillar: "E", new_value: true, month: 4, scoreImpact: 0.15 },
  { question_id: "supply_chain_responsibility_q2", label: "Charte fournisseurs ESG", themeId: "supply_chain_responsibility", themeName: "Chaîne d'approvisionnement", pillar: "S", new_value: true, month: 3, scoreImpact: 0.15 },
];

const PILLAR_COLORS = { E: "#2E7D32", S: "#1565C0", G: "#6A1B9A" } as const;

function getBand(s: number) { return Math.min(5, Math.max(0, Math.round(s))); }

export function TimelineSimulator({
  baseResponses, previousResponses = {}, sectorGroup,
  currentScore, availableActions, token,
}: TimelineSimulatorProps) {
  const actions = availableActions ?? DEFAULT_ACTIONS;
  const [horizon, setHorizon] = useState<Horizon>(12);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projections, setProjections] = useState<ProjectionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // CSRD 2026 deadline — month index from now
  const csrdMonth = horizon === 24 ? 18 : null; // approx 18 months into a 24-month horizon

  const selectedActions = actions.filter(a => selectedIds.has(a.question_id));
  const projectedScore = projections[projections.length - 1]?.withActions ?? currentScore;
  const projectedBand = getBand(projectedScore);

  // Build chart data
  function buildChartData(monthly: Record<number, number>): ProjectionPoint[] {
    return Array.from({ length: horizon + 1 }, (_, m) => ({
      month: m,
      label: m === 0 ? "Auj." : `M${m}`,
      withActions: monthly[m] ?? currentScore,
      doNothing: currentScore,
    }));
  }

  // Call simulate API — debounced 300ms
  const runSimulation = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (selectedActions.length === 0) {
        setProjections(buildChartData({ 0: currentScore }));
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/simulate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            base_responses: baseResponses,
            previous_responses: previousResponses,
            actions: selectedActions.map(a => ({
              question_id: a.question_id,
              new_value: a.new_value,
              month: a.month,
            })),
            sector: sectorGroup,
            horizon_months: horizon,
          }),
        });
        const data = await res.json();
        const monthly: Record<number, number> = {};
        Object.values(data.monthly_projections ?? {}).forEach((p: any) => {
          monthly[p.month] = p.overall_score;
        });
        setProjections(buildChartData(monthly));
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [selectedActions, horizon, baseResponses, sectorGroup, token, currentScore]);

  useEffect(() => { runSimulation(); }, [runSimulation]);

  // Initial flat projection
  useEffect(() => {
    setProjections(buildChartData({ 0: currentScore }));
  }, [currentScore, horizon]);

  function toggleAction(qId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(qId) ? next.delete(qId) : next.add(qId);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(actions.map(a => a.question_id))); }
  function deselectAll() { setSelectedIds(new Set()); }

  // Group actions by pillar
  const byPillar = (["E", "S", "G"] as const).map(p => ({
    pillar: p,
    items: actions.filter(a => a.pillar === p),
  }));

  // Custom tooltip
  function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const withAct = payload.find((p: any) => p.dataKey === "withActions")?.value;
    return (
      <div className="bg-white rounded-xl shadow-modal border border-gray-100 px-4 py-3 text-xs">
        <p className="font-medium text-gray-700 mb-1">{label}</p>
        <p className="text-brand-mid font-bold">Avec actions : {withAct?.toFixed(1)}</p>
        <p className="text-gray-400">Sans action : {currentScore.toFixed(1)}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Left panel — controls (hidden on mobile) */}
      <div className="hidden md:flex flex-col w-72 shrink-0 bg-white rounded-xl shadow-card p-5 overflow-y-auto">
        {/* Horizon selector */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-600 mb-2">Horizon temporel</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {([6, 12, 24] as Horizon[]).map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors
                  ${horizon === h ? "bg-brand-mid text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                {h} mois
              </button>
            ))}
          </div>
        </div>

        {/* Select all / none */}
        <div className="flex gap-2 mb-3">
          <button onClick={selectAll} className="text-xs text-brand-accent hover:underline">
            Tout sélectionner
          </button>
          <span className="text-gray-300">·</span>
          <button onClick={deselectAll} className="text-xs text-gray-400 hover:underline">
            Tout désélectionner
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-4">
          Scénario personnalisé ({selectedIds.size} action{selectedIds.size !== 1 ? "s" : ""} sélectionnée{selectedIds.size !== 1 ? "s" : ""})
        </p>

        {/* Action list grouped by pillar */}
        {byPillar.map(({ pillar, items }) => items.length === 0 ? null : (
          <div key={pillar} className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: PILLAR_COLORS[pillar] }}>
              {pillar === "E" ? "Environnement" : pillar === "S" ? "Social" : "Gouvernance"}
            </p>
            <div className="space-y-1.5">
              {items.map(action => {
                const isOn = selectedIds.has(action.question_id);
                return (
                  <label
                    key={action.question_id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors
                      ${isOn ? "bg-brand-light" : "hover:bg-gray-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggleAction(action.question_id)}
                      className="mt-0.5 accent-brand-mid shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-snug ${isOn ? "text-brand-dark" : "text-gray-700"}`}>
                        {action.label}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-gray-400">M{action.month}</span>
                        <span className="text-[10px] font-semibold text-brand-mid">
                          +{action.scoreImpact.toFixed(1)} pts
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Right panel — chart */}
      <div className="flex-1 bg-white rounded-xl shadow-card p-5 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-700">Projection du score</p>
          {loading && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-3 h-3 border border-gray-300 border-t-brand-mid rounded-full animate-spin" />
              Calcul...
            </span>
          )}
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={projections} margin={{ top: 8, right: 24, left: -10, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} tick={{ fontSize: 10 }} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />

            {/* CSRD deadline marker (T-SIM-003) */}
            {csrdMonth !== null && (
              <ReferenceLine
                x={`M${csrdMonth}`}
                stroke="#E65100" strokeDasharray="4 2" strokeWidth={1.5}
              >
                <Label value="Échéance CSRD 2026" position="top" fontSize={9} fill="#E65100" />
              </ReferenceLine>
            )}

            {/* Do nothing line — dashed red */}
            <Line
              type="monotone" dataKey="doNothing" name="Sans action"
              stroke="#E53935" strokeWidth={1.5} strokeDasharray="4 3"
              dot={false}
            />
            {/* With actions line — solid green */}
            <Line
              type="monotone" dataKey="withActions" name="Avec actions"
              stroke="#2E7D32" strokeWidth={2.5}
              dot={(props: any) => {
                // Show milestone node if an action fires this month
                const mLabel = props?.payload?.label;
                const mNum = parseInt(mLabel?.replace("M", "") ?? "99");
                const hasAction = selectedActions.some(a => a.month === mNum);
                if (!hasAction) return <g key={props.key} />;
                return (
                  <circle
                    key={props.key}
                    cx={props.cx} cy={props.cy} r={5}
                    fill="#2E7D32" stroke="white" strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Summary card below chart */}
        <div className="mt-4 bg-brand-light rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Score actuel → Score projeté</p>
              <p className="text-lg font-bold text-brand-dark">
                {currentScore.toFixed(1)} → {projectedScore.toFixed(1)}
                <span className="text-sm font-normal text-gray-500 ml-2">
                  en {horizon} mois
                </span>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                De <strong>{SCORE_LABELS[getBand(currentScore)]?.fr}</strong>{" "}
                à <strong>{SCORE_LABELS[projectedBand]?.fr}</strong>
              </p>
            </div>
            {projectedScore >= 3 && currentScore < 3 && (
              <div className="bg-white rounded-lg px-3 py-2 text-xs text-brand-dark font-medium shadow-sm">
                ✓ Répond aux exigences CSRD 2026
              </div>
            )}
          </div>
        </div>

        {/* Mobile fallback — static recommendation table */}
        <div className="md:hidden mt-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Actions recommandées</p>
          <div className="space-y-2">
            {actions.slice(0, 5).map(a => (
              <div key={a.question_id} className="flex items-center justify-between text-xs border-b border-gray-100 pb-2">
                <span className="text-gray-700">{a.label}</span>
                <span className="font-semibold text-brand-mid">+{a.scoreImpact.toFixed(1)} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
