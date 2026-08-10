"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Factory, Briefcase, ShoppingBag, HardHat,
  Wheat, Cpu, Building2, Truck, Heart, GraduationCap,
  Landmark, Leaf,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MaterialityBadge, type MaterialityLevel } from "@/components/MaterialityBadge";
import { Loader2 } from "lucide-react";

const SECTORS = [
  { id: "manufacturing",  label: "Industrie & fabrication",      desc: "Production, assemblage, transformation industrielle", icon: Factory,       sectorGroup: "manufacturing" },
  { id: "services",       label: "Services professionnels",       desc: "Conseil, juridique, comptabilité, RH", icon: Briefcase,      sectorGroup: "services" },
  { id: "retail",         label: "Commerce & distribution",       desc: "Vente au détail, e-commerce, grande distribution", icon: ShoppingBag,    sectorGroup: "retail" },
  { id: "construction",   label: "Construction & BTP",            desc: "Bâtiment, génie civil, promotion immobilière", icon: HardHat,        sectorGroup: "construction" },
  { id: "agriculture",    label: "Agriculture & agroalimentaire", desc: "Culture, élevage, transformation alimentaire", icon: Wheat,          sectorGroup: "agriculture" },
  { id: "tech",           label: "Technologie & numérique",       desc: "Logiciels, SaaS, IA, télécoms", icon: Cpu,            sectorGroup: "tech" },
  { id: "logistics",      label: "Logistique & transport",        desc: "Fret, entreposage, mobilité", icon: Truck,          sectorGroup: "manufacturing" },
  { id: "healthcare",     label: "Santé & bien-être",             desc: "Médical, pharmaceutique, bien-être", icon: Heart,          sectorGroup: "services" },
  { id: "education",      label: "Formation & éducation",         desc: "Organismes de formation, e-learning, enseignement", icon: GraduationCap, sectorGroup: "services" },
  { id: "finance",        label: "Finance & assurance",           desc: "Banque, assurance, gestion d'actifs", icon: Landmark,       sectorGroup: "services" },
  { id: "realestate",     label: "Immobilier",                    desc: "Gestion locative, transactions, foncier", icon: Building2,      sectorGroup: "construction" },
  { id: "environment",    label: "Environnement & énergie",       desc: "ENR, efficacité énergétique, eau, déchets", icon: Leaf,           sectorGroup: "agriculture" },
] as const;

interface PreviewTheme {
  theme_id: string;
  label: string;
  pillar: string;
  weight: number;
  level: MaterialityLevel;
  esrs: string;
}

export default function IndustryPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [multiSector, setMultiSector] = useState(false);
  const [secondary, setSecondary] = useState<string>("");
  const [preview, setPreview] = useState<PreviewTheme[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load materiality preview when sector selected
  useEffect(() => {
    if (!selected) return;
    const sector = SECTORS.find(s => s.id === selected);
    if (!sector) return;

    setPreviewLoading(true);
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const companyId = session.user.id; // will be company_id after profile step
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/companies/preview/materiality-preview?sector=${sector.sectorGroup}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const data = await res.json();
        setPreview(data.top_themes ?? []);
      } finally {
        setPreviewLoading(false);
      }
    });
  }, [selected]);

  async function handleSubmit() {
    if (!selected) return;
    const sector = SECTORS.find(s => s.id === selected);
    if (!sector) return;

    setSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const { data: profile } = await supabase
      .from("users").select("company_id").eq("id", session.user.id).single();

    if (!profile?.company_id) { router.push("/onboarding/profile"); return; }

    const secondarySector = multiSector && secondary
      ? SECTORS.find(s => s.id === secondary)?.sectorGroup
      : null;

    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/companies/${profile.company_id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          industry_id: selected,
          sector_group: sector.sectorGroup,
          ...(secondarySector ? { secondary_sector_group: secondarySector } : {}),
        }),
      }
    );

    router.push("/onboarding/questionnaire");
  }

  return (
    <div className="min-h-screen bg-surface p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {["Profil", "Secteur", "Questionnaire"].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                ${i === 0 ? "bg-brand-mid text-white" : i === 1 ? "bg-brand-mid text-white" : "bg-gray-200 text-gray-500"}`}>
                {i < 1 ? "✓" : i + 1}
              </div>
              <span className={`text-sm ${i === 1 ? "text-brand-dark font-medium" : "text-gray-400"}`}>{step}</span>
              {i < 2 && <div className="w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-1">Votre secteur d'activité</h1>
        <p className="text-sm text-gray-500 mb-6">
          Le secteur détermine les pondérations ESG appliquées à votre score.
        </p>

        {/* 3×4 grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {SECTORS.map(sector => {
            const Icon = sector.icon;
            const isSelected = selected === sector.id;
            return (
              <button
                key={sector.id}
                onClick={() => setSelected(sector.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all
                  ${isSelected
                    ? "border-brand-mid bg-brand-light shadow-card"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-card"
                  }`}
              >
                <Icon className={`w-6 h-6 mb-2 ${isSelected ? "text-brand-mid" : "text-gray-400"}`} />
                <div className={`text-sm font-medium ${isSelected ? "text-brand-dark" : "text-gray-800"}`}>
                  {sector.label}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{sector.desc}</div>
              </button>
            );
          })}
        </div>

        {/* T-INDUSTRY-002: Multi-sector toggle */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setMultiSector(!multiSector)}
            className={`w-9 h-5 rounded-full transition-colors relative ${multiSector ? "bg-brand-mid" : "bg-gray-200"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
              ${multiSector ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
          <span className="text-sm text-gray-700">Mon entreprise opère dans plusieurs secteurs</span>
        </div>

        {multiSector && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Secteur secondaire
            </label>
            <select
              value={secondary}
              onChange={e => setSecondary(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-accent"
            >
              <option value="">Sélectionner</option>
              {SECTORS.filter(s => s.id !== selected).map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            {secondary && (
              <p className="text-xs text-gray-500 mt-1.5">
                Le niveau de matérialité le plus strict sera appliqué thème par thème.
              </p>
            )}
          </div>
        )}

        {/* T-INDUSTRY-001: Preview panel */}
        {selected && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 animate-fade-in-up">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Priorités ESG pour ce secteur
            </h2>
            {previewLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
              </div>
            ) : (
              <div className="space-y-2">
                {preview.map(theme => (
                  <div key={theme.theme_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{theme.label}</span>
                      <span className={`ml-2 text-xs text-${theme.pillar === "E" ? "green" : theme.pillar === "S" ? "blue" : "purple"}-600`}>
                        Pilier {theme.pillar}
                      </span>
                    </div>
                    <MaterialityBadge level={theme.level} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selected || submitting}
          className="bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-lg px-6 py-3 text-sm transition-colors disabled:opacity-40 flex items-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Continuer vers le questionnaire →
        </button>
      </div>
    </div>
  );
}
