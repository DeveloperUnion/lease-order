import Image from "next/image";
import { redirect } from "next/navigation";
import VerifyForm from "./verify-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ email?: string }>;

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { email } = await searchParams;
  if (!email) redirect("/signup");

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

        <h1 className="text-lg font-bold text-foreground mb-1">メールアドレスの確認</h1>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          <span className="text-foreground font-medium break-all">{email}</span>
          <br />
          宛に送信した 6 桁の確認コードを入力してください。
        </p>

        <VerifyForm email={email} />
      </div>
    </main>
  );
}
