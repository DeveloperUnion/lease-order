import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/admin";

  if (!code) {
    return NextResponse.redirect(new URL("/admin/login?error=invalid_code", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(new URL("/admin/login?error=invalid_code", request.url));
  }

  const { data: allowed, error: allowError } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("email", data.user.email.toLowerCase())
    .maybeSingle();

  if (allowError || !allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/admin/login?error=not_allowed", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
