import Image from "next/image";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;

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

        <LoginForm next={next} />

        <p className="text-xs text-subtle mt-8 leading-relaxed">
          ログイン情報をお忘れの場合はリース会社の担当者までお問い合わせください。
        </p>
      </div>
    </main>
  );
}
