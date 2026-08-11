"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Play, Leaf, TrendingUp, FileText, Calculator,
  Check, ChevronRight, Star,
} from "lucide-react";
import { ScoreRing } from "@/components/ScoreRing";
import { PRICING_PLANS } from "@/lib/constants";

const FEATURES = [
  { title: "Explicateur XAI", desc: "Comprendre exactement pourquoi votre score est ce qu'il est, en langage clair.", icon: TrendingUp, color: "#00897B" },
  { title: "Simulateur de Conformité", desc: "Projetez votre score dans 6, 12 ou 24 mois selon vos actions.", icon: Calculator, color: "#1565C0" },
  { title: "Calculateur d'Impact Financier", desc: "Quantifiez votre risque ESG en euros — amendes, contrats, carbone.", icon: FileText, color: "#6A1B9A" },
  { title: "Génération de Rapports", desc: "Rapport CSRD, GRI ou BRSR en 20 minutes. PDF + Word téléchargeables.", icon: Leaf, color: "#2E7D32" },
];

const TRUST_BAR = [
  "333 millions de PMEs. Zéro outil abordable. Jusqu'à maintenant.",
  "Basé sur ESRS & CSRD 2026",
  "IA explicable — aucun score boîte noire",
];

function HeroScoreDemo() {
  const [phase, setPhase] = useState<"before" | "after">("before");

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("after"), 1200),
      setTimeout(() => setPhase("before"), 4000),
      setTimeout(() => setPhase("after"), 5200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const scores = phase === "after"
    ? { overall: 3.8, e: 3.5, s: 4.0, g: 3.9 }
    : { overall: 2.4, e: 2.1, s: 2.8, g: 2.3 };

  return (
    <div className="relative flex flex-col items-center">
      <div
        className="flex flex-col items-center gap-5 rounded-3xl p-10 min-w-[320px] shadow-2xl"
        style={{ background: "linear-gradient(135deg, #1B2A1B 0%, #0D1F0D 100%)" }}
      >
        <div className="text-xs uppercase tracking-widest text-white/50">Boulangerie Martin &amp; Fils</div>
        <ScoreRing score={scores.overall} size="large" locale="fr" />
        <div
          className="text-sm font-semibold transition-colors duration-700"
          style={{ color: phase === "after" ? "#7CB342" : "#FB8C00" }}
        >
          {phase === "after" ? "Établi — après 3 mois" : "En développement — avant"}
        </div>
        <div className="flex gap-4">
          {[{ label: "E", score: scores.e }, { label: "S", score: scores.s }, { label: "G", score: scores.g }].map(p => (
            <div key={p.label} className="text-center">
              <ScoreRing score={p.score} size="small" showLabel={false} locale="fr" />
              <div className="text-[10px] text-white/50 mt-1">{p.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -top-3 -right-3 bg-brand-mid text-white rounded-full px-3 py-1 text-[11px] font-bold">
        +1.4 points
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white border-b border-border h-16 flex items-center justify-between px-6 md:px-8">
        <div className="flex items-center gap-2">
          <Leaf size={22} className="text-brand-mid" />
          <span className="text-lg font-extrabold text-brand-dark tracking-tight">Nest Élance</span>
        </div>
        <div className="flex items-center gap-1 md:gap-3">
          <a href="#features" className="text-sm text-gray-800 px-3 py-2 hover:text-brand-mid transition-colors">Fonctionnalités</a>
          <a href="#pricing" className="text-sm text-gray-800 px-3 py-2 hover:text-brand-mid transition-colors">Tarifs</a>
          <Link href="/login" className="text-sm text-gray-800 px-3 py-2 hover:text-brand-mid transition-colors">Connexion</Link>
          <Link
            href="/signup"
            className="bg-brand-mid text-white rounded-lg px-4 md:px-5 py-2 text-sm font-semibold hover:bg-brand-dark transition-colors"
          >
            Commencer gratuitement
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center px-6 md:px-8 pt-16 md:pt-20 pb-16">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-brand-light text-brand-mid rounded-full px-3 py-1 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-mid" />
            CSRD obligatoire pour les PMEs en 2026
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-brand-dark tracking-tight mb-5">
            Votre score ESG<br />
            <span className="text-brand-accent">en 5 minutes.</span>
          </h1>
          <p className="text-lg leading-relaxed text-gray-600 mb-8 max-w-md">
            Sans consultant. Sans contrat annuel. Sans expertise ESG. Nest Élance calcule, explique et améliore votre score ESG.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/signup"
              className="bg-brand-mid text-white rounded-xl px-7 py-3.5 text-base font-bold flex items-center gap-2 shadow-lg hover:bg-brand-dark transition-colors"
            >
              Commencer gratuitement <ArrowRight size={18} />
            </Link>
            <button className="border-2 border-brand-mid text-brand-mid rounded-xl px-6 py-3 text-[15px] font-semibold flex items-center gap-2 hover:bg-brand-light transition-colors">
              <Play size={15} /> Voir une démo
            </button>
          </div>
          <div className="flex gap-6 mt-8 flex-wrap">
            {["333M de PMEs", "Zéro contrat annuel", "CSRD conforme"].map(txt => (
              <div key={txt} className="flex items-center gap-1.5 text-[13px] text-gray-600">
                <Check size={14} className="text-brand-mid" /> {txt}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center">
          <HeroScoreDemo />
        </div>
      </section>

      {/* Trust bar */}
      <div className="bg-brand-dark py-5 px-6 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-12 flex-wrap">
          {TRUST_BAR.map(txt => (
            <div key={txt} className="text-[13px] text-white/85 font-medium flex items-center gap-2">
              <Star size={12} className="fill-white/50 text-white/50" />
              {txt}
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto my-20 px-6 md:px-8 scroll-mt-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-brand-dark tracking-tight mb-3">
            Tout ce dont vous avez besoin
          </h2>
          <p className="text-base text-gray-600 max-w-xl mx-auto">
            Quatre outils que les grandes entreprises paient €50,000 à des cabinets de conseil. Pour vous, à partir de €49/mois.
          </p>
        </div>
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="bg-card rounded-2xl p-7 border border-border shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ backgroundColor: `${f.color}18` }}
              >
                <f.icon size={22} color={f.color} />
              </div>
              <div className="text-base font-bold text-gray-900 mb-2">{f.title}</div>
              <div className="text-sm text-gray-600 leading-relaxed">{f.desc}</div>
              <div className="mt-4 text-[13px] font-semibold flex items-center gap-1" style={{ color: f.color }}>
                En savoir plus <ChevronRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-[#F0F4F0] py-20 px-6 md:px-8 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-brand-dark tracking-tight mb-3">
              Simple. Transparent. Sans engagement annuel.
            </h2>
            <p className="text-base text-gray-600">Commencez petit. Passez au niveau supérieur quand vous êtes prêt.</p>
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {PRICING_PLANS.map(plan => (
              <div
                key={plan.id}
                className={`bg-card rounded-2xl p-7 relative ${
                  plan.popular ? "shadow-xl" : "shadow-card border border-border"
                }`}
                style={plan.popular ? { border: "2px solid #2E7D32" } : undefined}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-mid text-white rounded-full px-3.5 py-1 text-[11px] font-bold whitespace-nowrap">
                    Populaire
                  </div>
                )}
                <div className="text-base font-bold text-gray-900 mb-2">{plan.label}</div>
                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-3xl font-extrabold text-brand-dark">€{plan.price}</span>
                  <span className="text-sm text-gray-400">/mois</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.slice(0, 4).map(feat => (
                    <li key={feat} className="flex items-start gap-2 text-[13px] text-gray-700">
                      <Check size={14} className="text-brand-mid shrink-0 mt-0.5" /> {feat}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/signup?plan=${plan.id}`}
                  className={`block w-full text-center rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    plan.popular
                      ? "bg-brand-mid text-white hover:bg-brand-dark"
                      : "border-2 border-brand-mid text-brand-mid hover:bg-brand-light"
                  }`}
                >
                  {plan.id === "consultant" ? "Contacter" : "Commencer"}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            Voir le détail complet des fonctionnalités sur la <Link href="/pricing" className="text-brand-mid font-semibold hover:underline">page tarifs</Link>.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-dark text-white/70 py-8 px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Leaf size={18} className="text-white" />
          <span className="text-base font-bold text-white">Nest Élance</span>
        </div>
        <div className="flex gap-6 justify-center text-[13px] flex-wrap mb-4">
          {["Politique de confidentialité", "CGU", "Mentions légales", "Contact"].map(link => (
            <a key={link} href="#" className="text-white/60 hover:text-white transition-colors">{link}</a>
          ))}
        </div>
        <div className="text-xs text-white/40">© 2026 Nest Élance. Tous droits réservés.</div>
      </footer>
    </div>
  );
}
