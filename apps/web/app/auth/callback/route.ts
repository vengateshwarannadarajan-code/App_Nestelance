import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const plan = searchParams.get("plan") ?? "starter";

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user profile exists
      const { data: profile } = await supabase
        .from("users")
        .select("id, company_id")
        .eq("id", data.user.id)
        .single();

      if (!profile) {
        // New user — create profile, redirect to onboarding
        await supabase.from("users").insert({
          id: data.user.id,
          email: data.user.email,
          plan,
          role: "sme_owner",
          locale: "fr",
        });
        return NextResponse.redirect(`${origin}/onboarding/profile`);
      }

      // Existing user — redirect to dashboard
      if (profile.company_id) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }
      return NextResponse.redirect(`${origin}/onboarding/profile`);
    }
  }

  // Error fallback
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
