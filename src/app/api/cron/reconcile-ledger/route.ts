import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/security/safe-compare";

export const runtime = "nodejs";
export const maxDuration = 120;

const DRIFT_THRESHOLD = 10;

export async function POST(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, creditBalance: true },
  });

  const drifts: Array<{
    userId: string;
    cached: number;
    ledgerSum: number;
    delta: number;
  }> = [];

  for (const user of users) {
    const agg = await prisma.creditLedger.aggregate({
      where: { userId: user.id },
      _sum: { amount: true },
    });
    const ledgerSum = agg._sum.amount ?? 0;
    const delta = Math.abs(user.creditBalance - ledgerSum);
    if (delta > DRIFT_THRESHOLD) {
      drifts.push({
        userId: user.id,
        cached: user.creditBalance,
        ledgerSum,
        delta,
      });
      logger.error("ledger_drift_detected", {
        userId: user.id,
        cached: user.creditBalance,
        ledgerSum,
        delta,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: users.length,
    drifts: drifts.length,
    details: drifts,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
