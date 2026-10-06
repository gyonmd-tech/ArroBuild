export class CreditServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "CreditServiceError";
  }
}

export interface ReservationHoldLike {
  id: string;
  userId: string;
  type: string;
  amount: number;
  projectId?: string | null;
}

export function assertOwnedReservation(
  reservation: ReservationHoldLike,
  userId: string,
  projectId?: string
): number {
  if (reservation.type !== "RESERVATION_HOLD") {
    throw new CreditServiceError(
      "INVALID_RESERVATION",
      `Reservation ${reservation.id} bukan RESERVATION_HOLD`,
      400
    );
  }

  if (reservation.userId !== userId) {
    throw new CreditServiceError(
      "RESERVATION_MISMATCH",
      "Reservation bukan milik user yang sedang aktif",
      403
    );
  }

  if (projectId !== undefined && reservation.projectId !== projectId) {
    throw new CreditServiceError(
      "RESERVATION_PROJECT_MISMATCH",
      "Reservation tidak terkait dengan project yang diminta",
      403
    );
  }

  return Math.abs(reservation.amount);
}

/**
 * Settle a hold against actual usage. Usage above the hold is capped at the
 * hold (the user was quoted the hold, and the work is already delivered), so
 * settlement never fails after content has been streamed.
 */
export function calculateReservationSettlement(
  currentBalance: number,
  heldCredits: number,
  actualCreditsUsed: number
): {
  chargedCredits: number;
  uncharged: number;
  chargeBalanceAfter: number;
  releaseAmount: number;
  finalBalance: number;
  surplus: number;
} {
  if (!Number.isInteger(actualCreditsUsed) || actualCreditsUsed < 0) {
    throw new CreditServiceError(
      "INVALID_CREDIT_USAGE",
      "Pemakaian kredit harus berupa bilangan bulat non-negatif",
      400
    );
  }

  const chargedCredits = Math.min(actualCreditsUsed, heldCredits);
  const chargeBalanceAfter = currentBalance - chargedCredits;
  return {
    chargedCredits,
    uncharged: actualCreditsUsed - chargedCredits,
    chargeBalanceAfter,
    releaseAmount: heldCredits,
    finalBalance: chargeBalanceAfter + heldCredits,
    surplus: heldCredits - chargedCredits,
  };
}

export function reservationIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const reservationId = (metadata as Record<string, unknown>).reservationId;
  return typeof reservationId === "string" && reservationId.length > 0
    ? reservationId
    : null;
}
