"use client";

import { useUser, type UserPlan } from "./useUser";

const PLAN_RANK: Record<UserPlan, number> = {
  starter:      0,
  growth:       1,
  professional: 2,
  consultant:   3,
};

/**
 * Returns true if the current user's plan meets or exceeds the required plan.
 *
 * Usage:
 *   const canAccess = useFeatureGate("growth");
 *   if (!canAccess) return <FeatureGateOverlay requiredPlan="growth" />;
 */
export function useFeatureGate(requiredPlan: UserPlan): boolean {
  const { plan, loading } = useUser();

  if (loading || !plan) return false;

  const userRank = PLAN_RANK[plan] ?? 0;
  const requiredRank = PLAN_RANK[requiredPlan] ?? 0;

  return userRank >= requiredRank;
}
