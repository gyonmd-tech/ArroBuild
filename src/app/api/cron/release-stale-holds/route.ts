import { NextRequest, NextResponse } from "next/server";
import { CreditService } from "@/lib/services/credit.service";
import { logger } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/security/safe-compare";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Holds older than the longest route (180s) plus margin can only be orphans. */
const STALE_AFTER_MINUTES = 15;

export async function POST(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const released = await CreditService.releaseStaleReservations(STALE_AFTER_MINUTES);
    logger.info("cron_release_stale_holds", { released });
    return NextResponse.json({ ok: true, released });
  } catch (error) {
    logger.error("cron_release_stale_holds_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Gagal melepas hold kredit" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
