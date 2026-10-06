-- Midtrans sends one notification per status change (pending → settlement).
-- Record one event per (orderId, transactionStatus) instead of one per order,
-- so a settlement arriving after a pending notice is no longer dropped.

ALTER TABLE "payment_events" ADD COLUMN "transactionStatus" TEXT NOT NULL DEFAULT '';

UPDATE "payment_events"
SET "transactionStatus" = COALESCE("rawPayload"->>'transaction_status', '');

DROP INDEX IF EXISTS "payment_events_orderId_key";

CREATE UNIQUE INDEX "payment_events_orderId_transactionStatus_key"
  ON "payment_events"("orderId", "transactionStatus");
