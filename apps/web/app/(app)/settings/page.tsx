"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Loader2, AlertTriangle } from "lucide-react";

const REVENUE_BANDS = [
  { value: "<500k", label: "Moins de 500 000 €" },
  { value: "500k-1m", label: "500 000 € – 1 M€" },
  { value: "1m-10m", label: "1 M€ – 10 M€" },
  { value: "10m-50m", label: "10 M€ – 50 M€" },
  { value: ">50m", label: "Plus de 50 M€" },
];

const SECTOR_GROUPS = [
  { value: "manufacturing", label: "Industrie & fabrication" },
  { value: "services", label: "Services" },
  { value: "retail", label: "Commerce & distribution" },
  { value: "construction", label: "Construction & BTP" },
  { value: "agriculture", label: "Agriculture & agroalimentaire" },
  { value: "tech", label: "Technologie & numérique" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSectorModal, setShowSectorModal] = useState(false);
  const [pendingSector, setPendingSector] = useState<string>("");

  const [companyId, setCompanyId] = useState("");
  const [token, setToken] = useState("");
  const [form, setForm] = useState({
    name: "", country: "FR", revenue_band: "", sector_group: "",
    eu_supply_chain_pct: "", scope12_emissions_t: "",
  });
  const [originalSector, setOriginalSector] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setToken(session.access_token);

      const { data: profile } = await supabase
        .from("users").select("company_id").eq("id", session.user.id).single();
      if (!profile?.company_id) { setLoading(false); return; }
      setCompanyId(profile.company_id);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/companies/${profile.company_id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const company = await res.json();
      setForm({
        name: company.name ?? "",
        country: company.country ?? "FR",
        revenue_band: company.revenue_band ?? "",
        sector_group: company.sector_group ?? "",
        eu_supply_chain_pct: company.eu_supply_chain_pct != null ? String(company.eu_supply_chain_pct) : "",
        scope12_emissions_t: company.scope12_emissions_t != null ? String(company.scope12_emissions_t) : "",
      });
      setOriginalSector(company.sector_group ?? "");
      setLoading(false);
    });
  }, []);

  function handleSectorChange(val: string) {
    if (val !== originalSector) {
      setPendingSector(val);
      setShowSectorModal(true);
    } else {
      setForm(prev => ({ ...prev, sector_group: val }));
    }
  }

  function confirmSectorChange() {
    setForm(prev => ({ ...prev, sector_group: pendingSector }));
    setShowSectorModal(false);
  }

  async function handleSave() {
    setSaving(true);
    const body: Record<string, any> = {
      name: form.name,
      country: form.country,
      revenue_band: form.revenue_band,
      sector_group: form.sector_group,
    };
    if (form.eu_supply_chain_pct !== "") body.eu_supply_chain_pct = parseFloat(form.eu_supply_chain_pct);
    if (form.scope12_emissions_t !== "") body.scope12_emissions_t = parseFloat(form.scope12_emissions_t);

    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setSaved(true);
    setOriginalSector(form.sector_group);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-brand-mid" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Paramètres</h1>

      <div className="bg-white rounded-xl shadow-card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-5">Profil de l'entreprise</h2>

        <div className="space-y-5">
          <Field label="Nom de l'entreprise">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 focus:border-brand-accent px-3.5 py-2.5 text-sm outline-none" />
          </Field>

          <Field label="Secteur d'activité">
            <select value={form.sector_group} onChange={e => handleSectorChange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 focus:border-brand-accent px-3.5 py-2.5 text-sm outline-none">
              {SECTOR_GROUPS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          <Field label="Chiffre d'affaires annuel">
            <select value={form.revenue_band} onChange={e => setForm(p => ({ ...p, revenue_band: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 focus:border-brand-accent px-3.5 py-2.5 text-sm outline-none">
              {REVENUE_BANDS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>

          <Field label="Part CA liée à clients EU (%)">
            <input type="number" min={0} max={100} value={form.eu_supply_chain_pct}
              onChange={e => setForm(p => ({ ...p, eu_supply_chain_pct: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 focus:border-brand-accent px-3.5 py-2.5 text-sm outline-none" />
          </Field>

          <Field label="Émissions Scope 1+2 (tCO₂e/an)">
            <input type="number" min={0} value={form.scope12_emissions_t}
              onChange={e => setForm(p => ({ ...p, scope12_emissions_t: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 focus:border-brand-accent px-3.5 py-2.5 text-sm outline-none" />
          </Field>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer les modifications
          </button>
          {saved && <span className="text-sm text-brand-mid">✓ Enregistré</span>}
        </div>
      </div>

      {/* Sector change confirmation modal */}
      {showSectorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <h3 className="text-base font-semibold text-gray-900">Changer de secteur</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Changer de secteur recalculera vos pondérations ESG. Votre score sera mis à jour lors de votre prochain calcul.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowSectorModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button onClick={confirmSectorChange}
                className="flex-1 bg-brand-mid text-white rounded-lg py-2.5 text-sm hover:bg-brand-dark transition-colors">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
