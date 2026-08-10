"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Brain, TrendingUp, Calculator,
  FileText, Users, ShieldCheck, Settings, LogOut,
  ChevronRight,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { type UserRole, type UserPlan } from "@/lib/useUser";
import { PLAN_RANK } from "@/lib/constants";

interface SidebarProps {
  role: UserRole;
  plan: UserPlan;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  requiredPlan?: UserPlan;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Tableau de bord",  href: "/dashboard",            icon: LayoutDashboard },
  { label: "Explication IA",   href: "/dashboard/xai",        icon: Brain,       requiredPlan: "growth" },
  { label: "Simulateur",       href: "/dashboard/simulator",  icon: TrendingUp,  requiredPlan: "growth" },
  { label: "Impact financier", href: "/dashboard/financial",  icon: Calculator,  requiredPlan: "professional" },
  { label: "Rapports",         href: "/dashboard/reports",    icon: FileText,    requiredPlan: "growth" },
  { label: "Mes clients",      href: "/clients",              icon: Users,       roles: ["consultant"] },
  { label: "Administration",   href: "/admin/panel",          icon: ShieldCheck, roles: ["admin"] },
  { label: "Paramètres",       href: "/settings",             icon: Settings },
];

export default function Sidebar({ role, plan }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const userRank = PLAN_RANK[plan] ?? 0;

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(role)) return false;
    return true;
  });

  return (
    <aside className="w-56 bg-white border-r border-gray-100 flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand-mid rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">N</span>
          </div>
          <span className="font-semibold text-gray-900 text-sm">Nest Élance</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const isLocked = item.requiredPlan && userRank < (PLAN_RANK[item.requiredPlan] ?? 0);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={isLocked ? "/settings/billing" : item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group
                ${isActive
                  ? "bg-brand-light text-brand-dark font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }
                ${isLocked ? "opacity-50" : ""}
              `}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isLocked && (
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                  {item.requiredPlan}
                </span>
              )}
              {isActive && !isLocked && (
                <ChevronRight className="w-3 h-3 text-brand-mid opacity-60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Plan badge + logout */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-2">
        <div className="px-3 py-2 rounded-lg bg-brand-light">
          <p className="text-xs text-brand-dark font-medium capitalize">{plan}</p>
          {plan === "starter" && (
            <Link href="/settings/billing" className="text-[10px] text-brand-accent hover:underline">
              Passer à Croissance →
            </Link>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
