import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseUser, syncDbUser } from "@/lib/auth";
import {
  InterviewService,
  InterviewServiceError,
} from "@/lib/services/interview.service";
import { CreditServiceError } from "@/lib/services/credit.service";
import {
  INTERVIEW_MAX_TURNS,
  hasMinimumFields,
  runInterviewTurn,
  type InterviewMessage,
} from "@/lib/ai/interview";
import { logger } from "@/lib/logger";
import { enforceUserRouteLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const StartSchema = z.object({
  action: z.literal("start"),
});

const TurnSchema = z.object({
  action: z.literal("turn"),
  sessionId: z.string().min(1),
  userMessage: z.string().min(1).max(1500),
});

const CompleteSchema = z.object({
  action: z.literal("complete"),
  sessionId: z.string().min(1),
  status: z.enum(["COMPLETED", "FALLBACK"]).optional(),
});

const AbandonSchema = z.object({
  action: z.literal("abandon"),
  sessionId: z.string().min(1),
});

const QuotaSchema = z.object({
  action: z.literal("quota"),
});

const BodySchema = z.discriminatedUnion("action", [
  StartSchema,
  TurnSchema,
  CompleteSchema,
  AbandonSchema,
  QuotaSchema,
]);

function errorResponse(error: unknown) {
  if (
    error instanceof InterviewServiceError ||
    error instanceof CreditServiceError
  ) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  logger.error("interview_api_error", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "Terjadi kesalahan pada layanan wawancara" },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return NextResponse.json(
      { error: "Login wajib untuk Mode Dipandu AI", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const rateLimited = await enforceUserRouteLimit(supabaseUser.id, "interview");
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  try {
    const dbUser = await syncDbUser(supabaseUser);
    const data = parsed.data;

    if (data.action === "quota") {
      const quota = await InterviewService.getQuota(dbUser.id);
      return NextResponse.json({ quota });
    }

    if (data.action === "start") {
      const { session, quota, greeting } = await InterviewService.startSession(
        dbUser.id
      );
      return NextResponse.json({
        sessionId: session.id,
        greeting,
        messages: [{ role: "assistant", content: greeting }],
        filledFields: {},
        turnCount: 0,
        maxTurns: INTERVIEW_MAX_TURNS,
        quota,
        isComplete: false,
        shouldFallback: false,
      });
    }

    if (data.action === "turn") {
      const session = await InterviewService.getOwnedSession(
        data.sessionId,
        dbUser.id
      );

      if (session.status !== "ACTIVE") {
        return NextResponse.json(
          {
            error: "Sesi sudah ditutup",
            code: "SESSION_CLOSED",
            status: session.status,
            filledFields: InterviewService.getSessionFields(session),
          },
          { status: 409 }
        );
      }

      if (session.turnCount >= INTERVIEW_MAX_TURNS) {
        const { session: updated, filledFields } =
          await InterviewService.completeSession(
            session.id,
            dbUser.id,
            "FALLBACK"
          );
        return NextResponse.json({
          sessionId: updated.id,
          assistantMessage:
            "Sepertinya ini butuh diskusi lebih detail — yuk lanjut isi sisanya manual, jawabanmu sejauh ini tetap tersimpan.",
          messages: InterviewService.getSessionMessages(updated),
          filledFields,
          turnCount: updated.turnCount,
          maxTurns: INTERVIEW_MAX_TURNS,
          isComplete: false,
          shouldFallback: true,
          status: updated.status,
        });
      }

      const existingMessages = InterviewService.getSessionMessages(session);
      const existingFields = InterviewService.getSessionFields(session);

      const turn = await runInterviewTurn({
        filledFields: existingFields,
        messages: existingMessages,
        userMessage: data.userMessage,
        turnCount: session.turnCount,
      });

      const messages: InterviewMessage[] = [
        ...existingMessages,
        { role: "user", content: data.userMessage },
        { role: "assistant", content: turn.assistantMessage },
      ];

      let nextStatus: "ACTIVE" | "FALLBACK" | "COMPLETED" = "ACTIVE";
      if (turn.shouldFallback) nextStatus = "FALLBACK";
      else if (turn.isComplete && hasMinimumFields(turn.filledFields)) {
        // Keep ACTIVE so client can still complete explicitly, but flag isComplete
        nextStatus = "ACTIVE";
      }

      const updated = await InterviewService.updateAfterTurn({
        sessionId: session.id,
        userId: dbUser.id,
        turnCount: turn.turnCount,
        filledFields: turn.filledFields,
        messages,
        status: nextStatus === "FALLBACK" ? "FALLBACK" : "ACTIVE",
      });

      if (nextStatus === "FALLBACK") {
        await InterviewService.completeSession(
          session.id,
          dbUser.id,
          "FALLBACK"
        );
      }

      return NextResponse.json({
        sessionId: updated.id,
        assistantMessage: turn.assistantMessage,
        messages,
        filledFields: turn.filledFields,
        turnCount: turn.turnCount,
        maxTurns: INTERVIEW_MAX_TURNS,
        isComplete: turn.isComplete && !turn.shouldFallback,
        shouldFallback: turn.shouldFallback,
        status: turn.shouldFallback ? "FALLBACK" : updated.status,
      });
    }

    if (data.action === "abandon") {
      const session = await InterviewService.abandonSession(
        data.sessionId,
        dbUser.id
      );
      return NextResponse.json({
        sessionId: session.id,
        status: session.status,
      });
    }

    // complete
    const desired =
      data.status ??
      (hasMinimumFields(
        InterviewService.getSessionFields(
          await InterviewService.getOwnedSession(data.sessionId, dbUser.id)
        )
      )
        ? "COMPLETED"
        : "FALLBACK");

    const { session, filledFields } = await InterviewService.completeSession(
      data.sessionId,
      dbUser.id,
      desired
    );

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      filledFields,
      turnCount: session.turnCount,
      maxTurns: INTERVIEW_MAX_TURNS,
      isComplete: hasMinimumFields(filledFields),
      messages: InterviewService.getSessionMessages(session),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return NextResponse.json(
      { error: "Login wajib", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const dbUser = await syncDbUser(supabaseUser);
    const quota = await InterviewService.getQuota(dbUser.id);
    return NextResponse.json({
      quota,
      maxTurns: INTERVIEW_MAX_TURNS,
      freeSessionsPerMonth: 3,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
