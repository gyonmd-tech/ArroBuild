import type { CreditLedgerType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getTierConfig, estimateCreditsPerDocument, type ModelClassId } from "@/lib/config/tiers";
import { logger } from "@/lib/logger";
import {
  assertOwnedReservation,
  calculateReservationSettlement,
  CreditServiceError,
  reservationIdFromMetadata,
} from "@/lib/services/credit-ledger";

export { CreditServiceError } from "@/lib/services/credit-ledger";

export interface CreditReservation {
  reservationId: string;
  balanceAfter: number;
  message: string;
}

export interface CreditCommit {
  transactionId: string;
  balanceAfter: number;
  actualCreditsUsed: number;
}

export interface CreditBalance {
  current: number;
  available: number;
  reserved: number;
  reserved_for: { projectId: string; amount: number }[];
}

const SERIALIZABLE_TX = {
  isolationLevel: "Serializable",
  maxWait: 5000,
  timeout: 30000,
} as const;

const MAX_LEDGER_TX_ATTEMPTS = 4;

function isSerializationConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "P2034" || code === "40001" || code === "40P01") return true;
  const text = typeof message === "string" ? message : "";
  return /40001|40P01|could not serialize|write conflict|deadlock/i.test(text);
}

/**
 * Every balance-changing write reads the ledger sum and appends an entry, so it
 * must run Serializable; concurrent writers that conflict are retried.
 * Pass `tx` to join a caller's transaction instead of opening a new one.
 */
export async function runLedgerTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  tx?: Prisma.TransactionClient,
): Promise<T> {
  if (tx) return fn(tx);

  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, SERIALIZABLE_TX);
    } catch (error) {
      if (attempt >= MAX_LEDGER_TX_ATTEMPTS || !isSerializationConflict(error)) throw error;
      logger.warn("credit_ledger_tx_retry", { attempt });
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt + Math.random() * 50));
    }
  }
}

async function sumLedgerBalance(userId: string, tx: Prisma.TransactionClient = prisma) {
  const result = await tx.creditLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

async function findReservationRelease(
  tx: Prisma.TransactionClient,
  userId: string,
  reservationId: string,
) {
  return tx.creditLedger.findFirst({
    where: {
      userId,
      type: "RESERVATION_RELEASE",
      metadata: { path: ["reservationId"], equals: reservationId },
    },
    select: { id: true },
  });
}

async function appendEntry(
  tx: Prisma.TransactionClient,
  data: Omit<Prisma.CreditLedgerUncheckedCreateInput, "balanceAfter"> & { amount: number },
  currentBalance: number,
) {
  const balanceAfter = currentBalance + data.amount;
  const entry = await tx.creditLedger.create({ data: { ...data, balanceAfter } });
  await tx.user.update({
    where: { id: data.userId },
    data: { creditBalance: balanceAfter },
  });
  return entry;
}

async function settleReservation(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    reservationId: string;
    projectId?: string;
    /** Undefined charges the full hold. */
    actualCreditsUsed?: number;
    usageType: CreditLedgerType;
    toolId?: string;
    usageMetadata: Record<string, unknown>;
    releaseReason: string;
  },
) {
  const reservation = await tx.creditLedger.findUniqueOrThrow({
    where: { id: params.reservationId },
  });
  const holdedCredits = assertOwnedReservation(reservation, params.userId, params.projectId);

  if (await findReservationRelease(tx, params.userId, params.reservationId)) {
    throw new CreditServiceError("RESERVATION_SETTLED", "Reservation sudah diselesaikan", 409);
  }

  const actualCreditsUsed = params.actualCreditsUsed ?? holdedCredits;
  const sumBalance = await sumLedgerBalance(params.userId, tx);
  const settlement = calculateReservationSettlement(sumBalance, holdedCredits, actualCreditsUsed);

  if (settlement.uncharged > 0) {
    logger.warn("credit_usage_exceeded_hold", {
      userId: params.userId,
      reservationId: params.reservationId,
      holdedCredits,
      actualCreditsUsed,
    });
  }

  const usageEntry = await tx.creditLedger.create({
    data: {
      userId: params.userId,
      type: params.usageType,
      amount: -settlement.chargedCredits,
      projectId: params.projectId ?? reservation.projectId,
      toolId: params.toolId,
      balanceAfter: settlement.chargeBalanceAfter,
      metadata: {
        ...params.usageMetadata,
        reservationId: params.reservationId,
        holdedCredits,
      } as Prisma.InputJsonValue,
    },
  });

  await tx.creditLedger.create({
    data: {
      userId: params.userId,
      type: "RESERVATION_RELEASE",
      amount: settlement.releaseAmount,
      projectId: params.projectId ?? reservation.projectId,
      balanceAfter: settlement.finalBalance,
      metadata: {
        reservationId: params.reservationId,
        holdedCredits,
        actualCreditsUsed,
        chargedCredits: settlement.chargedCredits,
        surplus: settlement.surplus,
        reason: params.releaseReason,
      },
    },
  });

  await tx.user.update({
    where: { id: params.userId },
    data: { creditBalance: settlement.finalBalance },
  });

  return {
    transactionId: usageEntry.id,
    balanceAfter: settlement.finalBalance,
    actualCreditsUsed: settlement.chargedCredits,
  };
}

export const CreditService = {
  async reserveCredit(
    userId: string,
    estimatedCreditsNeeded: number,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditReservation> {
    if (!Number.isInteger(estimatedCreditsNeeded) || estimatedCreditsNeeded < 0) {
      throw new CreditServiceError("INVALID_CREDIT_HOLD", "Estimasi kredit tidak valid", 400);
    }

    try {
      return await runLedgerTransaction(async (tx) => {
        await tx.user.findUniqueOrThrow({ where: { id: userId } });

        const currentBalance = await sumLedgerBalance(userId, tx);

        if (currentBalance < estimatedCreditsNeeded) {
          throw new CreditServiceError(
            "INSUFFICIENT_CREDITS",
            `Kredit tidak cukup. Dibutuhkan ${estimatedCreditsNeeded}, tersedia ${currentBalance}`,
            402,
          );
        }

        const reservationEntry = await appendEntry(
          tx,
          {
            userId,
            type: "RESERVATION_HOLD",
            amount: -estimatedCreditsNeeded,
            projectId,
            metadata: {
              ...metadata,
              estimatedCreditsNeeded,
              reason: "reserve_for_generate",
            } as Prisma.InputJsonValue,
          },
          currentBalance,
        );

        logger.info("credit_reserved", {
          userId,
          projectId,
          estimatedCredits: estimatedCreditsNeeded,
          balanceAfter: reservationEntry.balanceAfter,
          reservationId: reservationEntry.id,
        });

        return {
          reservationId: reservationEntry.id,
          balanceAfter: reservationEntry.balanceAfter,
          message: `Reserved ${estimatedCreditsNeeded} credits`,
        };
      });
    } catch (error) {
      logger.error("credit_reserve_failed", {
        userId,
        projectId,
        estimatedCredits: estimatedCreditsNeeded,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  async commitCredit(
    userId: string,
    reservationId: string,
    projectId: string,
    documentsGenerated: Array<{
      fileKey: string;
      modelClass: ModelClassId;
      promptVersion?: string;
      modelRoute?: string;
      tokensUsed: number;
    }>,
    metadata?: Record<string, unknown>,
  ): Promise<CreditCommit> {
    let actualCreditsUsed = 0;
    for (const doc of documentsGenerated) {
      actualCreditsUsed += estimateCreditsPerDocument(doc.tokensUsed, doc.modelClass);
    }

    try {
      const commit = await runLedgerTransaction((tx) =>
        settleReservation(tx, {
          userId,
          reservationId,
          projectId,
          actualCreditsUsed,
          usageType: "GENERATE_DOCUMENT",
          usageMetadata: { ...metadata, documentsGenerated },
          releaseReason: "settle_generation_reservation",
        }),
      );
      logger.info("credit_committed", {
        userId,
        projectId,
        reservationId,
        actualCreditsUsed: commit.actualCreditsUsed,
        finalBalance: commit.balanceAfter,
      });
      return commit;
    } catch (error) {
      logger.error("credit_commit_failed", {
        userId,
        reservationId,
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  async commitRevision(
    userId: string,
    reservationId: string,
    projectId: string,
    /** Omit to charge the full hold (the price quoted when the hold was placed). */
    actualCreditsUsed?: number,
    metadata?: Record<string, unknown>,
  ): Promise<CreditCommit> {
    try {
      const commit = await runLedgerTransaction((tx) =>
        settleReservation(tx, {
          userId,
          reservationId,
          projectId,
          actualCreditsUsed:
            actualCreditsUsed === undefined
              ? undefined
              : Math.max(Math.trunc(actualCreditsUsed), 1),
          usageType: "REVISION",
          usageMetadata: { ...metadata },
          releaseReason: "settle_revision_reservation",
        }),
      );
      logger.info("revision_credit_committed", {
        userId,
        projectId,
        reservationId,
        actualCreditsUsed: commit.actualCreditsUsed,
        finalBalance: commit.balanceAfter,
      });
      return commit;
    } catch (error) {
      logger.error("revision_credit_commit_failed", {
        userId,
        reservationId,
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  async commitFreeRevision(
    userId: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditCommit> {
    const revisionEntry = await runLedgerTransaction(async (tx) => {
      const sumBalance = await sumLedgerBalance(userId, tx);
      return tx.creditLedger.create({
        data: {
          userId,
          type: "REVISION",
          amount: 0,
          projectId,
          balanceAfter: sumBalance,
          metadata: { ...metadata, freeRevision: true } as Prisma.InputJsonValue,
        },
      });
    });

    logger.info("revision_free_committed", {
      userId,
      projectId,
      transactionId: revisionEntry.id,
    });

    return {
      transactionId: revisionEntry.id,
      balanceAfter: revisionEntry.balanceAfter,
      actualCreditsUsed: 0,
    };
  },

  async commitToolReservation(
    userId: string,
    reservationId: string,
    toolId: string,
    actualCreditsUsed: number,
    metadata?: Record<string, unknown>,
  ): Promise<CreditCommit> {
    const commit = await runLedgerTransaction((tx) =>
      settleReservation(tx, {
        userId,
        reservationId,
        actualCreditsUsed,
        usageType: "TOOL_USAGE",
        toolId,
        usageMetadata: { ...metadata, tool: toolId },
        releaseReason: "settle_tool_reservation",
      }),
    );

    logger.info("tool_reservation_committed", {
      userId,
      toolId,
      reservationId,
      actualCreditsUsed: commit.actualCreditsUsed,
      finalBalance: commit.balanceAfter,
    });

    return commit;
  },

  /** Idempotent: releasing an already-settled reservation is a no-op. */
  async releaseReservation(
    userId: string,
    reservationId: string,
    reason = "generation_failed",
  ): Promise<void> {
    await runLedgerTransaction(async (tx) => {
      const reservation = await tx.creditLedger.findUniqueOrThrow({
        where: { id: reservationId },
      });
      const holdedAmount = assertOwnedReservation(reservation, userId);

      if (await findReservationRelease(tx, userId, reservationId)) return;

      const currentBalance = await sumLedgerBalance(userId, tx);
      await appendEntry(
        tx,
        {
          userId,
          type: "RESERVATION_RELEASE",
          amount: holdedAmount,
          projectId: reservation.projectId,
          metadata: { reservationId, reason },
        },
        currentBalance,
      );

      logger.info("credit_released", { userId, reservationId, reason });
    });
  },

  /**
   * Release holds that were never settled (killed function, lost stream).
   * Returns the number of holds released.
   */
  async releaseStaleReservations(olderThanMinutes = 15, limit = 200): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const holds = await prisma.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT h.id, h."userId"
      FROM credit_ledger h
      WHERE h.type = 'RESERVATION_HOLD'
        AND h."createdAt" < ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger r
          WHERE r."userId" = h."userId"
            AND r.type = 'RESERVATION_RELEASE'
            AND r.metadata->>'reservationId' = h.id
        )
      ORDER BY h."createdAt" ASC
      LIMIT ${limit}
    `;

    let released = 0;
    for (const hold of holds) {
      try {
        await this.releaseReservation(hold.userId, hold.id, "stale_reservation_sweep");
        released++;
      } catch (error) {
        logger.error("stale_reservation_release_failed", {
          reservationId: hold.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return released;
  },

  async getBalance(userId: string): Promise<CreditBalance> {
    const ledger = await prisma.creditLedger.findMany({
      where: { userId },
      select: { id: true, amount: true, type: true, projectId: true, metadata: true },
    });

    const current = ledger.reduce((sum, entry) => sum + entry.amount, 0);
    const releasedReservationIds = new Set(
      ledger
        .filter((entry) => entry.type === "RESERVATION_RELEASE")
        .map((entry) => reservationIdFromMetadata(entry.metadata))
        .filter((id): id is string => id !== null),
    );
    const reservedEntries = ledger.filter(
      (entry) => entry.type === "RESERVATION_HOLD" && !releasedReservationIds.has(entry.id),
    );
    const reserved = Math.abs(reservedEntries.reduce((sum, e) => sum + e.amount, 0));

    return {
      current,
      available: current,
      reserved,
      reserved_for: reservedEntries.map((e) => ({
        projectId: e.projectId || "unknown",
        amount: Math.abs(e.amount),
      })),
    };
  },

  async refreshMonthlyCredits(
    userId: string,
    paymentId?: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const { tier, creditsPerMonth } = await runLedgerTransaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const config = getTierConfig(user.tier);
      const currentBalance = await sumLedgerBalance(userId, tx);

      await appendEntry(
        tx,
        {
          userId,
          type: "MONTHLY_REFRESH",
          amount: config.creditsPerMonth,
          paymentId,
          metadata: {
            tier: user.tier,
            creditsPerMonth: config.creditsPerMonth,
          },
        },
        currentBalance,
      );
      return { tier: user.tier, creditsPerMonth: config.creditsPerMonth };
    }, outerTx);

    logger.info("monthly_credits_refreshed", {
      userId,
      tier,
      creditsAdded: creditsPerMonth,
    });
  },

  async chargeToolCredits(
    userId: string,
    credits: number,
    toolId: string,
    metadata?: Record<string, unknown>,
  ): Promise<CreditCommit> {
    const entry = await runLedgerTransaction(async (tx) => {
      const currentBalance = await sumLedgerBalance(userId, tx);
      if (currentBalance < credits) {
        throw new CreditServiceError(
          "INSUFFICIENT_CREDITS",
          `Kredit tidak cukup. Dibutuhkan ${credits}, tersedia ${currentBalance}`,
          402,
        );
      }

      return appendEntry(
        tx,
        {
          userId,
          type: "TOOL_USAGE",
          amount: -credits,
          toolId,
          metadata: { tool: toolId, ...(metadata ?? {}) } as Prisma.InputJsonValue,
        },
        currentBalance,
      );
    });

    logger.info("tool_credits_charged", {
      userId,
      toolId,
      credits,
      balanceAfter: entry.balanceAfter,
    });

    return {
      transactionId: entry.id,
      balanceAfter: entry.balanceAfter,
      actualCreditsUsed: credits,
    };
  },

  async topupCredits(
    userId: string,
    credits: number,
    paymentId?: string,
    metadata?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ): Promise<CreditCommit> {
    const entry = await runLedgerTransaction(async (client) => {
      const currentBalance = await sumLedgerBalance(userId, client);
      return appendEntry(
        client,
        {
          userId,
          type: "TOPUP",
          amount: credits,
          paymentId,
          metadata: (metadata ?? {}) as Prisma.InputJsonValue,
        },
        currentBalance,
      );
    }, tx);

    return {
      transactionId: entry.id,
      balanceAfter: entry.balanceAfter,
      actualCreditsUsed: credits,
    };
  },

  async adjustCredits(
    userId: string,
    amount: number,
    reason: string,
    adminUserId?: string,
  ): Promise<CreditCommit> {
    const entry = await runLedgerTransaction(async (tx) => {
      const currentBalance = await sumLedgerBalance(userId, tx);
      return appendEntry(
        tx,
        {
          userId,
          type: "MANUAL_ADJUSTMENT",
          amount,
          metadata: { reason, adminUserId },
        },
        currentBalance,
      );
    });

    return {
      transactionId: entry.id,
      balanceAfter: entry.balanceAfter,
      actualCreditsUsed: amount,
    };
  },
};
