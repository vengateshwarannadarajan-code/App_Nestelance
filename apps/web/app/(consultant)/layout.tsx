import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function ConsultantLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (profile?.role !== "consultant") redirect("/dashboard");

  return (
    <>
      {/* T-A11Y-005: Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-modal focus:text-brand-dark focus:font-medium"
      >
        Aller au contenu principal
      </a>
      <main id="main-content">{children}</main>
    </>
  );
}
