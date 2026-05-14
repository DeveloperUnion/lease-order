import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { extractSlugFromHost } from "@/lib/tenant";
import { isAdminAllowedForTenant } from "@/lib/admin-access";

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

  // host から解決した tenant に紐付く admin_users 行があるか確認する。
  // メールが他テナントの admin として登録されていてもこの tenant では拒否する。
  const slug = extractSlugFromHost(request.headers.get("host") ?? "");
  const allowed = slug
    ? await isAdminAllowedForTenant(data.user.email, slug)
    : false;

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/admin/login?error=not_allowed", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
