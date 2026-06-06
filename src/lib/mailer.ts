import "server-only";
import { Resend } from "resend";

// 注文通知（テンプレート＋email_logs）とは別の、単発トランザクショナルメール用。
// 会員登録のメール認証コード送信などに使う。RESEND_API_KEY 未設定時は送信せず
// 失敗を返す（呼び出し側でハンドリング）。
const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || "onboarding@resend.dev";
const resend = apiKey ? new Resend(apiKey) : null;

// "Name <email>" / "email" どちらの形でもアドレス部分だけ取り出す。
function bareAddress(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return m ? m[1].trim() : value.trim();
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  // 差出人の表示名（例: "Union"）。アドレスは EMAIL_FROM のまま、表示名だけ上書きする。
  fromName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn(
      `RESEND_API_KEY 未設定のためメール未送信: ${input.subject} → ${input.to}`
    );
    return { ok: false, error: "メール送信が構成されていません" };
  }
  const from = input.fromName
    ? `${input.fromName} <${bareAddress(fromAddress)}>`
    : fromAddress;
  try {
    const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
