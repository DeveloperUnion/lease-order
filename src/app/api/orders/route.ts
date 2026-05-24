import { NextResponse } from "next/server";
import {
  submitOrderCore,
  type SubmitOrderInput,
} from "@/lib/order-submission";

export const dynamic = "force-dynamic";

type RequestBody = {
  client_request_id?: unknown;
  payload?: SubmitOrderInput;
  intake_document_id?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストボディが不正です" },
      { status: 400 }
    );
  }

  if (typeof body.client_request_id !== "string" || !body.payload) {
    return NextResponse.json(
      { ok: false, error: "client_request_id と payload が必要です" },
      { status: 400 }
    );
  }

  const intakeDocumentId =
    typeof body.intake_document_id === "string" && body.intake_document_id
      ? body.intake_document_id
      : undefined;

  const result = await submitOrderCore(body.payload, body.client_request_id, {
    intakeDocumentId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result, { status: 200 });
}
