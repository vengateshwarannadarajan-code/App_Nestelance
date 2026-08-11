"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TimelineSimulator } from "@/components/TimelineSimulator";
import { FeatureGateOverlay } from "@/components/FeatureGateOverlay";
import { Loader2 } from "lucide-react";

export default function SimulatorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [sectorGroup, setSectorGroup] = useState("services");
  const [currentScore, setCurrentScore] = useState(0);
  const [baseResponses, setBaseResponses] = useState<Record<string, any>>({});

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
        .from("companies").select("sector_group").eq("id", profile.company_id).single();
      if (company?.sector_group) setSectorGroup(company.sector_group);

      // Fetch latest snapshot for current score
      const snapRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/scoring/snapshots/${profile.company_id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const snapData = await snapRes.json();
      const latestSnap = snapData.snapshots?.[0];
      if (latestSnap) setCurrentScore(latestSnap.overall_score ?? 0);

      // Fetch existing questionnaire responses
      const respRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/questionnaire/responses/${profile.company_id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const respData = await respRes.json();
      setBaseResponses(respData.responses ?? {});

      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand-mid" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Simulateur de conformité</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sélectionnez des actions et voyez comment votre score évoluerait dans le temps.
        </p>
      </div>

      <div className="flex-1">
        <FeatureGateOverlay
          featureName="Simulateur de conformité"
          requiredPlan="growth"
        >
          <TimelineSimulator
            baseResponses={baseResponses}
            sectorGroup={sectorGroup}
            currentScore={currentScore}
            token={token}
          />
        </FeatureGateOverlay>
      </div>
    </div>
  );
}
