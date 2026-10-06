import {
  assertOwnedReservation,
  calculateReservationSettlement,
  CreditServiceError,
  reservationIdFromMetadata,
} from "../src/lib/services/credit-ledger";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function captureError(run: () => unknown): CreditServiceError | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof CreditServiceError ? error : null;
  }
}

console.log("\n=== Credit Ledger Invariant Tests ===\n");

const hold = {
  id: "hold-a",
  userId: "user-a",
  type: "RESERVATION_HOLD",
  amount: -8,
  projectId: "project-a",
};

assert("owned hold returns absolute held credits", assertOwnedReservation(hold, "user-a") === 8);
assert(
  "owned hold accepts matching project",
  assertOwnedReservation(hold, "user-a", "project-a") === 8
);

const wrongOwner = captureError(() => assertOwnedReservation(hold, "user-b"));
assert("cross-user reservation is rejected", wrongOwner?.code === "RESERVATION_MISMATCH");
assert("cross-user reservation returns 403", wrongOwner?.statusCode === 403);
assert(
  "cross-user error does not disclose either user id",
  !wrongOwner?.message.includes("user-a") && !wrongOwner?.message.includes("user-b")
);

const wrongProject = captureError(() =>
  assertOwnedReservation(hold, "user-a", "project-b")
);
assert(
  "cross-project reservation is rejected",
  wrongProject?.code === "RESERVATION_PROJECT_MISMATCH"
);

const wrongType = captureError(() =>
  assertOwnedReservation({ ...hold, type: "GENERATE_DOCUMENT" }, "user-a")
);
assert("non-hold ledger entry is rejected", wrongType?.code === "INVALID_RESERVATION");

const partial = calculateReservationSettlement(92, 8, 5);
assert("settlement releases the complete hold", partial.releaseAmount === 8);
assert("partial usage ends at original balance minus actual usage", partial.finalBalance === 95);
assert("partial usage reports unused surplus", partial.surplus === 3);

const full = calculateReservationSettlement(92, 8, 8);
assert("full usage ends at original balance minus full usage", full.finalBalance === 92);

const zero = calculateReservationSettlement(92, 8, 0);
assert("zero usage restores the original balance", zero.finalBalance === 100);

const overcharge = calculateReservationSettlement(92, 8, 9);
assert("usage above hold is capped at the hold", overcharge.chargedCredits === 8);
assert("capped usage ends at original balance minus hold", overcharge.finalBalance === 92);
assert("capped usage reports the uncharged excess", overcharge.uncharged === 1);
assert("capped usage has no surplus", overcharge.surplus === 0);

const fractional = captureError(() => calculateReservationSettlement(92, 8, 1.5));
assert("fractional credit usage is rejected", fractional?.code === "INVALID_CREDIT_USAGE");

assert(
  "release metadata exposes its reservation id",
  reservationIdFromMetadata({ reservationId: "hold-a" }) === "hold-a"
);
assert("malformed release metadata is ignored", reservationIdFromMetadata([]) === null);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
