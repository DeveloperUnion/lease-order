import type { NotificationKind, NotificationContext } from "./types";

export type RenderedTemplate = {
  subject: string;
  body: string;
};

export function renderTemplate(
  kind: NotificationKind,
  ctx: NotificationContext
): RenderedTemplate {
  const greeting = `${ctx.companyName} ${ctx.contactName} 様`;
  switch (kind) {
    case "order_received":
      return {
        subject: `【ご発注受付】${ctx.orderNumber}`,
        body: [
          greeting,
          "",
          "ご発注を受け付けました。内容を確認のうえ、改めてご連絡いたします。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          ctx.itemSummary ? `内容: ${ctx.itemSummary}` : "",
          "",
          "本メールへの返信は不要です。",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "order_approved":
      return {
        subject: `【ご発注 承認】${ctx.orderNumber}`,
        body: [
          greeting,
          "",
          "ご発注を承認いたしました。出荷準備を進めさせていただきます。",
          "",
          `発注番号: ${ctx.orderNumber}`,
        ].join("\n"),
      };
    case "order_rejected":
      return {
        subject: `【ご発注 お断り】${ctx.orderNumber}`,
        body: [
          greeting,
          "",
          "誠に申し訳ございませんが、下記のご発注はお受けできませんでした。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          ctx.rejectReason ? `理由: ${ctx.rejectReason}` : "",
          "",
          "ご不明な点がございましたら担当者までお問い合わせください。",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "order_shipped":
      return {
        subject: `【ご発注 出荷】${ctx.orderNumber}`,
        body: [
          greeting,
          "",
          "ご発注の資材を出荷いたしました。",
          "",
          `発注番号: ${ctx.orderNumber}`,
        ].join("\n"),
      };
    case "admin_new_order":
      return {
        subject: `【新規発注】${ctx.orderNumber} - ${ctx.companyName}`,
        body: [
          "新しい発注が届きました。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          `会社: ${ctx.companyName}`,
          `担当: ${ctx.contactName}`,
          ctx.itemSummary ? `内容: ${ctx.itemSummary}` : "",
          "",
          ctx.adminUrl ? `詳細: ${ctx.adminUrl}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "return_requested":
      return {
        subject: `【返却申請】${ctx.orderNumber} - ${ctx.companyName}`,
        body: [
          "返却の申請が届きました。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          `会社: ${ctx.companyName}`,
          `担当: ${ctx.contactName}`,
          ctx.itemSummary ? `内容: ${ctx.itemSummary}` : "",
          "",
          "管理画面から内容を確認のうえ、受領処理を行ってください。",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "return_acknowledged":
      return {
        subject: `【返却 受領完了】${ctx.orderNumber}`,
        body: [
          greeting,
          "",
          "返却の受領を確認いたしました。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          ctx.itemSummary ? `内容: ${ctx.itemSummary}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "return_rejected":
      return {
        subject: `【返却 確認できませんでした】${ctx.orderNumber}`,
        body: [
          greeting,
          "",
          "返却の申請内容に確認が必要な点がございました。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          ctx.rejectReason ? `理由: ${ctx.rejectReason}` : "",
          "",
          "お手数ですが担当者までお問い合わせください。",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "extension_requested":
      return {
        subject: `【期限延長申請】${ctx.orderNumber} - ${ctx.companyName}`,
        body: [
          "期限延長の申請が届きました。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          `会社: ${ctx.companyName}`,
          `担当: ${ctx.contactName}`,
          ctx.itemSummary ? `内容: ${ctx.itemSummary}` : "",
          "",
          "管理画面から内容を確認のうえ、承認処理を行ってください。",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "extension_acknowledged":
      return {
        subject: `【期限延長 承認】${ctx.orderNumber}`,
        body: [
          greeting,
          "",
          "期限延長の申請を承認いたしました。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          ctx.itemSummary ? `内容: ${ctx.itemSummary}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "extension_rejected":
      return {
        subject: `【期限延長 お断り】${ctx.orderNumber}`,
        body: [
          greeting,
          "",
          "誠に申し訳ございませんが、期限延長の申請はお受けできませんでした。",
          "",
          `発注番号: ${ctx.orderNumber}`,
          ctx.rejectReason ? `理由: ${ctx.rejectReason}` : "",
          "",
          "ご不明な点がございましたら担当者までお問い合わせください。",
        ]
          .filter(Boolean)
          .join("\n"),
      };
  }
}
