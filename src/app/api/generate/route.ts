import { NextRequest } from "next/server";
import { z } from "zod";
import { estimateGenerationCredits, orchestrateGeneration } from "@/lib/ai/orchestrator";
import { flushQueue } from "@/lib/ai/db-writer";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/prisma";
import type { GenerationInput } from "@/lib/ai/prompts/shared";
import type { Prisma } from "@prisma/client";
import {
  getSupabaseUser,
  getEffectiveTier,
  assertCanGenerate,
  syncDbUser,
  normalizeLegacyModelId,
} from "@/lib/auth";
import { tierIdToUserPlan } from "@/lib/services/tier.service";
import { CreditService, CreditServiceError } from "@/lib/services/credit.service";
import { checkDailyLimit } from "@/lib/ai/tier-enforcer";
import {
  FRAMEWORKS,
  DESIGN_PRESETS,
  AGENT_TOOLS,
  DATABASES,
  DEPLOYMENTS,
  PROGRAMMING_LANGUAGES,
  ANIMATION_LIBRARIES,
  STACK_BUNDLES,
  VERSION_CONTROLS,
  DESIGN_HANDOFF_TOOLS,
  PROJECT_MANAGEMENT_TOOLS,
  DOCUMENT_FILE_KEYS,
  PRODUCT_TYPES,
  PROJECT_STAGES,
  MODEL_CLASS_SLUGS,
  FEATURE_PRIORITIES,
  FRONTEND_TIER_SLUGS,
} from "@/lib/config/options";
import type { ModelClassId } from "@/lib/config/tiers";
import { capFormInput } from "@/lib/ai-gateway/context-builder";
import { sanitizePerDocumentModelClass, legacyTierSlugToUserTier } from "@/lib/config/documents";
import { readJsonBody, RequestBodyError } from "@/lib/http/read-json-body";

const MAX_GENERATE_BODY_BYTES = 256_000;

const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(FEATURE_PRIORITIES),
});

const GenerationInputSchema = z.object({
  idea: z.string().min(50).max(12000),
  clarifications: z.object({
    platform: z.enum(["web", "mobile", "desktop", "api"]).optional(),
    monetization: z.enum(["free", "paid", "freemium", "open-source"]).optional(),
    scope: z.enum(["mvp", "full-product", "experiment"]).optional(),
  }),
  presets: z.object({
    framework: z.enum(FRAMEWORKS),
    design: z.enum(DESIGN_PRESETS),
    agentTool: z.enum(AGENT_TOOLS),
    database: z.enum(DATABASES).optional(),
    deployment: z.enum(DEPLOYMENTS).optional(),
    programmingLanguage: z.enum(PROGRAMMING_LANGUAGES).optional(),
    animationLibrary: z.enum(ANIMATION_LIBRARIES).optional(),
    stackBundle: z.enum(STACK_BUNDLES).optional(),
    designReferenceNote: z.string().max(200).optional(),
    versionControl: z.enum(VERSION_CONTROLS).optional(),
    designHandoffTool: z.enum(DESIGN_HANDOFF_TOOLS).optional(),
    projectManagementTool: z.enum(PROJECT_MANAGEMENT_TOOLS).optional(),
  }),
  productType: z.enum(PRODUCT_TYPES).optional(),
  projectStage: z.enum(PROJECT_STAGES).optional(),
  features: z.array(FeatureSchema).optional(),
  perDocumentModelClass: z
    .record(z.string(), z.enum(MODEL_CLASS_SLUGS))
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      for (const key of Object.keys(val)) {
        if (!(DOCUMENT_FILE_KEYS as readonly string[]).includes(key)) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown document key: ${key}`,
            path: ["perDocumentModelClass", key],
          });
        }
      }
    }),
  tier: z.enum(FRONTEND_TIER_SLUGS).optional(),
  modelId: z.string().optional(),
  selectedDocs: z.array(z.enum(DOCUMENT_FILE_KEYS)).optional(),
  /** Ignored: the hold is always computed on the server. Accepted for older clients. */
  estimatedCredits: z.number().int().nonnegative().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_GENERATE_BODY_BYTES);
  } catch (error) {
    const requestError = error instanceof RequestBodyError ? error : null;
    return new Response(JSON.stringify({ error: requestError?.message ?? "Invalid JSON body" }), {
      status: requestError?.statusCode ?? 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = GenerationInputSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return new Response(JSON.stringify({ error: "Login wajib untuk generate dokumen." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  await syncDbUser(supabaseUser);
  const userId = supabaseUser.id;
  const effectiveTier = await getEffectiveTier(userId);
  const normalizedModelId = normalizeLegacyModelId(parsed.data.modelId);

  // Balance is enforced atomically by reserveCredit below; the gate checks plan and model only.
  const gate = await assertCanGenerate(userId, effectiveTier, normalizedModelId, 0);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error }), {
      status: gate.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const planSlug = tierIdToUserPlan(gate.tierId);

  const dailyCheck = await checkDailyLimit(userId, planSlug);
  if (!dailyCheck.allowed) {
    return new Response(JSON.stringify({ error: dailyCheck.reason }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const input: GenerationInput = {
    ...parsed.data,
    idea: capFormInput(parsed.data.idea, gate.tierId),
    modelId: normalizedModelId,
    tier: planSlug,
    perDocumentModelClass: sanitizePerDocumentModelClass(
      parsed.data.perDocumentModelClass,
      legacyTierSlugToUserTier(planSlug),
    ),
  };

  const estimatedCredits = estimateGenerationCredits(input);

  let projectId: string;
  let reservationId: string | null = null;

  try {
    const project = await prisma.project.create({
      data: {
        idea: input.idea,
        clarifications: input.clarifications as unknown as Prisma.InputJsonValue,
        presets: input.presets as unknown as Prisma.InputJsonValue,
        planData: {
          productType: parsed.data.productType,
          projectStage: parsed.data.projectStage,
          features: parsed.data.features,
          selectedDocs: parsed.data.selectedDocs,
          perDocumentModelClass: input.perDocumentModelClass,
          estimatedCredits,
        },
        status: "GENERATING",
        userId,
      },
    });
    projectId = project.id;

    const reservation = await CreditService.reserveCredit(userId, estimatedCredits, projectId, {
      selectedDocs: parsed.data.selectedDocs,
    });
    reservationId = reservation.reservationId;
  } catch (err) {
    if (err instanceof CreditServiceError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Failed to create project:", err);
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let clientGone = false;
  const stream = new ReadableStream({
    async start(controller) {
      // The client may disconnect mid-generation; keep generating and settling
      // credits, just stop writing to the closed stream.
      function send(data: object) {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          clientGone = true;
        }
      }

      send({ type: "project_created", projectId });
      let generationSucceeded = false;
      let generationErrored = false;
      let settled = false;
      const generatedDocs: Array<{
        fileKey: string;
        modelClass: ModelClassId;
        promptVersion?: string;
        modelRoute?: string;
        tokensUsed: number;
      }> = [];

      try {
        for await (const event of orchestrateGeneration(input, projectId)) {
          send(event);
          if (event.type === "all_done") {
            generationSucceeded = event.success !== false;
            if (generatedDocs.length === 0) {
              const docs = event.documentsGenerated ?? [];
              for (const doc of docs) {
                generatedDocs.push({
                  fileKey: doc.fileKey,
                  modelClass: doc.modelClass,
                  promptVersion: doc.promptVersion,
                  modelRoute: doc.modelRoute,
                  tokensUsed: doc.tokensUsed,
                });
              }
            }
          }

          if (
            event.type === "file_done" &&
            event.fileKey &&
            event.modelClass &&
            typeof event.tokensUsed === "number"
          ) {
            generatedDocs.push({
              fileKey: event.fileKey,
              modelClass: event.modelClass as ModelClassId,
              promptVersion: event.promptVersion,
              modelRoute: event.modelRoute ?? event.usedModel,
              tokensUsed: event.tokensUsed,
            });
          }
        }
      } catch (err) {
        generationErrored = true;
        const message = err instanceof Error ? err.message : "Unexpected server error";
        send({ type: "error", error: message });
      } finally {
        // Generated files are written through a background queue; make sure they
        // are persisted before the function can be frozen.
        await flushQueue().catch(() => {});

        if (reservationId) {
          try {
            if (generatedDocs.length > 0) {
              // Charge only for documents actually delivered (partial success included).
              await CreditService.commitCredit(userId, reservationId, projectId, generatedDocs, {
                partial: !generationSucceeded,
              });
            } else {
              await CreditService.releaseReservation(userId, reservationId, "generation_failed");
            }
            settled = true;
          } catch (error) {
            logger.error("generation_credit_settlement_failed", {
              userId,
              projectId,
              reservationId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          if (!settled) {
            await CreditService.releaseReservation(
              userId,
              reservationId,
              "settlement_failed",
            ).catch(() => {});
          }
        }

        if (generationErrored) {
          await prisma.project
            .update({
              where: { id: projectId },
              data: { status: generatedDocs.length > 0 ? "DONE" : "FAILED" },
            })
            .catch(() => {});
        }

        if (!clientGone) {
          try {
            controller.close();
          } catch {
            // already closed by the runtime
          }
        }
      }
    },
    cancel() {
      clientGone = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
