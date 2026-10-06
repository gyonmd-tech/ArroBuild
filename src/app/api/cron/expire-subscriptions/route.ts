import { NextRequest, NextResponse } from "next/server";
import { PaymentService } from "@/lib/services/payment.service";
import { logger } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/security/safe-compare";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron endpoint to expire stale subscriptions.
 * Secure with CRON_SECRET header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET belum diset" },
      { status: 503 }
    );
  }

  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const expired = await PaymentService.processExpiredSubscriptions();
    logger.info("cron_expired_subscriptions", { expired });
    return NextResponse.json({ ok: true, expired });
  } catch (error) {
    logger.error("cron_expired_subscriptions_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Gagal memproses expired subscriptions" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // Allow Vercel cron GET with same secret via query (optional)
  return POST(req);
}
