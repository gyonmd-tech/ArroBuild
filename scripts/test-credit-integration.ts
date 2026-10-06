/**
 * Database-backed credit & payment invariants. Requires a disposable Postgres
 * with migrations applied (DATABASE_URL). Never point this at production:
 * it creates and deletes its own users.
 *
 *   DATABASE_URL=postgresql://... npm run test:credits:db
 */
import { createHash } from "crypto";

process.env.MIDTRANS_SERVER_KEY ??= "SB-Mid-server-integration-test-key-000000";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run against NODE_ENV=production");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db/prisma");
  const { CreditService } = await import("../src/lib/services/credit.service");
  const { PaymentService } = await import("../src/lib/services/payment.service");

  const runTag = `itest-${Date.now()}`;
  const userIds: string[] = [];

  async function createUser(label: string, credits = 0) {
    const id = `${runTag}-${label}`;
    userIds.push(id);
    await prisma.user.create({
      data: { id, email: `${id}@example.test`, tier: "CORE", creditBalance: 0 },
    });
    if (credits > 0) await CreditService.adjustCredits(id, credits, "test_seed");
    return id;
  }

  async function ledgerSum(userId: string) {
    const agg = await prisma.creditLedger.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  function sign(orderId: string, statusCode: string, grossAmount: string) {
    return createHash("sha512")
      .update(orderId + statusCode + grossAmount + process.env.MIDTRANS_SERVER_KEY)
      .digest("hex");
  }

  function notification(orderId: string, status: string, gross: string) {
    const statusCode = status === "pending" ? "201" : status === "settlement" ? "200" : "202";
    return PaymentService.handleWebhook({
      order_id: orderId,
      transaction_id: `tx-${orderId}`,
      gross_amount: gross,
      transaction_status: status,
      status_code: statusCode,
      signature_key: sign(orderId, statusCode, gross),
    });
  }

  try {
    console.log("\n=== Webhook: pending → settlement (subscription) ===\n");
    {
      const userId = await createUser("sub");
      const orderId = `arro-${runTag.slice(-8)}-core-${Date.now()}`;
      await prisma.payment.create({
        data: { orderId, userId, tier: "CORE", amount: 99000, status: "PENDING" },
      });

      await notification(orderId, "pending", "99000.00");
      let payment = await prisma.payment.findUniqueOrThrow({ where: { orderId } });
      assert("pending notification keeps payment pending", payment.status === "PENDING");

      await notification(orderId, "settlement", "99000.00");
      payment = await prisma.payment.findUniqueOrThrow({ where: { orderId } });
      const sub = await prisma.subscription.findUnique({ where: { userId } });
      const balanceAfterSettle = await ledgerSum(userId);
      assert("settlement after pending marks payment settled", payment.status === "SETTLEMENT");
      assert("settlement after pending activates subscription", sub?.status === "ACTIVE");
      assert("settlement grants monthly credits", balanceAfterSettle > 0, balanceAfterSettle);

      await notification(orderId, "settlement", "99000.00");
      await notification(orderId, "expire", "99000.00");
      payment = await prisma.payment.findUniqueOrThrow({ where: { orderId } });
      assert(
        "duplicate settlement does not grant twice",
        (await ledgerSum(userId)) === balanceAfterSettle,
      );
      assert("late expire notice does not downgrade a paid order", payment.status === "SETTLEMENT");
    }

    console.log("\n=== Webhook: concurrent duplicate settlements (top-up) ===\n");
    {
      const userId = await createUser("topup");
      const orderId = `arro-topup-${runTag.slice(-8)}-500-${Date.now()}`;
      await prisma.payment.create({
        data: { orderId, userId, tier: "BASE", amount: 25000, status: "PENDING" },
      });

      await Promise.allSettled([
        notification(orderId, "settlement", "25000.00"),
        notification(orderId, "settlement", "25000.00"),
        notification(orderId, "settlement", "25000.00"),
      ]);
      assert(
        "parallel settlement retries grant top-up exactly once",
        (await ledgerSum(userId)) === 500,
        await ledgerSum(userId),
      );
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      assert(
        "cached balance matches ledger after top-up",
        user.creditBalance === 500,
        user.creditBalance,
      );
    }

    console.log("\n=== Reservations: no double spend under concurrency ===\n");
    {
      const userId = await createUser("race", 10);
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          CreditService.reserveCredit(userId, 4, `${runTag}-p${i}`),
        ),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const balance = await ledgerSum(userId);
      assert("only two 4-credit holds fit in a 10-credit balance", ok === 2, { ok, balance });
      assert("balance never goes negative", balance >= 0, balance);

      const toolUser = await createUser("tool-race", 5);
      await Promise.allSettled(
        Array.from({ length: 5 }, () => CreditService.chargeToolCredits(toolUser, 2, "test-tool")),
      );
      assert(
        "parallel tool charges never overdraw",
        (await ledgerSum(toolUser)) >= 0,
        await ledgerSum(toolUser),
      );
    }

    console.log("\n=== Settlement: overcharge, partial, release ===\n");
    {
      const userId = await createUser("settle", 100);
      const hold = await CreditService.reserveCredit(userId, 8, `${runTag}-proj`);
      const commit = await CreditService.commitCredit(
        userId,
        hold.reservationId,
        `${runTag}-proj`,
        [{ fileKey: "prd", modelClass: "MENENGAH", tokensUsed: 5000 }],
      );
      assert("usage above the hold is charged at the hold", commit.actualCreditsUsed === 8, commit);
      assert("balance reflects the capped charge", (await ledgerSum(userId)) === 92);

      let replayRejected = false;
      try {
        await CreditService.commitCredit(userId, hold.reservationId, `${runTag}-proj`, [
          { fileKey: "prd", modelClass: "HEMAT", tokensUsed: 10 },
        ]);
      } catch {
        replayRejected = true;
      }
      assert("a settled reservation cannot be committed again", replayRejected);

      const hold2 = await CreditService.reserveCredit(userId, 10, `${runTag}-proj2`);
      await Promise.allSettled([
        CreditService.releaseReservation(userId, hold2.reservationId),
        CreditService.releaseReservation(userId, hold2.reservationId),
      ]);
      assert(
        "concurrent releases restore the hold once",
        (await ledgerSum(userId)) === 92,
        await ledgerSum(userId),
      );

      const revisionHold = await CreditService.reserveCredit(userId, 3, `${runTag}-proj3`);
      const revision = await CreditService.commitRevision(
        userId,
        revisionHold.reservationId,
        `${runTag}-proj3`,
      );
      assert(
        "revision without an explicit amount charges the quoted hold",
        revision.actualCreditsUsed === 3,
      );
    }

    console.log("\n=== Stale reservation sweep ===\n");
    {
      const userId = await createUser("stale", 20);
      const hold = await CreditService.reserveCredit(userId, 7, `${runTag}-stale`);
      await prisma.creditLedger.update({
        where: { id: hold.reservationId },
        data: { createdAt: new Date(Date.now() - 60 * 60_000) },
      });
      await CreditService.releaseStaleReservations(15);
      assert(
        "orphaned hold is released by the sweep",
        (await ledgerSum(userId)) === 20,
        await ledgerSum(userId),
      );
    }

    console.log("\n=== Monthly renewal ===\n");
    {
      const day = 24 * 60 * 60_000;
      const oneMonth = await createUser("renew-1m");
      const threeMonth = await createUser("renew-3m");
      for (const [userId, daysLeft] of [
        [oneMonth, 2],
        [threeMonth, 62],
      ] as const) {
        await prisma.subscription.create({
          data: {
            userId,
            tier: "CORE",
            status: "ACTIVE",
            expiresAt: new Date(Date.now() + daysLeft * day),
          },
        });
        const entry = await prisma.creditLedger.create({
          data: { userId, type: "MONTHLY_REFRESH", amount: 100, balanceAfter: 100 },
        });
        await prisma.creditLedger.update({
          where: { id: entry.id },
          data: { createdAt: new Date(Date.now() - 29 * day) },
        });
      }

      await Promise.all([
        PaymentService.processMonthlyCreditRenewals(),
        PaymentService.processMonthlyCreditRenewals(),
      ]);

      assert(
        "a plan about to expire gets no extra month",
        (await ledgerSum(oneMonth)) === 100,
        await ledgerSum(oneMonth),
      );
      const threeMonthRefreshes = await prisma.creditLedger.count({
        where: { userId: threeMonth, type: "MONTHLY_REFRESH" },
      });
      assert(
        "a multi-month plan is refreshed exactly once despite overlapping runs",
        threeMonthRefreshes === 2,
        threeMonthRefreshes,
      );
      assert(
        "renewal does not mint rollover credits",
        (await prisma.creditLedger.count({ where: { userId: threeMonth, type: "ROLLOVER" } })) ===
          0,
      );
    }
  } finally {
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
