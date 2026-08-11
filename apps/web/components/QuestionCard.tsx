"use client";

import { useState } from "react";
import { Key, Info, AlertTriangle } from "lucide-react";
import { PILLAR_COLORS } from "@/lib/constants";

export type InputType = "boolean" | "numeric";
export type QuestionType = "aspirational" | "performance";

interface QuestionCardProps {
  questionId: string;
  theme: string;
  pillar: "E" | "S" | "G";
  text: string;
  inputType: InputType;
  questionType: QuestionType;
  isCapping: boolean;
  csrdMapping?: string;
  unit?: string;
  rangeHint?: string;
  currentAnswer: boolean | number | null;
  isSmartDefault?: boolean;       // amber highlight for pre-filled sector average
  onAnswerChange: (questionId: string, value: boolean | number | null) => void;
}

export function QuestionCard({
  questionId, theme, pillar, text, inputType, questionType,
  isCapping, csrdMapping, unit, rangeHint,
  currentAnswer, isSmartDefault, onAnswerChange,
}: QuestionCardProps) {
  const [showCapping, setShowCapping] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const pillarColor = PILLAR_COLORS[pillar];
  const cappingWarning = isCapping && currentAnswer === false;

  function handleBooleanSelect(val: boolean) {
    onAnswerChange(questionId, val);
  }

  function handleNumericChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value === "" ? null : parseFloat(e.target.value);
    onAnswerChange(questionId, val);
  }

  const inputId = `question-${questionId}`;

  return (
    <div
      className="bg-white rounded-xl shadow-card overflow-hidden"
      style={{ borderLeft: `4px solid ${pillarColor}` }}
    >
      {/* T-A11Y-001: fieldset + legend so the question text is programmatically
          associated with its inputs, not just visually adjacent. */}
      <fieldset className="border-0 m-0 p-0">
        <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1">
            {csrdMapping && (
              <span className="inline-block text-xs text-gray-400 font-mono mb-2">{csrdMapping}</span>
            )}
            <legend className="text-base font-medium text-gray-900 leading-relaxed p-0">{text}</legend>
          </div>

          {/* T-QUEST-002: Capping indicator */}
          {isCapping && (
            <div className="relative shrink-0">
              <button
                type="button"
                onMouseEnter={() => setShowCapping(true)}
                onMouseLeave={() => setShowCapping(false)}
                className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full text-xs font-medium"
              >
                <Key className="w-3 h-3" />
                Question clé
              </button>
              {showCapping && (
                <div className="absolute right-0 top-8 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 z-10 shadow-modal">
                  Cette question est un indicateur de seuil — ne pas la satisfaire plafonnera
                  votre score dans ce thème à 3/5.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        {inputType === "boolean" ? (
          <div className="flex gap-3" role="radiogroup" aria-label={text}>
            <BooleanButton
              label="Oui"
              selected={currentAnswer === true}
              onClick={() => handleBooleanSelect(true)}
              color={pillarColor}
            />
            <BooleanButton
              label="Non"
              selected={currentAnswer === false}
              onClick={() => handleBooleanSelect(false)}
              color="#E53935"
            />
          </div>
        ) : (
          <div>
            <label htmlFor={inputId} className="sr-only">
              {text}{unit ? ` en ${unit}` : ""}
            </label>
            <div className="relative">
              <input
                id={inputId}
                type="number"
                value={currentAnswer === null ? "" : String(currentAnswer)}
                onChange={handleNumericChange}
                placeholder={rangeHint ?? ""}
                className={`w-full rounded-lg border px-3.5 py-3 text-sm outline-none transition-colors pr-20
                  ${isSmartDefault
                    ? "border-amber-400 bg-amber-50 focus:border-amber-500"
                    : "border-gray-200 focus:border-brand-accent"
                  }`}
              />
              {unit && (
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {unit}
                </span>
              )}
            </div>
            {isSmartDefault && (
              <p className="mt-1.5 text-xs text-amber-700 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Moyenne du secteur — mettez à jour avec vos données réelles
              </p>
            )}
            {rangeHint && !isSmartDefault && (
              <p className="mt-1.5 text-xs text-gray-400">{rangeHint}</p>
            )}
          </div>
        )}

        {/* T-QUEST-002: Capping warning on No answer */}
        {cappingWarning && (
          <div className="mt-4 flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3.5 py-3">
            <AlertTriangle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <p className="text-xs text-purple-800">
              Sans cet engagement, votre score <strong>{theme}</strong> sera plafonné à 3/5.
            </p>
          </div>
        )}

        {/* Question type badge */}
        <div className="mt-4 flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
            ${questionType === "aspirational"
              ? "bg-blue-50 text-blue-700"
              : "bg-green-50 text-green-700"
            }`}>
            {questionType === "aspirational" ? "Engagement" : "Performance"}
          </span>
          {csrdMapping && (
            <span className="text-xs text-gray-400">CSRD : {csrdMapping}</span>
          )}
        </div>
        </div>
      </fieldset>
    </div>
  );
}

function BooleanButton({
  label, selected, onClick, color,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      style={selected ? { borderColor: color, backgroundColor: color + "12", color } : {}}
      className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all
        ${selected ? "shadow-sm" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
    >
      {label}
    </button>
  );
}
