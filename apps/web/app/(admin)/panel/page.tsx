"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2, Search, ShieldCheck, CheckCircle2, AlertTriangle, Play } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SCORE_COLORS, SCORE_LABELS, THEMES } from "@/lib/constants";

type Tab = "metrics" | "clients" | "ai";

const PLAN_COLORS: Record<string, string> = {
  starter: "#757575", growth: "#2E7D32", professional: "#1565C0", consultant: "#6A1B9A"
};
const PLAN_LABELS: Record<string, string> = {
  starter: "Starter", growth: "Croissance", professional: "Professionnel", consultant: "Consultant"
};

function getBand(s: number) { return Math.min(5, Math.max(0, Math.round(s))); }

export default function AdminPanelPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("metrics");
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [metrics, setMetrics] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [aiHealth, setAiHealth] = useState<any[]>([]);
  const [driftLog, setDriftLog] = useState<any[]>([]);
  const [checkModal, setCheckModal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tierModal, setTierModal] = useState<any>(null);
  const [newTier, setNewTier] = useState("");
  const [deleteModal, setDeleteModal] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setToken(session.access_token);
      const { data: profile } = await supabase.from("users").select("role").eq("id", session.user.id).single();
      if (profile?.role !== "admin") { router.push("/dashboard"); return; }
      await Promise.all([loadMetrics(session.access_token), loadClients(session.access_token), loadAiHealth(session.access_token)]);
      setLoading(false);
    });
  }, []);

  async function loadMetrics(tok: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/metrics`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) setMetrics(await res.json());
  }

  async function loadClients(tok: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/clients?limit=50`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) { const d = await res.json(); setClients(d.clients ?? []); }
  }

  async function loadAiHealth(tok: string) {
    const [health, log] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ai-health`, { headers: { Authorization: `Bearer ${tok}` } }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ai-health/log`, { headers: { Authorization: `Bearer ${tok}` } }),
    ]);
    if (health.ok) { const d = await health.json(); setAiHealth(d.themes ?? []); }
    if (log.ok) { const d = await log.json(); setDriftLog(d.events ?? []); }
  }

  async function runDriftCheck() {
    setChecking(true); setCheckModal(false);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ai-health/check`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    await loadAiHealth(token);
    setChecking(false);
  }

  async function updateTier() {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/clients/${tierModal.id}/tier`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: newTier }),
    });
    setClients(prev => prev.map(c => c.id === tierModal.id ? { ...c, plan: newTier } : c));
    setTierModal(null);
  }

  async function deleteClient() {
    if (deleteConfirm !== tierModal?.email) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/clients/${deleteModal.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setClients(prev => prev.filter(c => c.id !== deleteModal.id));
    setDeleteModal(null); setDeleteConfirm("");
  }

  const filteredClients = clients.filter(c =>
    (!search || c.email?.toLowerCase().includes(search.toLowerCase())) &&
    (!tierFilter || c.plan === tierFilter)
  );

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-mid" /></div>;

  const tierData = Object.entries(metrics?.tier_distribution ?? {}).map(([plan, count]) => ({
    name: PLAN_LABELS[plan] ?? plan, value: count as number, color: PLAN_COLORS[plan] ?? "#ccc"
  }));

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-brand-mid" />
        <h1 className="text-xl font-semibold text-gray-900">Administration</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {([["metrics","Métriques"],["clients","Clients"],["ai","Santé IA"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as Tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
              ${tab === id ? "border-brand-mid text-brand-dark" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* METRICS — T-ADMIN-001 */}
      {tab === "metrics" && metrics && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Entreprises", value: metrics.total_companies },
              { label: "MRR", value: `€${metrics.mrr.toLocaleString("fr-FR")}` },
              { label: "Score moyen", value: metrics.avg_score?.toFixed(2) },
              { label: "Rapports ce mois", value: metrics.reports_this_month },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl shadow-card p-5">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-card p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">Distribution des plans</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={tierData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {tierData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} clients`, ""]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-card p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">Nouvelles inscriptions (30 jours)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={metrics.daily_signups ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2E7D32" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* CLIENTS — T-ADMIN-002 */}
      {tab === "clients" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par email"
                className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-accent" />
            </div>
            <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none">
              <option value="">Tous les plans</option>
              {["starter","growth","professional","consultant"].map(p => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Email","Plan","Inscrit","Actions"].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-700">{c.email}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: PLAN_COLORS[c.plan] ?? "#ccc" }}>
                        {PLAN_LABELS[c.plan] ?? c.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{c.created_at?.slice(0,10)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => { setTierModal(c); setNewTier(c.plan); }}
                          className="text-xs text-brand-accent hover:underline">Modifier plan</button>
                        <button onClick={() => setDeleteModal(c)}
                          className="text-xs text-red-500 hover:underline">Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI HEALTH — T-ADMIN-004 */}
      {tab === "ai" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Vérification de dérive du modèle</p>
            <button onClick={() => setCheckModal(true)} disabled={checking}
              className="flex items-center gap-2 bg-brand-mid text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-brand-dark disabled:opacity-50">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Lancer une vérification
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Thème","Spearman r","Statut","Dernière vérification"].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aiHealth.map(row => (
                  <tr key={row.theme_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-700">
                      {THEMES.find(t => t.id === row.theme_id)?.label.fr ?? row.theme_id}
                    </td>
                    <td className="px-5 py-3 font-mono text-gray-600">{row.spearman_r?.toFixed(3)}</td>
                    <td className="px-5 py-3">
                      {row.status === "stable"
                        ? <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full w-fit">
                            <CheckCircle2 className="w-3 h-3" /> Stable
                          </span>
                        : <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full w-fit">
                            <AlertTriangle className="w-3 h-3" /> Dérive détectée
                          </span>
                      }
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {row.last_check ? new Date(row.last_check).toLocaleString("fr-FR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Journal des événements</p>
            {driftLog.length === 0
              ? <div className="bg-white rounded-xl shadow-card px-5 py-6 text-center text-sm text-gray-400">
                  Aucun événement de dérive détecté
                </div>
              : <div className="bg-white rounded-xl shadow-card overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {["Horodatage","Thème","r","Statut"].map(h => (
                          <th key={h} className="text-left px-5 py-2.5 text-gray-400 uppercase tracking-wider font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {driftLog.map((e, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-5 py-2.5 text-gray-400">{e.created_at?.slice(0,16)}</td>
                          <td className="px-5 py-2.5 text-gray-700">{THEMES.find(t => t.id === e.theme_id)?.label.fr ?? e.theme_id}</td>
                          <td className="px-5 py-2.5 font-mono">{e.spearman_r?.toFixed(3)}</td>
                          <td className="px-5 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.status === "stable" ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
                              {e.status === "stable" ? "Résolu" : "Dérive"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        </div>
      )}

      {/* Check modal */}
      {checkModal && (
        <Modal onClose={() => setCheckModal(false)}>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Lancer une vérification</h3>
          <p className="text-sm text-gray-600 mb-6">
            Lancer une vérification complète des 10 thèmes ? Cela peut prendre 2–3 minutes.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setCheckModal(false)} className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50">Annuler</button>
            <button onClick={runDriftCheck} className="flex-1 bg-brand-mid text-white rounded-lg py-2.5 text-sm hover:bg-brand-dark">Confirmer</button>
          </div>
        </Modal>
      )}

      {/* Tier modal */}
      {tierModal && (
        <Modal onClose={() => setTierModal(null)}>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Modifier le plan</h3>
          <select value={newTier} onChange={e => setNewTier(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5">
            {["starter","growth","professional","consultant"].map(p => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
          </select>
          <div className="flex gap-3">
            <button onClick={() => setTierModal(null)} className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm">Annuler</button>
            <button onClick={updateTier} className="flex-1 bg-brand-mid text-white rounded-lg py-2.5 text-sm">Confirmer</button>
          </div>
        </Modal>
      )}

      {/* Delete modal */}
      {deleteModal && (
        <Modal onClose={() => { setDeleteModal(null); setDeleteConfirm(""); }}>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Supprimer ce compte</h3>
          <p className="text-sm text-gray-600 mb-4">
            Tapez <strong>{deleteModal.email}</strong> pour confirmer la suppression définitive.
          </p>
          <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={deleteModal.email}
            className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5" />
          <div className="flex gap-3">
            <button onClick={() => { setDeleteModal(null); setDeleteConfirm(""); }} className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm">Annuler</button>
            <button onClick={deleteClient} disabled={deleteConfirm !== deleteModal.email}
              className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm disabled:opacity-40 hover:bg-red-700">Supprimer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl">×</button>
        {children}
      </div>
    </div>
  );
}
