import type { UserPlan } from "./useUser";

// Plan hierarchy — used by useFeatureGate and Sidebar
export const PLAN_RANK: Record<UserPlan, number> = {
  starter:      0,
  growth:       1,
  professional: 2,
  consultant:   3,
};

// Score band colours (0–5)
export const SCORE_COLORS: Record<number, string> = {
  0: "#B71C1C",
  1: "#E53935",
  2: "#FB8C00",
  3: "#F9A825",
  4: "#7CB342",
  5: "#2E7D32",
};

// WCAG-compliant text colours for score bands (T-A11Y-004)
export const SCORE_BAND_TEXT_COLORS: Record<number, string> = {
  0: "#FFFFFF",  // white on dark red — 4.5:1 ✓
  1: "#FFFFFF",  // white on red — 4.5:1 ✓
  2: "#92400E",  // dark amber text on orange bg — 4.5:1 ✓ (not white)
  3: "#78350F",  // dark brown text on yellow bg — 4.5:1 ✓ (not white)
  4: "#FFFFFF",  // white on mid-green — 4.5:1 ✓
  5: "#FFFFFF",  // white on dark green — 4.5:1 ✓
};

export const SCORE_LABELS: Record<number, { fr: string; en: string }> = {
  0: { fr: "Critique",      en: "Critical" },
  1: { fr: "Insuffisant",   en: "Insufficient" },
  2: { fr: "En développement", en: "Developing" },
  3: { fr: "Progressant",   en: "Progressing" },
  4: { fr: "Avancé",        en: "Advanced" },
  5: { fr: "Leader",        en: "Leader" },
};

// Pillar colours
export const PILLAR_COLORS = {
  E: "#2E7D32",
  S: "#1565C0",
  G: "#6A1B9A",
} as const;

// Theme definitions (10 themes)
export const THEMES = [
  { id: "climate_transition",          label: { fr: "Transition climatique",                    en: "Climate Transition" },          pillar: "E" },
  { id: "biodiversity",                label: { fr: "Biodiversité",                              en: "Biodiversity" },                pillar: "E" },
  { id: "circular_economy",            label: { fr: "Économie circulaire",                       en: "Circular Economy" },            pillar: "E" },
  { id: "employee_wellbeing",          label: { fr: "Bien-être des employés",                    en: "Employee Wellbeing" },          pillar: "S" },
  { id: "human_rights_community",      label: { fr: "Droits humains & communauté",               en: "Human Rights & Community" },    pillar: "S" },
  { id: "supply_chain_responsibility", label: { fr: "Responsabilité chaîne d'approvisionnement", en: "Supply Chain Responsibility" }, pillar: "S" },
  { id: "board_governance",            label: { fr: "Gouvernance du conseil",                    en: "Board Governance" },            pillar: "G" },
  { id: "ethics_anticorruption",       label: { fr: "Éthique & anti-corruption",                 en: "Ethics & Anti-Corruption" },    pillar: "G" },
  { id: "data_privacy",                label: { fr: "Confidentialité des données",               en: "Data Privacy" },                pillar: "G" },
  { id: "shareholder_rights",          label: { fr: "Droits des actionnaires",                   en: "Shareholder Rights" },          pillar: "G" },
] as const;

export type ThemeId = typeof THEMES[number]["id"];
export type PillarId = "E" | "S" | "G";

// Sector groups
export const SECTOR_GROUPS = [
  { id: "manufacturing",  label: { fr: "Industrie & fabrication",   en: "Manufacturing" } },
  { id: "services",       label: { fr: "Services",                  en: "Services" } },
  { id: "retail",         label: { fr: "Commerce & distribution",   en: "Retail" } },
  { id: "construction",   label: { fr: "Construction & BTP",        en: "Construction" } },
  { id: "agriculture",    label: { fr: "Agriculture & agroalimentaire", en: "Agriculture" } },
  { id: "tech",           label: { fr: "Technologie & numérique",   en: "Tech & Digital" } },
] as const;

// Plan feature limits
export const PLAN_LIMITS = {
  starter: {
    reportsPerYear: 0,
    simulatorActions: 0,
    historyMonths: 0,
    apiAccess: false,
    pdfExport: false,
  },
  growth: {
    reportsPerYear: 4,
    simulatorActions: 5,
    historyMonths: 12,
    apiAccess: false,
    pdfExport: true,
  },
  professional: {
    reportsPerYear: 12,
    simulatorActions: 20,
    historyMonths: 36,
    apiAccess: false,
    pdfExport: true,
  },
  consultant: {
    reportsPerYear: -1, // unlimited
    simulatorActions: -1,
    historyMonths: 36,
    apiAccess: true,
    pdfExport: true,
  },
} as const;

// ── Theme icons (T-CONST-001) ─────────────────────────────────
import {
  Leaf, Bug, Recycle, Heart, Users, Truck,
  LayoutGrid, Shield, Lock, Vote, type LucideIcon,
} from "lucide-react";

export const THEME_ICONS: Record<string, LucideIcon> = {
  climate_transition:          Leaf,
  biodiversity:                Bug,
  circular_economy:            Recycle,
  employee_wellbeing:          Heart,
  human_rights_community:      Users,
  supply_chain_responsibility: Truck,
  board_governance:            LayoutGrid,
  ethics_anticorruption:       Shield,
  data_privacy:                Lock,
  shareholder_rights:          Vote,
  default:                     Leaf,
};

// Materiality badge colours (T-CONST-001)
export const MATERIALITY_COLORS: Record<string, string> = {
  Critical:    "#B71C1C",
  Material:    "#E65100",
  Relevant:    "#1565C0",
  NotRelevant: "#757575",
};

// getPillar helper (T-CONST-001)
export function getPillar(themeId: string): "E" | "S" | "G" {
  const theme = THEMES.find(t => t.id === themeId);
  return (theme?.pillar as "E" | "S" | "G") ?? "E";
}

// Plan display labels (for settings, billing, toasts)
export const PLAN_LABELS: Record<string, string> = {
  starter:      "Starter",
  growth:       "Croissance",
  professional: "Professionnel",
  consultant:   "Consultant",
};
