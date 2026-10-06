import { NextResponse } from "next/server";
import { PaymentService } from "@/lib/services/payment.service";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await PaymentService.handleWebhook({
      order_id: String(payload.order_id ?? ""),
      transaction_id: payload.transaction_id as string | undefined,
      gross_amount: String(payload.gross_amount ?? ""),
      transaction_status: String(payload.transaction_status ?? ""),
      status_code: payload.status_code as string | undefined,
      signature_key: payload.signature_key as string | undefined,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("webhook_processing_failed", {
      orderId: payload.order_id,
      error: error instanceof Error ? error.message : String(error),
    });

    const statusCode =
      error instanceof Error && "statusCode" in error
        ? (error as { statusCode: number }).statusCode
        : 500;

    // Details stay in the log; the caller only learns the status class.
    return NextResponse.json(
      { error: statusCode >= 500 ? "Internal server error" : "Webhook rejected" },
      { status: statusCode }
    );
  }
}
