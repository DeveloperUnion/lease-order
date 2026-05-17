"use server";

import {
  submitOrderCore,
  type SubmitOrderInput,
  type SubmitOrderResult,
} from "@/lib/order-submission";

export type { SubmitOrderInput, SubmitOrderResult } from "@/lib/order-submission";

export async function submitOrder(
  input: SubmitOrderInput,
  clientRequestId: string
): Promise<SubmitOrderResult> {
  return submitOrderCore(input, clientRequestId);
}
