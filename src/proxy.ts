import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, CUSTOMER_COOKIE_NAME } from "@/lib/customer-auth";

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

  return response;
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
