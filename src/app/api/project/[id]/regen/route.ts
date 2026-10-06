import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSupabaseUser, syncDbUser, getEffectiveTier } from "@/lib/auth";
import { DOCUMENT_FILE_KEYS } from "@/lib/config/options";
import { estimateGenerationCredits, orchestrateGeneration } from "@/lib/ai/orchestrator";
import { flushQueue } from "@/lib/ai/db-writer";
import { logger } from "@/lib/logger";
import type { GenerationInput } from "@/lib/ai/prompts/shared";
import { CreditService, CreditServiceError } from "@/lib/services/credit.service";
import { assertTierCapability, TierCapabilityError } from "@/lib/services/tier-capabilities";
import type { DocumentFileKey } from "@/lib/config/documents";
import type { ModelClassId } from "@/lib/config/tiers";
import { enforceUserRouteLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  fileKey: z.enum(DOCUMENT_FILE_KEYS),
});

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return NextResponse.json({ error: "Login wajib" }, { status: 401 });
  }

  const rateLimited = await enforceUserRouteLimit(supabaseUser.id, "regen");
  if (rateLimited) return rateLimited;

  const dbUser = await syncDbUser(supabaseUser);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "File key tidak valid" }, { status: 422 });
  }

  try {
    await assertTierCapability(dbUser.id, "regen_per_file");
  } catch (err) {
    if (err instanceof TierCapabilityError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { files: true },
  });

  if (!project || project.userId !== dbUser.id) {
    return NextResponse.json({ error: "Project tidak ditemukan" }, { status: 404 });
  }

  const fileKey = parsed.data.fileKey as DocumentFileKey;
  const planData = (project.planData ?? {}) as Record<string, unknown>;
  const effectiveTier = await getEffectiveTier(dbUser.id);

  const input: GenerationInput = {
    idea: project.idea,
    clarifications: (project.clarifications ?? {}) as GenerationInput["clarifications"],
    presets: (project.presets ?? {}) as unknown as GenerationInput["presets"],
    tier: effectiveTier,
    selectedDocs: [fileKey],
    productType: planData.productType as string | undefined,
    projectStage: planData.projectStage as string | undefined,
    features: planData.features as GenerationInput["features"],
    perDocumentModelClass:
      planData.perDocumentModelClass as GenerationInput["perDocumentModelClass"],
  };

  // Same resolution the orchestrator uses, including the project's per-document model class.
  const estimatedCredits = estimateGenerationCredits(input);

  let reservationId: string;
  try {
    const reservation = await CreditService.reserveCredit(dbUser.id, estimatedCredits, projectId, {
      reason: "per_file_regen",
      fileKey,
    });
    reservationId = reservation.reservationId;
  } catch (err) {
    if (err instanceof CreditServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  let newContent = "";
  let tokensUsed = 0;
  let modelClass: ModelClassId = "HEMAT";

  try {
    for await (const event of orchestrateGeneration(input, projectId)) {
      if (event.type === "file_done" && event.fileKey === fileKey && event.content) {
        newContent = event.content;
        tokensUsed = event.tokensUsed ?? Math.ceil(newContent.length / 4);
        modelClass = (event.modelClass as ModelClassId) ?? modelClass;
      }
      if (event.type === "error" && event.fileKey === fileKey) {
        throw new Error(event.error ?? "Regenerasi gagal");
      }
    }

    if (!newContent) {
      throw new Error("Tidak ada konten yang dihasilkan");
    }
  } catch (err) {
    await flushQueue().catch(() => {});
    await CreditService.releaseReservation(dbUser.id, reservationId, "regen_failed").catch(
      () => {},
    );
    const message = err instanceof Error ? err.message : "Regenerasi gagal";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await flushQueue().catch(() => {});

  let creditsUsed = estimatedCredits;
  try {
    const commit = await CreditService.commitCredit(dbUser.id, reservationId, projectId, [
      { fileKey, modelClass, tokensUsed },
    ]);
    creditsUsed = commit.actualCreditsUsed;
  } catch (error) {
    // Content is already saved; leave the hold to the stale-reservation sweep
    // rather than failing a request whose work was delivered.
    logger.error("regen_credit_commit_failed", {
      userId: dbUser.id,
      projectId,
      reservationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({
    ok: true,
    fileKey,
    content: newContent,
    creditsUsed,
  });
}
