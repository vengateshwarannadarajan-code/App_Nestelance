"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Loader2, AlertTriangle, ExternalLink, Download } from "lucide-react";
import { PLAN_LABELS } from "@/lib/constants";

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

type Tab = "company" | "subscription" | "billing";

interface Invoice {
  id: string; date: number; amount: number; currency: string; status: string; pdf_url?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const successParam = searchParams.get("success");
  const tabParam = searchParams.get("tab") as Tab | null;

  const [tab, setTab] = useState<Tab>(
    tabParam === "subscription" || tabParam === "billing" ? tabParam : "company",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [token, setToken] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [userPlan, setUserPlan] = useState("starter");
  const [showSectorModal, setShowSectorModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelInfo, setCancelInfo] = useState<{ endDate: string } | null>(null);
  const [pendingSector, setPendingSector] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [form, setForm] = useState({ name: "", country: "FR", revenue_band: "", sector_group: "", eu_supply_chain_pct: "", scope12_emissions_t: "" });
  const [originalSector, setOriginalSector] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setToken(session.access_token);

      const { data: profile } = await supabase
        .from("users").select("company_id, plan").eq("id", session.user.id).single();
      if (!profile?.company_id) { setLoading(false); return; }
      setCompanyId(profile.company_id);
      setUserPlan(profile.plan ?? "starter");

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/${profile.company_id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } });
      const company = await res.json();
      setForm({
        name: company.name ?? "", country: company.country ?? "FR",
        revenue_band: company.revenue_band ?? "", sector_group: company.sector_group ?? "",
        eu_supply_chain_pct: company.eu_supply_chain_pct != null ? String(company.eu_supply_chain_pct) : "",
        scope12_emissions_t: company.scope12_emissions_t != null ? String(company.scope12_emissions_t) : "",
      });
      setOriginalSector(company.sector_group ?? "");

      // Invoices
      const invRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/invoices`,
        { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (invRes.ok) { const d = await invRes.json(); setInvoices(d.invoices ?? []); }

      setLoading(false);
      if (successParam) setTab("subscription");
    });
  }, []);

  function handleSectorChange(val: string) {
    if (val !== originalSector) { setPendingSector(val); setShowSectorModal(true); }
    else setForm(p => ({ ...p, sector_group: val }));
  }

  async function handleSave() {
    setSaving(true);
    const body: Record<string, any> = { name: form.name, country: form.country, revenue_band: form.revenue_band, sector_group: form.sector_group };
    if (form.eu_supply_chain_pct !== "") body.eu_supply_chain_pct = parseFloat(form.eu_supply_chain_pct);
    if (form.scope12_emissions_t !== "") body.scope12_emissions_t = parseFloat(form.scope12_emissions_t);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/companies/${companyId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    setSaving(false); setSaved(true); setOriginalSector(form.sector_group);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleCancel() {
    setCancelLoading(true);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/cancel`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const d = await res.json();
      const date = new Date(d.current_period_end * 1000).toLocaleDateString("fr-FR");
      setCancelInfo({ endDate: date });
    }
    setCancelLoading(false); setShowCancelModal(false);
  }

  async function handlePortal() {
    setPortalLoading(true);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/portal`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const d = await res.json(); window.location.href = d.portal_url; }
    setPortalLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-mid" /></div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "company", label: "Entreprise" },
    { id: "subscription", label: "Abonnement" },
    { id: "billing", label: "Facturation" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Paramètres</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
              ${tab === t.id ? "border-brand-mid text-brand-dark" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Company tab */}
      {tab === "company" && (
        <div className="bg-white rounded-xl shadow-card p-6 space-y-5">
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
          <Field label="Part CA clients EU (%)">
            <input type="number" min={0} max={100} value={form.eu_supply_chain_pct}
              onChange={e => setForm(p => ({ ...p, eu_supply_chain_pct: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 focus:border-brand-accent px-3.5 py-2.5 text-sm outline-none" />
          </Field>
          <Field label="Émissions Scope 1+2 (tCO₂e/an)">
            <input type="number" min={0} value={form.scope12_emissions_t}
              onChange={e => setForm(p => ({ ...p, scope12_emissions_t: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 focus:border-brand-accent px-3.5 py-2.5 text-sm outline-none" />
          </Field>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="bg-brand-mid hover:bg-brand-dark text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </button>
            {saved && <span className="text-sm text-brand-mid">✓ Enregistré</span>}
          </div>
        </div>
      )}

      {/* Subscription tab — T-BILLING-003 */}
      {tab === "subscription" && (
        <div className="space-y-4">
          {successParam && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-sm text-green-800 font-medium">
              ✓ Votre plan a été mis à jour. Bienvenue sur {PLAN_LABELS[userPlan as keyof typeof PLAN_LABELS]} !
            </div>
          )}
          {cancelInfo && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
              Votre accès {PLAN_LABELS[userPlan as keyof typeof PLAN_LABELS]} restera actif jusqu'au {cancelInfo.endDate}.
              Après cette date, vous passerez au plan Starter.
            </div>
          )}
          <div className="bg-white rounded-xl shadow-card p-6">
            <p className="text-xs text-gray-400 mb-1">Plan actuel</p>
            <p className="text-xl font-bold text-gray-900 mb-4 capitalize">
              {PLAN_LABELS[userPlan as keyof typeof PLAN_LABELS] ?? userPlan}
            </p>
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => router.push("/billing")}
                className="bg-brand-mid text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-brand-dark transition-colors">
                Changer de plan
              </button>
              {userPlan !== "starter" && (
                <button onClick={() => setShowCancelModal(true)}
                  className="border border-red-200 text-red-600 text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-red-50 transition-colors">
                  Annuler mon abonnement
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Billing tab — T-BILLING-004 */}
      {tab === "billing" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-card p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Moyen de paiement</p>
              <p className="text-xs text-gray-500 mt-0.5">Géré via Stripe Customer Portal</p>
            </div>
            <button onClick={handlePortal} disabled={portalLoading}
              className="flex items-center gap-2 border border-gray-200 text-gray-600 text-sm rounded-lg px-4 py-2.5 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Modifier
            </button>
          </div>

          {invoices.length > 0 && (
            <div className="bg-white rounded-xl shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Historique des factures</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Date", "Montant", "Statut", "Télécharger"].map(h => (
                      <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-600">{new Date(inv.date * 1000).toLocaleDateString("fr-FR")}</td>
                      <td className="px-5 py-3 font-medium">€{inv.amount.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        {inv.status === "paid"
                          ? <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">Payée</span>
                          : <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 w-fit">
                              Échec
                              <button onClick={handlePortal} className="underline">Mettre à jour</button>
                            </span>
                        }
                      </td>
                      <td className="px-5 py-3">
                        {inv.pdf_url && (
                          <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                            className="text-brand-accent hover:text-brand-dark flex items-center gap-1 text-xs">
                            <Download className="w-3.5 h-3.5" /> PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sector change modal */}
      {showSectorModal && (
        <Modal onClose={() => setShowSectorModal(false)}>
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <h3 className="text-base font-semibold text-gray-900">Changer de secteur</h3>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Changer de secteur modifiera vos pondérations ESG. Votre score sera recalculé lors de la prochaine évaluation.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowSectorModal(false)} className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50">Annuler</button>
            <button onClick={() => { setForm(p => ({ ...p, sector_group: pendingSector })); setShowSectorModal(false); }}
              className="flex-1 bg-brand-mid text-white rounded-lg py-2.5 text-sm hover:bg-brand-dark">Confirmer</button>
          </div>
        </Modal>
      )}

      {/* Cancel subscription modal — T-BILLING-003 */}
      {showCancelModal && (
        <Modal onClose={() => setShowCancelModal(false)}>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Annuler mon abonnement</h3>
          <p className="text-sm text-gray-600 mb-6">
            Votre accès <strong>{PLAN_LABELS[userPlan as keyof typeof PLAN_LABELS]}</strong> restera
            actif jusqu'à la fin de la période en cours. Après cette date, vous passerez au plan Starter.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowCancelModal(false)} className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50">Conserver mon plan</button>
            <button onClick={handleCancel} disabled={cancelLoading}
              className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50">
              {cancelLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer l'annulation
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>{children}</div>;
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg">×</button>
        {children}
      </div>
    </div>
  );
}
