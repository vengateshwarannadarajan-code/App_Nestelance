"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, AlertCircle, Loader2, Save } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { QuestionCard } from "@/components/QuestionCard";
import { THEMES, PILLAR_COLORS } from "@/lib/constants";

// ── Question definitions (mirrors packages/scoring-engine/questions.py) ──
const QUESTION_TEXTS: Record<string, {
  text: string; inputType: "boolean" | "numeric"; type: "aspirational" | "performance";
  isCapping?: boolean; csrd?: string; unit?: string; rangeHint?: string;
}> = {
  climate_transition_q1: { text: "Votre entreprise mesure-t-elle et déclare-t-elle ses émissions GHG Scope 1 et 2 ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS E1-6" },
  climate_transition_q2: { text: "Quelles sont vos émissions Scope 1 + 2 totales (tCO₂e/an) ?", inputType: "numeric", type: "performance", csrd: "ESRS E1-6", unit: "tCO₂e/an", rangeHint: "Ex: 450" },
  climate_transition_q3: { text: "Avez-vous un objectif de réduction des émissions GHG fixé et documenté ?", inputType: "boolean", type: "aspirational", csrd: "ESRS E1-4" },
  climate_transition_q4: { text: "Quelle part de votre consommation énergétique provient de sources renouvelables ?", inputType: "numeric", type: "performance", csrd: "ESRS E1-5", unit: "%", rangeHint: "0 – 100" },
  climate_transition_q5: { text: "Votre entreprise a-t-elle un plan de transition climatique formalisé ?", inputType: "boolean", type: "aspirational", csrd: "ESRS E1-1" },
  climate_transition_q6: { text: "Quelle est votre consommation totale d'énergie (MWh/an) ?", inputType: "numeric", type: "performance", csrd: "ESRS E1-5", unit: "MWh/an" },
  climate_transition_q7: { text: "Avez-vous engagé vos principaux fournisseurs dans une démarche de réduction des émissions ?", inputType: "boolean", type: "aspirational", csrd: "ESRS E1-6" },
  climate_transition_q8: { text: "Votre entreprise a-t-elle reçu des amendes environnementales au cours des 2 dernières années ?", inputType: "boolean", type: "performance", csrd: "ESRS E1-1" },

  biodiversity_q1: { text: "Avez-vous réalisé une évaluation d'impact sur la biodiversité pour vos sites principaux ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS E4-2" },
  biodiversity_q2: { text: "Votre entreprise a-t-elle une politique de protection de la biodiversité documentée ?", inputType: "boolean", type: "aspirational", csrd: "ESRS E4-1" },
  biodiversity_q3: { text: "Quelle surface de terres est artificialisée par vos activités (hectares) ?", inputType: "numeric", type: "performance", csrd: "ESRS E4-3", unit: "ha" },
  biodiversity_q4: { text: "Avez-vous des engagements de restauration écologique ou de compensation biodiversité ?", inputType: "boolean", type: "aspirational", csrd: "ESRS E4-4" },

  circular_economy_q1: { text: "Votre entreprise dispose-t-elle d'une politique de gestion des déchets documentée ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS E5-1" },
  circular_economy_q2: { text: "Quel pourcentage de vos déchets est détourné des décharges (recyclage, valorisation) ?", inputType: "numeric", type: "performance", csrd: "ESRS E5-4", unit: "%", rangeHint: "0 – 100" },
  circular_economy_q3: { text: "Avez-vous une démarche d'éco-conception ou de réduction à la source des emballages ?", inputType: "boolean", type: "aspirational", csrd: "ESRS E5-2" },
  circular_economy_q4: { text: "Utilisez-vous des matières premières secondaires ou recyclées dans votre production ?", inputType: "boolean", type: "aspirational", csrd: "ESRS E5-3" },
  circular_economy_q5: { text: "Votre entreprise possède-t-elle une certification SME (ISO 14001 ou EMAS) ?", inputType: "boolean", type: "performance", csrd: "ESRS E5-1" },

  employee_wellbeing_q1: { text: "Votre entreprise est-elle en conformité avec toutes les lois du travail et normes H&S applicables ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS S1-1" },
  employee_wellbeing_q2: { text: "Avez-vous un programme de formation continue pour vos employés ?", inputType: "boolean", type: "aspirational", csrd: "ESRS S1-7" },
  employee_wellbeing_q3: { text: "Quel est votre taux d'accidents du travail (pour 1 000 employés/an) ?", inputType: "numeric", type: "performance", csrd: "ESRS S1-14", unit: "/1000 emp." },
  employee_wellbeing_q4: { text: "Votre entreprise effectue-t-elle des enquêtes annuelles de satisfaction des employés ?", inputType: "boolean", type: "aspirational", csrd: "ESRS S1-17" },
  employee_wellbeing_q5: { text: "Quel est votre écart de rémunération H/F à poste équivalent ?", inputType: "numeric", type: "performance", csrd: "ESRS S1-16", unit: "%", rangeHint: "0 – 50" },

  human_rights_community_q1: { text: "Votre entreprise a-t-elle publiquement pris un engagement de respect des droits humains ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS S2-1" },
  human_rights_community_q2: { text: "Menez-vous des actions de due diligence droits humains dans votre chaîne d'approvisionnement ?", inputType: "boolean", type: "aspirational", csrd: "ESRS S2-1" },
  human_rights_community_q3: { text: "Avez-vous identifié et documenté vos risques saïlants en matière de droits humains au cours des 12 derniers mois ?", inputType: "boolean", type: "aspirational", csrd: "ESRS S2-2" },
  human_rights_community_q4: { text: "Votre entreprise contribue-t-elle au développement de la communauté locale (mécénat, emploi local) ?", inputType: "boolean", type: "performance", csrd: "ESRS S3-1" },

  supply_chain_responsibility_q1: { text: "Votre entreprise mène-t-elle une évaluation des fournisseurs avant de les référencer ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS S2-4" },
  supply_chain_responsibility_q2: { text: "Avez-vous une charte fournisseurs intégrant des critères ESG ?", inputType: "boolean", type: "aspirational", csrd: "ESRS S2-1" },
  supply_chain_responsibility_q3: { text: "Quelle part de vos fournisseurs stratégiques a fait l'objet d'un audit RSE au cours des 3 dernières années ?", inputType: "numeric", type: "performance", csrd: "ESRS S2-4", unit: "%" },
  supply_chain_responsibility_q4: { text: "Avez-vous un mécanisme de réclamation accessible à vos fournisseurs et sous-traitants ?", inputType: "boolean", type: "aspirational", csrd: "ESRS S2-3" },

  board_governance_q1: { text: "Votre conseil d'administration (ou organe équivalent) comprend-il au moins un membre indépendant ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS G1-2" },
  board_governance_q2: { text: "Les critères ESG sont-ils intégrés dans la rémunération des dirigeants ?", inputType: "boolean", type: "aspirational", csrd: "ESRS G1-3" },
  board_governance_q3: { text: "Quel est le pourcentage de membres indépendants au conseil ?", inputType: "numeric", type: "performance", csrd: "ESRS G1-2", unit: "%" },
  board_governance_q4: { text: "Quel est le pourcentage de femmes au conseil d'administration ?", inputType: "numeric", type: "performance", csrd: "ESRS S1-9", unit: "%" },
  board_governance_q5: { text: "Le comité de rémunération est-il composé à 100% de membres indépendants ?", inputType: "numeric", type: "performance", csrd: "ESRS G1-2", unit: "%" },
  board_governance_q6: { text: "Le comité d'audit est-il composé à 100% de membres indépendants ?", inputType: "numeric", type: "performance", csrd: "ESRS G1-2", unit: "%" },

  ethics_anticorruption_q1: { text: "Votre entreprise dispose-t-elle d'une politique anti-corruption et anti-pot-de-vin formalisée ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS G1-4" },
  ethics_anticorruption_q2: { text: "Proposez-vous une formation anti-corruption aux collaborateurs exposés ?", inputType: "boolean", type: "aspirational", csrd: "ESRS G1-4" },
  ethics_anticorruption_q3: { text: "Disposez-vous d'un dispositif d'alerte éthique (whistleblowing) conforme Sapin II / EU Whistleblower Directive ?", inputType: "boolean", type: "aspirational", csrd: "ESRS G1-4" },
  ethics_anticorruption_q4: { text: "Votre entreprise a-t-elle reçu des sanctions ou amendes pour corruption au cours des 2 dernières années ?", inputType: "boolean", type: "performance", csrd: "ESRS G1-4" },

  data_privacy_q1: { text: "Votre entreprise dispose-t-elle d'une politique de confidentialité conforme au RGPD et d'un contact DPO désigné ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS G1-1" },
  data_privacy_q2: { text: "Menez-vous des analyses d'impact sur la protection des données (AIPD) pour vos traitements sensibles ?", inputType: "boolean", type: "aspirational", csrd: "ESRS G1-1" },
  data_privacy_q3: { text: "Avez-vous subi une violation de données personnelles au cours des 12 derniers mois ?", inputType: "boolean", type: "performance", csrd: "ESRS G1-1" },
  data_privacy_q4: { text: "Vos sous-traitants traitant des données personnelles sont-ils liés par des clauses contractuelles RGPD ?", inputType: "boolean", type: "aspirational", csrd: "ESRS G1-1" },

  shareholder_rights_q1: { text: "Votre entreprise tient-elle au moins une assemblée générale annuelle (ou revue de gouvernance équivalente) ?", inputType: "boolean", type: "aspirational", isCapping: true, csrd: "ESRS G1-1" },
  shareholder_rights_q2: { text: "Les actionnaires ou associés ont-ils accès à des informations financières et ESG annuelles avant l'assemblée ?", inputType: "boolean", type: "aspirational", csrd: "ESRS G1-1" },
  shareholder_rights_q3: { text: "Quel est le délai de convocation à votre assemblée générale (jours) ?", inputType: "numeric", type: "performance", csrd: "ESRS G1-1", unit: "jours", rangeHint: "Min. 28 jours recommandés" },
};

const THEME_QUESTIONS: Record<string, string[]> = {
  climate_transition: ["climate_transition_q1","climate_transition_q2","climate_transition_q3","climate_transition_q4","climate_transition_q5","climate_transition_q6","climate_transition_q7","climate_transition_q8"],
  biodiversity: ["biodiversity_q1","biodiversity_q2","biodiversity_q3","biodiversity_q4"],
  circular_economy: ["circular_economy_q1","circular_economy_q2","circular_economy_q3","circular_economy_q4","circular_economy_q5"],
  employee_wellbeing: ["employee_wellbeing_q1","employee_wellbeing_q2","employee_wellbeing_q3","employee_wellbeing_q4","employee_wellbeing_q5"],
  human_rights_community: ["human_rights_community_q1","human_rights_community_q2","human_rights_community_q3","human_rights_community_q4"],
  supply_chain_responsibility: ["supply_chain_responsibility_q1","supply_chain_responsibility_q2","supply_chain_responsibility_q3","supply_chain_responsibility_q4"],
  board_governance: ["board_governance_q1","board_governance_q2","board_governance_q3","board_governance_q4","board_governance_q5","board_governance_q6"],
  ethics_anticorruption: ["ethics_anticorruption_q1","ethics_anticorruption_q2","ethics_anticorruption_q3","ethics_anticorruption_q4"],
  data_privacy: ["data_privacy_q1","data_privacy_q2","data_privacy_q3","data_privacy_q4"],
  shareholder_rights: ["shareholder_rights_q1","shareholder_rights_q2","shareholder_rights_q3"],
};

const ALL_QUESTIONS = Object.values(THEME_QUESTIONS).flat();

type ThemeStatus = "not-started" | "in-progress" | "complete" | "gateway-missing";
type Answers = Record<string, boolean | number | null>;
type SmartDefaults = Record<string, boolean>;

function getThemeStatus(themeId: string, answers: Answers): ThemeStatus {
  const qs = THEME_QUESTIONS[themeId] ?? [];
  const answered = qs.filter(q => answers[q] !== undefined);
  if (answered.length === 0) return "not-started";
  const capQ = qs.find(q => QUESTION_TEXTS[q]?.isCapping);
  if (capQ && answers[capQ] === false) return "gateway-missing";
  if (answered.length === qs.length) return "complete";
  return "in-progress";
}

export default function QuestionnairePage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({});
  const [smartDefaults, setSmartDefaults] = useState<SmartDefaults>({});
  const [currentThemeIdx, setCurrentThemeIdx] = useState(0);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [skipWarning, setSkipWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [sectorGroup, setSectorGroup] = useState<string>("services");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const themeIds = THEMES.map(t => t.id);
  const currentTheme = THEMES[currentThemeIdx];
  const currentThemeQIds = THEME_QUESTIONS[currentTheme.id] ?? [];
  const currentQId = currentThemeQIds[currentQIdx];
  const currentQDef = QUESTION_TEXTS[currentQId];
  const totalAnswered = Object.keys(answers).length;
  const progress = Math.round((totalAnswered / ALL_QUESTIONS.length) * 100);

  // ── Load existing answers + pre-fills on mount ─────────────
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setToken(session.access_token);

      const { data: profile } = await supabase
        .from("users").select("company_id").eq("id", session.user.id).single();
      if (!profile?.company_id) { router.push("/onboarding/profile"); return; }
      setCompanyId(profile.company_id);

      const { data: company } = await supabase
        .from("companies").select("sector_group, scope12_emissions_t").eq("id", profile.company_id).single();
      if (company?.sector_group) setSectorGroup(company.sector_group);

      // Load existing answers
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/questionnaire/responses/${profile.company_id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const data = await res.json();
      const existingAnswers: Answers = data.responses ?? {};

      // T-PROFILE-005: Pre-fill scope12 from company profile
      const scope12 = company?.scope12_emissions_t ?? parseFloat(sessionStorage.getItem("prefill_scope12") ?? "");
      if (scope12 && !existingAnswers["climate_transition_q2"]) {
        existingAnswers["climate_transition_q2"] = scope12;
        setSmartDefaults(prev => ({ ...prev, climate_transition_q2: true }));
      }

      // T-QUEST-005: Load sector averages for remaining numeric questions
      const avgRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/companies/${profile.company_id}/sector-averages`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const avgData = await avgRes.json();
      const defaults: SmartDefaults = { ...smartDefaults };
      for (const [qId, avg] of Object.entries(avgData.averages ?? {})) {
        if (!existingAnswers[qId] && avg) {
          existingAnswers[qId] = avg as number;
          defaults[qId] = true;
        }
      }
      setSmartDefaults(defaults);
      setAnswers(existingAnswers);
    });
  }, []);

  // ── Auto-save on answer change ──────────────────────────────
  const handleAnswerChange = useCallback((qId: string, value: boolean | number | null) => {
    setAnswers(prev => ({ ...prev, [qId]: value }));
    // Remove smart default flag on user edit
    setSmartDefaults(prev => { const n = { ...prev }; delete n[qId]; return n; });
    setSaveStatus("saving");

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const themeId = Object.entries(THEME_QUESTIONS).find(([, qs]) => qs.includes(qId))?.[0] ?? "";
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/questionnaire/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ question_id: qId, theme_id: themeId, answer_value: value }),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 600);
  }, []);

  // ── Navigation ──────────────────────────────────────────────
  function handleNext() {
    // T-QUEST-004: Skip warning if unanswered
    if (answers[currentQId] === undefined) {
      setSkipWarning(true);
      return;
    }
    advance();
  }

  function advance() {
    setSkipWarning(false);
    if (currentQIdx < currentThemeQIds.length - 1) {
      setCurrentQIdx(currentQIdx + 1);
    } else if (currentThemeIdx < themeIds.length - 1) {
      setCurrentThemeIdx(currentThemeIdx + 1);
      setCurrentQIdx(0);
    } else {
      handleFinalSubmit();
    }
  }

  function handleBack() {
    setSkipWarning(false);
    if (currentQIdx > 0) {
      setCurrentQIdx(currentQIdx - 1);
    } else if (currentThemeIdx > 0) {
      const prevTheme = themeIds[currentThemeIdx - 1];
      setCurrentThemeIdx(currentThemeIdx - 1);
      setCurrentQIdx((THEME_QUESTIONS[prevTheme]?.length ?? 1) - 1);
    }
  }

  async function handleFinalSubmit() {
    setSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const { data: company } = await supabase
      .from("companies").select("sector_group").eq("id", companyId).single();

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/scoring/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        company_id: companyId,
        sector_group: company?.sector_group ?? sectorGroup,
        responses: answers,
      }),
    });
    const data = await res.json();
    router.push(`/score/computing?snapshot_id=${data.snapshot_id}`);
  }

  const isLastQuestion = currentThemeIdx === themeIds.length - 1 &&
    currentQIdx === currentThemeQIds.length - 1;

  if (!currentQDef) return null;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-100 overflow-y-auto shrink-0">
        <div className="px-4 py-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Progression</span>
            <span className="text-xs font-medium text-brand-mid">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-5">
            <div className="bg-brand-mid h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>

          {THEMES.map((theme, idx) => {
            const status = getThemeStatus(theme.id, answers);
            const isActive = idx === currentThemeIdx;
            const answered = (THEME_QUESTIONS[theme.id] ?? []).filter(q => answers[q] !== undefined).length;
            const total = THEME_QUESTIONS[theme.id]?.length ?? 0;
            const pillarColor = PILLAR_COLORS[theme.pillar as "E" | "S" | "G"];

            return (
              <button
                key={theme.id}
                onClick={() => { setCurrentThemeIdx(idx); setCurrentQIdx(0); setSkipWarning(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors
                  ${isActive ? "bg-brand-light" : "hover:bg-gray-50"}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isActive ? "text-brand-dark" : "text-gray-700"}`}>
                    {theme.label.fr}
                  </span>
                  {status === "complete"      && <CheckCircle2 className="w-3.5 h-3.5 text-brand-mid shrink-0" />}
                  {status === "in-progress"   && <Circle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  {status === "gateway-missing" && <AlertCircle className="w-3.5 h-3.5 text-purple-500 shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pillarColor }} />
                  <span className="text-[10px] text-gray-400">{answered}/{total} · {
                    status === "not-started" ? "Non commencé" :
                    status === "in-progress" ? "En cours" :
                    status === "complete" ? "Complet" : "Seuil manquant"
                  }</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between shrink-0">
          <div>
            <span className="text-sm text-gray-500">{currentTheme.label.fr}</span>
            <span className="text-xs text-gray-400 ml-2">Question {currentQIdx + 1}/{currentThemeQIds.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {saveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin text-gray-400" /><span className="text-gray-400">Sauvegarde...</span></>}
            {saveStatus === "saved"  && <><Save className="w-3 h-3 text-brand-mid" /><span className="text-brand-mid">Sauvegardé ✓</span></>}
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-2xl mx-auto">
            <QuestionCard
              questionId={currentQId}
              theme={currentTheme.label.fr}
              pillar={currentTheme.pillar as "E" | "S" | "G"}
              text={currentQDef.text}
              inputType={currentQDef.inputType}
              questionType={currentQDef.type}
              isCapping={!!currentQDef.isCapping}
              csrdMapping={currentQDef.csrd}
              unit={currentQDef.unit}
              rangeHint={currentQDef.rangeHint}
              currentAnswer={answers[currentQId] ?? null}
              isSmartDefault={!!smartDefaults[currentQId]}
              onAnswerChange={handleAnswerChange}
            />

            {/* T-QUEST-004: Skip warning */}
            {skipWarning && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800 mb-3">
                  {currentQDef.inputType === "boolean"
                    ? "Sans réponse, cette question sera comptée comme Non. Cela peut affecter votre score."
                    : "Sans réponse, cette valeur sera remplacée par la performance la plus faible de votre secteur."
                  }
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={advance}
                    className="text-sm text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors"
                  >
                    Passer quand même
                  </button>
                  <button
                    onClick={() => setSkipWarning(false)}
                    className="text-sm bg-amber-600 text-white rounded-lg px-3 py-1.5 hover:bg-amber-700 transition-colors"
                  >
                    Répondre
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white border-t border-gray-100 px-8 py-4 flex items-center justify-between shrink-0">
          <button
            onClick={handleBack}
            disabled={currentThemeIdx === 0 && currentQIdx === 0}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors"
          >
            ← Précédent
          </button>

          <button
            onClick={isLastQuestion ? handleFinalSubmit : handleNext}
            disabled={submitting}
            className="bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLastQuestion ? "Calculer mon score ESG →" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>
  );
}
