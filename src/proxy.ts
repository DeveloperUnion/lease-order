import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, CUSTOMER_COOKIE_NAME } from "@/lib/customer-auth";
import {
  extractSlugFromHost,
  isSuperAdminHost,
  getCustomerAccessModeByHost,
  isTenantLockedByHost,
} from "@/lib/tenant";
import { isAdminAllowedForTenant } from "@/lib/admin-access";
import { isSuperAdmin } from "@/lib/super-admin-access";

const PUBLIC_ADMIN_PATHS = [
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password",
];

// guest_browse モードでゲスト（未ログイン）に開放するカタログ系パス。
// allow-list 方式（protect-by-default）：ここに無いパスは未ログインなら必ず
// /login へ送る。発注・履歴・rentals 等の機微なページが誤って公開されるのを防ぐ。
function isGuestBrowsable(pathname: string): boolean {
  if (pathname === "/" || pathname === "/search") return true;
  if (pathname.startsWith("/category/")) return true;
  return false;
}

async function adminProxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getClaims は JWKS をクライアントキャッシュして JWT 署名をローカル検証する。
  // getUser のような /auth/v1/user への HTTP 往復が無いため middleware の TTFB が大幅に減る。
  // 未ログイン時は data === null になるので optional chaining で受ける。
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p));

  if (!claims && !isPublic) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (claims && pathname === "/admin/login") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // ログイン済みかつ保護ルートのとき、host が指す tenant の admin として
  // 登録されているか確認する。Supabase Auth に有効な session があっても、
  // admin_users に当該 tenant の行が無ければアクセスを拒否する。
  // signOut はせず redirect のみ — 自分の所属 tenant の URL に行けばそのまま使えるようにする。
  if (claims && !isPublic) {
    const email = (claims.email as string | undefined) ?? null;
    const slug = extractSlugFromHost(request.headers.get("host") ?? "");
    if (!email || !slug || !(await isAdminAllowedForTenant(email, slug))) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("error", "tenant_mismatch");
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

// 運営者(super-admin)コンソール専用ホストのゲート。
// ルートファイルは /super-admin/* 配下に置くが、ブラウザにはクリーンな
// パス（/, /login, /tenants/...）を見せたいので、最後に内部 rewrite で
// /super-admin を前置する。テナント JWT は一切発行しない。
async function superAdminProxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  // クリーンパス基準の public 判定（/login, /auth/callback）
  const isPublic = pathname === "/login" || pathname.startsWith("/auth");

  // リフレッシュされた session cookie を、確定レスポンス（redirect / rewrite）へ載せ直す。
  const handoff = (res: NextResponse) => {
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    return res;
  };

  if (!claims && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return handoff(NextResponse.redirect(loginUrl));
  }

  if (claims && pathname === "/login") {
    return handoff(NextResponse.redirect(new URL("/", request.url)));
  }

  // ログイン済みかつ保護ルートのとき、super_admins allowlist を確認する。
  if (claims && !isPublic) {
    const email = (claims.email as string | undefined) ?? null;
    if (!email || !(await isSuperAdmin(email))) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "not_allowed");
      return handoff(NextResponse.redirect(loginUrl));
    }
  }

  // クリーンパス → 内部の /super-admin/* ルートへ rewrite。
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/super-admin" : `/super-admin${pathname}`;
  return handoff(NextResponse.rewrite(url));
}

async function customerProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);

  if (payload) {
    // ログイン済みがログイン画面に来たらカタログへ。
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next({ request });
  }

  // 未ログイン。ログイン画面はそのまま表示。
  if (pathname === "/login") return NextResponse.next({ request });

  // guest_browse モードならカタログ系パスはゲスト通過。それ以外（login モード or
  // 保護パス）は /login へ。発注・履歴等は requireCustomer でも守られる二重防御。
  const mode = await getCustomerAccessModeByHost(request.headers.get("host"));
  if (mode === "guest_browse" && isGuestBrowsable(pathname)) {
    return NextResponse.next({ request });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  // 運営者コンソールは専用ホストで完全分離。最初に分岐させる（ロック対象外）。
  if (isSuperAdminHost(host)) {
    return superAdminProxy(request);
  }
  // トライアル期限切れ / 手動停止のテナントは admin・顧客とも完全ロック。
  // ロック画面（/trial-expired）自身は通し、それ以外は全パスを rewrite で覆う。
  const { pathname } = request.nextUrl;
  if (pathname !== "/trial-expired" && (await isTenantLockedByHost(host))) {
    const url = request.nextUrl.clone();
    url.pathname = "/trial-expired";
    return NextResponse.rewrite(url);
  }
  // 管理者は常時認証必須。それ以外（顧客側）はテナントの customer_access_mode に従う。
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return adminProxy(request);
  }
  return customerProxy(request);
}

export const config = {
  matcher: [
    // 静的ファイル・画像最適化・favicon・PWA manifest を除く全ルート。
    // manifest.webmanifest は認証/テナント文脈を要さない公開リソース。除外しないと
    // super-admin ホストで /super-admin/manifest.webmanifest に rewrite され 404 になる。
    "/((?!_next/static|_next/image|favicon.ico|images|manifest.webmanifest|.*\\.png$|.*\\.svg$|.*\\.jpg$).*)",
  ],
};
