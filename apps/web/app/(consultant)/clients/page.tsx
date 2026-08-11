"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Grid, Key, Loader2, Copy, Check, RefreshCw, Trash2, FileText, Plus } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ScoreRing } from "@/components/ScoreRing";
import { SCORE_COLORS, SCORE_LABELS, THEMES } from "@/lib/constants";

function getBand(s: number) { return Math.min(5, Math.max(0, Math.round(s))); }
function formatDate(d: string) { return new Date(d).toLocaleDateString("fr-FR"); }

type Tab = "table" | "heatmap" | "api";
type Client = {
  company_id: string; name: string; sector_group: string;
  overall_score: number | null; weakest_theme: string | null;
  last_updated: string | null; has_assessment: boolean;
};

// Score band cell colour for heatmap (with alpha)
const HEATMAP_COLOR = (score: number | null) => {
  if (score === null) return "#F5F5F5";
  return SCORE_COLORS[getBand(score)] + "33"; // 20% opacity
};

const HEATMAP_BORDER = (score: number | null) => {
  if (score === null) return "#E0E0E0";
  return SCORE_COLORS[getBand(score)];
};

export default function ConsultantClientsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("table");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkFramework, setBulkFramework] = useState("CSRD");
  const [bulkLocale, setBulkLocale] = useState("fr");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDone, setBulkDone] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Client | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [apiKey, setApiKey] = useState<any>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotateModal, setRotateModal] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  const [heatmapTooltip, setHeatmapTooltip] = useState<{ client: string; theme: string; score: number | null } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setToken(session.access_token);

      const { data: profile } = await supabase
        .from("users").select("role").eq("id", session.user.id).single();
      if (profile?.role !== "consultant") { router.push("/dashboard"); return; }

      await loadClients(session.access_token);
      await loadApiKey(session.access_token);
      setLoading(false);
    });
  }, []);

  async function loadClients(tok: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultant/clients`,
      { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) { const d = await res.json(); setClients(d.clients ?? []); }
  }

  async function loadApiKey(tok: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultant/api-keys`,
      { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) setApiKey(await res.json());
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoveLoading(true);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultant/clients/${removeTarget.company_id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setClients(prev => prev.filter(c => c.company_id !== removeTarget.company_id));
    setRemoveTarget(null);
    setRemoveLoading(false);
  }

  async function handleBulkReports() {
    setBulkLoading(true);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultant/bulk-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ client_ids: Array.from(selected), framework: bulkFramework, language: bulkLocale }),
    });
    const d = await res.json();
    setBulkDone(`${d.client_count} rapport(s) en génération`);
    setBulkLoading(false);
    setBulkModal(false);
  }

  async function handleRotateKey() {
    setRotateLoading(true);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultant/api-keys/rotate`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const d = await res.json(); setNewKey(d.new_key); await loadApiKey(token); }
    setRotateLoading(false); setRotateModal(false);
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleSelect(cid: string) {
    setSelected(prev => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-mid" /></div>;

  const TABS = [
    { id: "table" as Tab, label: "Tableau", icon: Users },
    { id: "heatmap" as Tab, label: "Heatmap", icon: Grid },
    { id: "api" as Tab, label: "Clés API", icon: Key },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Mes clients ({clients.length})</h1>
        <button className="flex items-center gap-2 bg-brand-mid text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-brand-dark transition-colors">
          <Plus className="w-4 h-4" /> Ajouter un client
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && tab === "table" && (
        <div className="bg-brand-light border border-brand-mid rounded-xl px-5 py-3 flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-brand-dark">{selected.size} client(s) sélectionné(s)</span>
          <button onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 bg-brand-mid text-white text-xs font-medium rounded-lg px-3 py-2 hover:bg-brand-dark">
            <FileText className="w-3.5 h-3.5" /> Générer les rapports
          </button>
        </div>
      )}

      {bulkDone && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-sm text-green-800 font-medium mb-4">
          ✓ {bulkDone}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
                ${tab === t.id ? "border-brand-mid text-brand-dark" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TABLE tab */}
      {tab === "table" && (
        <div className="bg-white rounded-xl shadow-card overflow-hidden">
          {clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Aucun client enregistré</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 w-8"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(clients.map(c => c.company_id)) : new Set())} /></th>
                  {["Entreprise", "Secteur", "Score", "Bande", "Thème faible", "Mise à jour", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map(c => {
                  const band = c.overall_score !== null ? getBand(c.overall_score) : null;
                  return (
                    <tr key={c.company_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(c.company_id)} onChange={() => toggleSelect(c.company_id)} />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{c.sector_group}</td>
                      <td className="px-4 py-3">
                        {c.overall_score !== null
                          ? <div className="flex items-center gap-2">
                              <ScoreRing score={c.overall_score} size="micro" animated={false} showLabel={false} />
                              <span className="font-medium" style={{ color: band !== null ? SCORE_COLORS[band] : undefined }}>
                                {c.overall_score.toFixed(1)}
                              </span>
                            </div>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {band !== null
                          ? <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: SCORE_COLORS[band] }}>
                              {SCORE_LABELS[band]?.fr}
                            </span>
                          : <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Non évalué</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.weakest_theme
                          ? THEMES.find(t => t.id === c.weakest_theme)?.label.fr ?? c.weakest_theme
                          : "—"
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {c.last_updated ? formatDate(c.last_updated) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => router.push(`/dashboard?company=${c.company_id}`)}
                            className="text-xs text-brand-accent hover:underline">Voir</button>
                          <button onClick={() => setRemoveTarget(c)}
                            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Retirer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* HEATMAP tab — T-CONS-003 */}
      {tab === "heatmap" && (
        <div className="bg-white rounded-xl shadow-card overflow-auto">
          {clients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Aucun client à afficher</p>
          ) : (
            <div className="p-5">
              <div className="overflow-x-auto">
                <table className="text-xs" style={{ borderCollapse: "separate", borderSpacing: "2px" }}>
                  <thead>
                    <tr>
                      <th className="text-left pr-4 py-1 text-gray-500 font-medium min-w-[140px]">Client</th>
                      {THEMES.map(theme => (
                        <th key={theme.id} className="text-center px-1 py-1 text-gray-500 font-medium w-12 max-w-[48px]">
                          <div className="writing-mode-vertical text-[10px] whitespace-nowrap overflow-hidden" style={{ writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)", maxHeight: 70 }}>
                            {theme.label.fr.slice(0, 12)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(client => (
                      <tr key={client.company_id}>
                        <td className="pr-4 py-1 font-medium text-gray-700 whitespace-nowrap">{client.name}</td>
                        {THEMES.map(theme => {
                          // Use overall_score as proxy in v1 (real per-theme scores from snapshot in v2)
                          const score = client.has_assessment ? (client.overall_score ?? null) : null;
                          const band = score !== null ? getBand(score) : null;
                          return (
                            <td key={theme.id}
                              className="text-center p-0 cursor-default"
                              onMouseEnter={() => setHeatmapTooltip({ client: client.name, theme: theme.label.fr, score })}
                              onMouseLeave={() => setHeatmapTooltip(null)}
                            >
                              <div
                                className="w-10 h-8 rounded flex items-center justify-center text-[10px] font-bold mx-auto transition-all hover:scale-110"
                                style={{
                                  backgroundColor: HEATMAP_COLOR(score),
                                  border: `1.5px solid ${HEATMAP_BORDER(score)}`,
                                  color: score !== null ? SCORE_COLORS[getBand(score)] : "#BDBDBD",
                                }}
                              >
                                {score !== null ? score.toFixed(1) : "—"}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {heatmapTooltip && (
                <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-xs rounded-lg px-4 py-2.5 shadow-modal z-50 pointer-events-none">
                  <strong>{heatmapTooltip.client}</strong> · {heatmapTooltip.theme}<br />
                  Score : {heatmapTooltip.score !== null ? heatmapTooltip.score.toFixed(1) : "Non évalué"}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* API KEYS tab — T-CONS-006 */}
      {tab === "api" && (
        <div className="max-w-lg space-y-4">
          <div className="bg-white rounded-xl shadow-card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Clé API</h2>
            {newKey ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-xs text-amber-800 font-medium mb-2">
                  ⚠️ Copiez cette clé maintenant — elle ne sera plus visible.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 font-mono break-all">{newKey}</code>
                  <button onClick={() => copyKey(newKey)}
                    className="shrink-0 p-2 rounded-lg bg-amber-100 hover:bg-amber-200 transition-colors">
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-amber-700" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-4">
                <code className="flex-1 text-sm font-mono text-gray-600 bg-gray-100 rounded-lg px-4 py-2.5">
                  {apiKey?.masked ?? "ne_live_••••••••••••••••••••••••"}
                </code>
                <button onClick={() => copyKey(apiKey?.masked ?? "")}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors" title="Copier">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            )}
            {apiKey?.last_used_at && (
              <p className="text-xs text-gray-400 mb-4">Dernière utilisation : {formatDate(apiKey.last_used_at)}</p>
            )}
            <button onClick={() => setRotateModal(true)}
              className="flex items-center gap-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-red-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Rotation de la clé
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-card p-5">
            <p className="text-xs font-semibold text-gray-600 mb-2">Documentation API</p>
            <p className="text-xs text-gray-500">Passez votre clé en header HTTP :</p>
            <code className="block mt-2 text-xs bg-gray-100 rounded-lg px-4 py-2.5 text-gray-700">
              Authorization: Bearer ne_live_...
            </code>
          </div>
        </div>
      )}

      {/* Remove modal — T-CONS-008 */}
      {removeTarget && (
        <Modal onClose={() => setRemoveTarget(null)}>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Retirer ce client</h3>
          <p className="text-sm text-gray-600 mb-6">
            Retirer <strong>{removeTarget.name}</strong> de votre portefeuille ?
            Leurs données ne seront pas supprimées.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setRemoveTarget(null)}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50">Annuler</button>
            <button onClick={handleRemove} disabled={removeLoading}
              className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50">
              {removeLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Retirer
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk report modal — T-CONS-004 */}
      {bulkModal && (
        <Modal onClose={() => setBulkModal(false)}>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Générer {selected.size} rapport(s)</h3>
          <div className="space-y-4 mb-5">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Cadre</p>
              <div className="flex gap-2">
                {["CSRD", "GRI", "BRSR"].map(f => (
                  <button key={f} onClick={() => setBulkFramework(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                      ${bulkFramework === f ? "bg-brand-mid text-white border-brand-mid" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Langue</p>
              <div className="flex gap-2">
                {[["fr", "🇫🇷 Français"], ["en", "🇬🇧 English"]].map(([val, label]) => (
                  <button key={val} onClick={() => setBulkLocale(val)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                      ${bulkLocale === val ? "bg-brand-mid text-white border-brand-mid" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setBulkModal(false)}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50">Annuler</button>
            <button onClick={handleBulkReports} disabled={bulkLoading}
              className="flex-1 bg-brand-mid text-white rounded-lg py-2.5 text-sm hover:bg-brand-dark flex items-center justify-center gap-2 disabled:opacity-50">
              {bulkLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer
            </button>
          </div>
        </Modal>
      )}

      {/* Key rotation modal */}
      {rotateModal && (
        <Modal onClose={() => setRotateModal(false)}>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Rotation de la clé API</h3>
          <p className="text-sm text-gray-600 mb-6">
            Votre ancienne clé sera <strong>immédiatement invalidée</strong>.
            Tous les systèmes utilisant l'ancienne clé devront être mis à jour.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setRotateModal(false)}
              className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50">Annuler</button>
            <button onClick={handleRotateKey} disabled={rotateLoading}
              className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50">
              {rotateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer la rotation
            </button>
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
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        {children}
      </div>
    </div>
  );
}
