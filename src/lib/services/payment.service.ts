import type { Payment, PaymentStatus, Prisma, SubscriptionTier } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getTierConfig, parseBillingMonthsFromOrderId, PRIME_FIRST_MONTH_BONUS } from "@/lib/config/tiers";
import { createSnapToken, isSuccessfulTransactionStatus, getTransactionStatus, verifyWebhookSignature } from "@/lib/midtrans";
import { logger } from "@/lib/logger";
import { CreditService, runLedgerTransaction } from "@/lib/services/credit.service";
import { getCreditTopupPack } from "@/lib/config/tiers";

export interface MidtransWebhookPayload {
  order_id: string;
  transaction_id?: string;
  gross_amount: string;
  transaction_status: string;
  status_code?: string;
  signature_key?: string;
}

export class PaymentServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "PaymentServiceError";
  }
}

const SUBSCRIPTION_DAYS = 30;
const RENEWAL_INTERVAL_DAYS = 28;
const DAY_MS = 1000 * 60 * 60 * 24;

function mapTransactionStatus(status: string): PaymentStatus {
  switch (status) {
    case "settlement":
      return "SETTLEMENT";
    case "capture":
      return "CAPTURE";
    case "deny":
      return "DENY";
    case "cancel":
      return "CANCEL";
    case "expire":
      return "EXPIRE";
    case "failure":
      return "FAILED";
    default:
      return "PENDING";
  }
}

async function grantSubscriptionForPayment(
  tx: Prisma.TransactionClient,
  payment: Payment,
  orderId: string,
  paymentEventId: string
) {
  const now = new Date();
  const billingMonths = parseBillingMonthsFromOrderId(orderId);
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + SUBSCRIPTION_DAYS * billingMonths);
  const config = getTierConfig(payment.tier);

  const priorProMaxPayments = await tx.payment.count({
    where: {
      userId: payment.userId,
      tier: "PRIME",
      status: { in: ["SETTLEMENT", "PAID"] },
      id: { not: payment.id },
    },
  });
  const firstProMaxBonus =
    payment.tier === "PRIME" && priorProMaxPayments === 0 ? PRIME_FIRST_MONTH_BONUS : 0;
  const creditsToAdd = config.creditsPerMonth + firstProMaxBonus;

  await tx.subscription.upsert({
    where: { userId: payment.userId },
    create: {
      userId: payment.userId,
      tier: payment.tier,
      status: "ACTIVE",
      startDate: now,
      renewalDate: expiresAt,
      expiresAt,
    },
    update: {
      tier: payment.tier,
      status: "ACTIVE",
      startDate: now,
      renewalDate: expiresAt,
      expiresAt,
    },
  });

  const currentBalance = await tx.creditLedger.aggregate({
    where: { userId: payment.userId },
    _sum: { amount: true },
  });
  const balance = currentBalance._sum.amount ?? 0;

  await tx.creditLedger.create({
    data: {
      userId: payment.userId,
      type: "MONTHLY_REFRESH",
      amount: creditsToAdd,
      paymentId: payment.id,
      balanceAfter: balance + creditsToAdd,
      metadata: {
        paymentEventId,
        tier: payment.tier,
        reason: "payment_settlement",
        billingMonths,
        firstProMaxBonus,
      },
    },
  });

  await tx.user.update({
    where: { id: payment.userId },
    data: {
      tier: payment.tier,
      creditBalance: balance + creditsToAdd,
    },
  });

  logger.info("webhook_settlement_processed", {
    orderId,
    userId: payment.userId,
    tier: payment.tier,
    creditsAdded: creditsToAdd,
    billingMonths,
    firstProMaxBonus,
  });
}

export const PaymentService = {
  async createPaymentSnap(params: {
    userId: string;
    email: string;
    name?: string | null;
    tierSlug: string;
    amount: number;
    subscriptionTier: SubscriptionTier;
    billingMonths?: number;
  }) {
    const months = params.billingMonths ?? 1;
    const monthTag = months > 1 ? `m${months}-` : "";
    const orderId = `arro-${params.userId.slice(0, 8)}-${params.tierSlug}-${monthTag}${Date.now()}`;

    const { token: snapToken, redirectUrl } = await createSnapToken({
      orderId,
      amount: params.amount,
      tierId: params.tierSlug as "base" | "core" | "prime",
      customer: { email: params.email, name: params.name },
    });

    await prisma.payment.create({
      data: {
        orderId,
        userId: params.userId,
        tier: params.subscriptionTier,
        amount: params.amount,
        snapToken,
        status: "PENDING",
      },
    });

    logger.info("snap_token_created", {
      userId: params.userId,
      tier: params.subscriptionTier,
      orderId,
      amount: params.amount,
    });

    return { snapToken, orderId, redirectUrl };
  },

  async createTopupSnap(params: {
    userId: string;
    email: string;
    name?: string | null;
    packId: string;
    subscriptionTier: SubscriptionTier;
  }) {
    const pack = getCreditTopupPack(params.packId);
    if (!pack) {
      throw new PaymentServiceError("INVALID_PACK", "Paket top-up tidak valid", 422);
    }

    const orderId = `arro-topup-${params.userId.slice(0, 8)}-${pack.credits}-${Date.now()}`;

    const { token: snapToken, redirectUrl } = await createSnapToken({
      orderId,
      amount: pack.priceIdr,
      tierId: "base",
      customer: { email: params.email, name: params.name },
      itemName: pack.label,
    });

    await prisma.payment.create({
      data: {
        orderId,
        userId: params.userId,
        tier: params.subscriptionTier,
        amount: pack.priceIdr,
        snapToken,
        status: "PENDING",
      },
    });

    logger.info("topup_snap_created", {
      userId: params.userId,
      packId: params.packId,
      credits: pack.credits,
      orderId,
    });

    return { snapToken, orderId, redirectUrl, credits: pack.credits };
  },

  parseTopupCreditsFromOrderId(orderId: string): number | null {
    if (!orderId.startsWith("arro-topup-")) return null;
    const parts = orderId.split("-");
    const credits = parseInt(parts[3] ?? "", 10);
    return Number.isFinite(credits) && credits > 0 ? credits : null;
  },

  async handleWebhook(payload: MidtransWebhookPayload): Promise<{ status: string; message: string }> {
    const orderId = payload.order_id;
    const transactionStatus = payload.transaction_status ?? "";
    const statusCode = payload.status_code ?? "";
    const grossAmount = payload.gross_amount ?? "";
    const signatureKey = payload.signature_key ?? "";

    if (!orderId) {
      throw new PaymentServiceError("MISSING_ORDER_ID", "Missing order_id", 400);
    }

    if (!signatureKey || !statusCode || !grossAmount) {
      throw new PaymentServiceError(
        "MISSING_SIGNATURE",
        "Webhook signature fields wajib ada",
        401
      );
    }

    const valid = verifyWebhookSignature({
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
    });

    if (!valid) {
      logger.warn("webhook_signature_invalid", { orderId });
      throw new PaymentServiceError("INVALID_SIGNATURE", "Webhook signature invalid", 401);
    }

    // Midtrans sends several notifications per order (pending → settlement, …).
    // Each (orderId, status) is recorded once; the payment row's status decides
    // whether a grant has already happened, so retries and late duplicates are no-ops.
    return runLedgerTransaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { orderId } });
      if (!payment) {
        throw new PaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404);
      }

      if (parseInt(grossAmount, 10) !== payment.amount) {
        throw new PaymentServiceError(
          "AMOUNT_MISMATCH",
          `Amount mismatch: expected ${payment.amount}, got ${grossAmount}`,
          400
        );
      }

      const existingEvent = await tx.paymentEvent.findUnique({
        where: { orderId_transactionStatus: { orderId, transactionStatus } },
        select: { id: true },
      });
      if (existingEvent) {
        return {
          status: "success",
          message: "Payment event already processed (idempotent)",
        };
      }

      const paymentEvent = await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          orderId,
          transactionStatus,
          rawPayload: payload as object,
          signatureValid: true,
          signature: signatureKey,
          processedAt: new Date(),
        },
      });

      const alreadySettled = payment.status === "SETTLEMENT" || payment.status === "PAID";
      if (alreadySettled) {
        // capture → settlement for cards, or a late failure notice: never grant twice
        // and never downgrade a paid order.
        return {
          status: "success",
          message: "Payment already settled",
        };
      }

      if (isSuccessfulTransactionStatus(transactionStatus)) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "SETTLEMENT",
            midtransId: payload.transaction_id,
            settledAt: new Date(),
          },
        });

        const topupCredits = PaymentService.parseTopupCreditsFromOrderId(orderId);

        if (topupCredits) {
          await CreditService.topupCredits(
            payment.userId,
            topupCredits,
            payment.id,
            {
              paymentEventId: paymentEvent.id,
              orderId,
              reason: "topup_settlement",
            },
            tx
          );

          logger.info("webhook_topup_processed", {
            orderId,
            userId: payment.userId,
            creditsAdded: topupCredits,
          });
        } else {
          await grantSubscriptionForPayment(tx, payment, orderId, paymentEvent.id);
        }
      } else {
        const newStatus = mapTransactionStatus(transactionStatus);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus,
            midtransId: payload.transaction_id ?? payment.midtransId,
          },
        });
      }

      return {
        status: "success",
        message: `Payment processed: ${transactionStatus}`,
      };
    });
  },

  async processExpiredSubscriptions(): Promise<number> {
    const now = new Date();
    const expired = await prisma.subscription.findMany({
      where: { expiresAt: { lt: now }, status: "ACTIVE" },
    });

    let count = 0;
    for (const sub of expired) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "EXPIRED" },
      });
      count++;
      logger.info("subscription_expired_processed", {
        userId: sub.userId,
        subscriptionId: sub.id,
      });
    }

    return count;
  },

  async processMonthlyCreditRenewals(): Promise<number> {
    const now = new Date();
    const activeSubs = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { user: true },
    });

    let refreshed = 0;
    for (const sub of activeSubs) {
      // Check and grant in one serializable transaction so overlapping cron runs
      // (or a settlement landing mid-run) cannot grant the same month twice.
      const granted = await runLedgerTransaction(async (tx) => {
        const lastRefresh = await tx.creditLedger.findFirst({
          where: { userId: sub.userId, type: "MONTHLY_REFRESH" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });

        const daysSince = lastRefresh
          ? (now.getTime() - lastRefresh.createdAt.getTime()) / DAY_MS
          : Number.POSITIVE_INFINITY;
        if (daysSince < RENEWAL_INTERVAL_DAYS) return false;

        // Only grant a new month when the paid period still covers it; a 1-month
        // plan must not receive a second allotment a few days before it expires.
        if (sub.expiresAt && (sub.expiresAt.getTime() - now.getTime()) / DAY_MS < RENEWAL_INTERVAL_DAYS) {
          return false;
        }

        await CreditService.refreshMonthlyCredits(sub.userId, undefined, tx);

        const nextRenewal = new Date(now);
        nextRenewal.setDate(nextRenewal.getDate() + SUBSCRIPTION_DAYS);
        await tx.subscription.update({
          where: { id: sub.id },
          data: { renewalDate: nextRenewal },
        });
        return true;
      });

      if (!granted) continue;
      refreshed++;
      logger.info("subscription_monthly_refresh", { userId: sub.userId, tier: sub.tier });
    }

    return refreshed;
  },
};

// Keep legacy helper for confirm route (localhost without webhook)
export async function activateSubscriptionForOrder(orderId: string) {
  const payment = await prisma.payment.findUnique({ where: { orderId } });
  if (!payment) return { ok: false as const, error: "Payment not found" };
  if (payment.status === "SETTLEMENT" || payment.status === "PAID") {
    return { ok: true as const, alreadyPaid: true };
  }

  const tx = await getTransactionStatus(orderId);
  if (!tx || !isSuccessfulTransactionStatus(tx.transaction_status)) {
    return { ok: false as const, error: "Payment belum settlement" };
  }

  if (!tx.signature_key) {
    return { ok: false as const, error: "Signature tidak tersedia dari Midtrans" };
  }

  await PaymentService.handleWebhook({
    order_id: tx.order_id,
    transaction_id: tx.order_id,
    gross_amount: tx.gross_amount,
    transaction_status: tx.transaction_status,
    status_code: tx.status_code,
    signature_key: tx.signature_key,
  });

  return { ok: true as const, alreadyPaid: false };
}
