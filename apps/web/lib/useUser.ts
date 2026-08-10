"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./supabase/client";

export type UserRole = "sme_owner" | "consultant" | "admin";
export type UserPlan = "starter" | "growth" | "professional" | "consultant";

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  plan: UserPlan;
  companyId: string | null;
  fullName: string | null;
  locale: "fr" | "en";
}

interface UseUserReturn {
  user: UserProfile | null;
  role: UserRole | null;
  plan: UserPlan | null;
  companyId: string | null;
  loading: boolean;
}

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function loadUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setUser(null);
          return;
        }

        const { data: profile } = await supabase
          .from("users")
          .select("id, email, role, plan, company_id, full_name, locale")
          .eq("id", session.user.id)
          .single();

        if (profile) {
          setUser({
            id: profile.id,
            email: profile.email,
            role: profile.role,
            plan: profile.plan,
            companyId: profile.company_id,
            fullName: profile.full_name,
            locale: profile.locale,
          });
        }
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setUser(null);
          setLoading(false);
        } else {
          loadUser();
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    role: user?.role ?? null,
    plan: user?.plan ?? null,
    companyId: user?.companyId ?? null,
    loading,
  };
}
