"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useFeatureGate } from "@/lib/useFeatureGate";
import type { UserPlan } from "@/lib/useUser";

const PLAN_PRICES: Record<UserPlan, string> = {
  starter:      "49 €/mois",
  growth:       "149 €/mois",
  professional: "299 €/mois",
  consultant:   "499 €/mois",
};

const PLAN_LABELS: Record<UserPlan, string> = {
  starter:      "Starter",
  growth:       "Croissance",
  professional: "Professionnel",
  consultant:   "Consultant",
};

interface FeatureGateOverlayProps {
  featureName: string;
  requiredPlan: UserPlan;
  children: React.ReactNode;
}

export function FeatureGateOverlay({
  featureName, requiredPlan, children,
}: FeatureGateOverlayProps) {
  const canAccess = useFeatureGate(requiredPlan);

  if (canAccess) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred children */}
      <div
        style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none" }}
        aria-hidden
      >
        {children}
      </div>

      {/* Gate overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="bg-white rounded-xl text-center px-6 py-5 max-w-xs w-full mx-4"
          style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.14)" }}
          role="region"
          aria-label={`Fonctionnalité verrouillée : ${featureName}`}
        >
          <div className="w-10 h-10 bg-brand-light rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-brand-mid" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">{featureName}</p>
          <p className="text-xs text-gray-500 mb-1">
            Disponible avec le plan{" "}
            <span className="font-medium text-brand-dark">{PLAN_LABELS[requiredPlan]}</span>
          </p>
          <p className="text-xs text-gray-400 mb-4">à partir de {PLAN_PRICES[requiredPlan]}</p>
          <Link
            href={`/settings/billing?upgrade=${requiredPlan}`}
            className="block w-full bg-brand-mid hover:bg-brand-dark text-white text-xs font-medium rounded-lg py-2.5 transition-colors text-center"
          >
            Passer au plan {PLAN_LABELS[requiredPlan]}
          </Link>
        </div>
      </div>
    </div>
  );
}
