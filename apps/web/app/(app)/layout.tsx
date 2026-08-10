import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();

  // Check session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  // Fetch user profile
  const { data: profile } = await supabase
    .from("users")
    .select("id, role, plan, company_id, full_name, locale")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");

  // Role-based redirects
  if (profile.role === "consultant") redirect("/clients");
  if (profile.role === "admin") redirect("/admin/panel");

  // SME owner without company profile → onboarding
  if (profile.role === "sme_owner" && !profile.company_id) {
    redirect("/onboarding/profile");
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar role={profile.role} plan={profile.plan} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
