import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateWithFallback } from "@/lib/ai/generate-with-fallback";
import {
  generateVision,
  isOpenRouterConfigured,
} from "@/lib/ai/openrouter-vision";
import { getSupabaseUser, syncDbUser } from "@/lib/auth";
import {
  buildScreenshotVisionPrompt,
  estimateCopyStudioCredits,
} from "@/lib/config/copy-studio-prompt";
import { estimateStackAdvisorCredits } from "@/lib/config/stack-advisor-prompt";
import { MINI_TOOLS, type MiniToolId } from "@/lib/config/mini-tools";
import { CreditService } from "@/lib/services/credit.service";
import {
  assertMiniToolAccess,
  reserveMiniToolCredits,
  settleMiniToolReservation,
} from "@/lib/services/mini-tools.service";
import { TierCapabilityError } from "@/lib/services/tier-capabilities";
import { readJsonBody, RequestBodyError } from "@/lib/http/read-json-body";
import { enforceUserRouteLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_TOOL_BODY_BYTES = 20_000_000;

const ImageSchema = z.object({
  sectionLabel: z.string().max(120).optional(),
  dataUrl: z.string().min(32).max(1_800_000),
});

const BodySchema = z.object({
  toolId: z.string().min(1).max(64),
  input: z.record(z.string().max(64), z.string().max(12_000)).refine(
    (input) => Object.keys(input).length <= 30,
    "Terlalu banyak field input"
  ),
  images: z.array(ImageSchema).max(10).optional(),
  reserve: z.boolean().optional(),
});

function resolveCredits(
  toolId: MiniToolId,
  input: Record<string, string>,
  imageCount: number
): number {
  if (toolId === "copy-studio") {
    return estimateCopyStudioCredits({
      mode: input.mode ?? "scratch",
      scratchSubMode: input.scratchSubMode,
      sectionCount: imageCount > 0 ? imageCount : Number(input.sectionCount || 1),
    });
  }
  if (toolId === "stack-advisor") {
    return estimateStackAdvisorCredits(input.mode ?? "cepat");
  }
  return MINI_TOOLS[toolId].credits;
}

export async function POST(req: NextRequest) {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return NextResponse.json({ error: "Login diperlukan untuk mini tools." }, { status: 401 });
  }

  const rateLimited = await enforceUserRouteLimit(supabaseUser.id, "tools");
  if (rateLimited) return rateLimited;

  const dbUser = await syncDbUser(supabaseUser);

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_TOOL_BODY_BYTES);
  } catch (error) {
    const requestError = error instanceof RequestBodyError ? error : null;
    return NextResponse.json(
      { error: requestError?.message ?? "Invalid JSON" },
      { status: requestError?.statusCode ?? 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 422 });
  }

  const toolId = parsed.data.toolId as MiniToolId;
  const tool = MINI_TOOLS[toolId];
  if (!tool) {
    return NextResponse.json({ error: "Tool tidak ditemukan" }, { status: 404 });
  }

  for (const field of tool.fields) {
    if (field.required && !parsed.data.input[field.key]?.trim()) {
      return NextResponse.json(
        { error: `Field "${field.label}" wajib diisi.` },
        { status: 422 }
      );
    }
  }

  const images = parsed.data.images ?? [];

  if (toolId === "copy-studio" && parsed.data.input.mode === "screenshot") {
    if (images.length === 0) {
      return NextResponse.json(
        { error: "Mode Screenshot membutuhkan minimal 1 gambar." },
        { status: 422 }
      );
    }
    if (!isOpenRouterConfigured()) {
      return NextResponse.json(
        {
          error:
            "Vision belum dikonfigurasi (OPENROUTER_API_KEY). Hubungi admin atau coba mode Template.",
          code: "VISION_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }
  }

  try {
    await assertMiniToolAccess(dbUser.id, toolId);
  } catch (err) {
    if (err instanceof TierCapabilityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  const creditsNeeded = resolveCredits(toolId, parsed.data.input, images.length);
  let reservationId: string | null = null;

  try {
    // Hold credits before calling the model so concurrent runs cannot spend
    // the same balance and a 402 never arrives after the AI cost is incurred.
    const reservation = await reserveMiniToolCredits(
      dbUser.id,
      toolId,
      {
        mode: parsed.data.input.mode,
        templateId: parsed.data.input.templateId,
        sectionCount: images.length || undefined,
      },
      creditsNeeded
    );
    reservationId = reservation.reservationId;

    let output: string;

    if (toolId === "copy-studio" && parsed.data.input.mode === "screenshot") {
      const visionPrompt = buildScreenshotVisionPrompt({
        productName: parsed.data.input.productName,
        targetUser: parsed.data.input.targetUser,
        mainValue: parsed.data.input.mainValue,
        sectionLabels: images.map(
          (img, i) => img.sectionLabel?.trim() || `Section ${i + 1}`
        ),
      });
      output = await generateVision({
        prompt: visionPrompt,
        images: images.map((img) => ({ url: img.dataUrl })),
        temperature: 0.4,
        maxOutputTokens: Math.min(tool.maxOutputTokens * 2, 6000),
      });
    } else {
      const prompt = tool.buildPrompt(parsed.data.input);
      output = await generateWithFallback(prompt, {
        modelClass: tool.modelClass,
        temperature: 0.6,
        maxOutputTokens: tool.maxOutputTokens,
      });
    }

    const settled = await settleMiniToolReservation(
      dbUser.id,
      reservationId,
      toolId,
      {
        mode: parsed.data.input.mode,
        templateId: parsed.data.input.templateId,
        sectionCount: images.length || undefined,
      },
      creditsNeeded
    );
    const balanceAfter = settled.balanceAfter;

    return NextResponse.json({
      output,
      creditsUsed: creditsNeeded,
      balanceAfter,
      toolId,
    });
  } catch (err) {
    if (reservationId) {
      await CreditService.releaseReservation(
        dbUser.id,
        reservationId,
        "tool_generation_failed"
      ).catch(() => {});
    }

    if (err instanceof TierCapabilityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    console.error("Mini tool error:", err);
    return NextResponse.json({ error: "Gagal menjalankan mini tool." }, { status: 500 });
  }
}

export async function GET() {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return NextResponse.json({ tools: [], requiresLogin: true });
  }

  const dbUser = await syncDbUser(supabaseUser);
  const { listToolsForTier } = await import("@/lib/config/mini-tools");
  const { getUserTierId } = await import("@/lib/services/tier-capabilities");
  const tierId = await getUserTierId(dbUser.id);
  const tools = listToolsForTier(tierId).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    credits: t.credits,
  }));

  return NextResponse.json({ tools, tierId });
}
