import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, CUSTOMER_COOKIE_NAME } from "@/lib/customer-auth";
import { extractSlugFromHost, isSuperAdminHost } from "@/lib/tenant";
import { isAdminAllowedForTenant } from "@/lib/admin-access";
import { isSuperAdmin } from "@/lib/super-admin-access";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/auth"];
const PUBLIC_CUSTOMER_PATHS = ["/login"];

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

function customerProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_CUSTOMER_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);

  if (!payload && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (payload && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next({ request });
}

export async function proxy(request: NextRequest) {
  // 運営者コンソールは専用ホストで完全分離。DISABLE_AUTH より前に分岐し、
  // フィードバックモードでも super-admin ゲートは決して素通りさせない。
  if (isSuperAdminHost(request.headers.get("host") ?? "")) {
    return superAdminProxy(request);
  }

  // フィードバック収集モード: 認証ゲートを丸ごと素通りさせる。
  // 未ログイン訪問者には getCurrentCustomer / getAdminContext / currentAdminUserId
  // のフォールバックでテナントの最初の有効 customer / admin が割り当てられる。
  // 本番では DISABLE_AUTH を未設定にして従来通り認証を強制する。
  if (process.env.DISABLE_AUTH === "1") {
    const { pathname } = request.nextUrl;
    // ログイン画面は意味がないので飛ばす
    if (pathname === "/admin/login") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next({ request });
  }
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return adminProxy(request);
  }
  return customerProxy(request);
}

export const config = {
  matcher: [
    // 静的ファイル・画像最適化・favicon を除く全ルート
    "/((?!_next/static|_next/image|favicon.ico|images|.*\\.png$|.*\\.svg$|.*\\.jpg$).*)",
  ],
};
