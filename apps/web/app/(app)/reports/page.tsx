"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, RefreshCw, FileText } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { FeatureGateOverlay } from "@/components/FeatureGateOverlay";

const FRAMEWORKS = [
  { id: "CSRD", label: "CSRD", desc: "Directive européenne — obligatoire pour PMEs EU dès 2026" },
  { id: "GRI", label: "GRI", desc: "Global Reporting Initiative — référence internationale volontaire" },
  { id: "BRSR", label: "BRSR", desc: "Business Responsibility & Sustainability — marché indien" },
] as const;

const PROGRESS_STAGES = [
  { label: "Récupération des données", pct: 20 },
  { label: "Construction du rapport",  pct: 50 },
  { label: "Génération du PDF",        pct: 80 },
  { label: "Rapport prêt",            pct: 100 },
];

type Framework = typeof FRAMEWORKS[number]["id"];
type Locale = "fr" | "en";
type Scope = "full" | "executive";

interface Report {
  id: string;
  created_at: string;
  framework: string;
  locale: string;
  status: "pending" | "generating" | "ready" | "failed";
  file_url?: string;
}

export default function ReportsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [latestSnapshotId, setLatestSnapshotId] = useState("");

  const [framework, setFramework] = useState<Framework>("CSRD");
  const [locale, setLocale] = useState<Locale>("fr");
  const [scope, setScope] = useState<Scope>("full");

  const [generating, setGenerating] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [generatedUrl, setGeneratedUrl] = useState("");

  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setToken(session.access_token);

      const { data: profile } = await supabase
        .from("users").select("company_id").eq("id", session.user.id).single();
      if (!profile?.company_id) { router.push("/onboarding/profile"); return; }
      setCompanyId(profile.company_id);

      // Get latest snapshot
      const snapRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/scoring/snapshots/${profile.company_id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const snapData = await snapRes.json();
      setLatestSnapshotId(snapData.snapshots?.[0]?.id ?? "");

      await loadReports(profile.company_id, session.access_token);
      setLoading(false);
    });
  }, []);

  async function loadReports(cid: string, tok: string) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/reports/${cid}`,
      { headers: { Authorization: `Bearer ${tok}` } }
    );
    if (res.ok) {
      const data = await res.json();
      setReports(data.reports ?? []);
    }
  }

  async function handleGenerate() {
    if (!latestSnapshotId) return;
    setGenerating(true);
    setProgressStage(0);
    setGeneratedUrl("");

    // Animated stages
    const stageTimers = [
      setTimeout(() => setProgressStage(1), 800),
      setTimeout(() => setProgressStage(2), 2000),
      setTimeout(() => setProgressStage(3), 3500),
    ];

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          company_id: companyId,
          snapshot_id: latestSnapshotId,
          framework,
          language: locale,
          scope,
        }),
      });
      const data = await res.json();
      if (data.pdf_url) {
        setProgressStage(3);
        setGeneratedUrl(data.pdf_url);
        await loadReports(companyId, token);
      }
    } finally {
      stageTimers.forEach(clearTimeout);
      setGenerating(false);
    }
  }

  async function handleRetry(reportId: string) {
    // Re-trigger generation for failed report
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/reports/download/${reportId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) await loadReports(companyId, token);
  }

  const currentProgress = PROGRESS_STAGES[progressStage];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand-mid" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Générer un rapport</h1>
        <p className="text-sm text-gray-500 mt-1">CSRD, GRI, BRSR — en PDF, en moins de 90 secondes.</p>
      </div>

      <FeatureGateOverlay featureName="Générateur de rapports" requiredPlan="professional">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left — settings */}
          <div className="space-y-5">
            {/* Framework */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Cadre de référence</p>
              <div className="space-y-2">
                {FRAMEWORKS.map(fw => (
                  <label
                    key={fw.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                      ${framework === fw.id ? "border-brand-mid bg-brand-light" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <input
                      type="radio"
                      name="framework"
                      value={fw.id}
                      checked={framework === fw.id}
                      onChange={() => setFramework(fw.id)}
                      className="mt-0.5 accent-brand-mid"
                    />
                    <div>
                      <p className={`text-sm font-semibold ${framework === fw.id ? "text-brand-dark" : "text-gray-800"}`}>
                        {fw.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{fw.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Language + Scope */}
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700 mb-2">Langue</p>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(["fr", "en"] as Locale[]).map(l => (
                    <button
                      key={l}
                      onClick={() => setLocale(l)}
                      className={`flex-1 py-2 text-sm font-medium transition-colors
                        ${locale === l ? "bg-brand-mid text-white" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      {l === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700 mb-2">Étendue</p>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(["full", "executive"] as Scope[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setScope(s)}
                      className={`flex-1 py-2 text-xs font-medium transition-colors
                        ${scope === s ? "bg-brand-mid text-white" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      {s === "full" ? "Complet" : "Exécutif"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !latestSnapshotId}
              className="w-full bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-xl py-3 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {generating ? "Génération en cours..." : "Générer mon rapport"}
            </button>
          </div>

          {/* Right — preview / progress */}
          <div className="bg-white rounded-xl shadow-card p-6 flex flex-col items-center justify-center min-h-64">
            {generating ? (
              <div className="w-full max-w-xs">
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                  <div
                    className="bg-brand-mid h-2 rounded-full transition-all duration-700"
                    style={{ width: `${currentProgress.pct}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 text-center">{currentProgress.label}</p>
                <p className="text-xs text-gray-400 text-center mt-1">{currentProgress.pct}%</p>
              </div>
            ) : generatedUrl ? (
              <div className="text-center">
                <div className="w-12 h-12 bg-brand-light rounded-full flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-6 h-6 text-brand-mid" />
                </div>
                <p className="text-sm font-semibold text-gray-800 mb-1">Rapport prêt</p>
                <p className="text-xs text-gray-500 mb-4">{framework} · {locale.toUpperCase()} · {scope === "full" ? "Complet" : "Exécutif"}</p>
                <a
                  href={generatedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-brand-mid text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-brand-dark transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Télécharger le PDF
                </a>
              </div>
            ) : (
              <div className="text-center text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Sélectionnez vos options et générez votre rapport</p>
              </div>
            )}
          </div>
        </div>

        {/* T-REPORT-006: History table */}
        {reports.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Historique des rapports</h2>
            <div className="bg-white rounded-xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cadre</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Langue</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Télécharger</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-600">
                        {new Date(r.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-800">{r.framework}</td>
                      <td className="px-5 py-3 text-gray-500 uppercase">{r.locale}</td>
                      <td className="px-5 py-3">
                        {r.status === "ready" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                            ✓ Généré
                          </span>
                        )}
                        {r.status === "failed" && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                              ✗ Échec
                            </span>
                            <button
                              onClick={() => handleRetry(r.id)}
                              className="text-xs text-brand-accent hover:underline flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" /> Réessayer
                            </button>
                          </div>
                        )}
                        {(r.status === "pending" || r.status === "generating") && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin" /> En cours
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {r.status === "ready" && r.file_url && (
                          <a
                            href={r.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-brand-accent hover:text-brand-dark transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </FeatureGateOverlay>
    </div>
  );
}
