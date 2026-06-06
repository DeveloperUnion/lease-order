import Image from "next/image";
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import SignupForm from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const tenant = await getTenant();

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 sm:py-20 bg-background">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-10">
          <Image
            src="/images/logo-union.webp"
            alt="union"
            width={486}
            height={823}
            priority
            className="h-10 w-auto"
          />
          <span className="text-xl font-bold tracking-tight text-accent leading-none">
            発注<span className="text-[10px] font-medium ml-0.5 align-baseline">for リース</span>
          </span>
        </div>

        {tenant.customer_self_registration ? (
          <>
            <h1 className="text-lg font-bold text-foreground mb-1">会員登録</h1>
            <p className="text-sm text-muted mb-6">
              ご登録のメールアドレスに確認コードをお送りします。
            </p>
            <SignupForm />
            <p className="text-xs text-subtle mt-8">
              すでにアカウントをお持ちの場合は{" "}
              <Link href="/login" className="text-accent underline">
                ログイン
              </Link>
            </p>
          </>
        ) : (
          <div>
            <h1 className="text-lg font-bold text-foreground mb-2">
              会員登録は利用できません
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              このサイトでは会員登録を受け付けていません。アカウントの発行はリース会社の担当者までお問い合わせください。
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 text-sm text-accent underline"
            >
              ログイン画面へ
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
