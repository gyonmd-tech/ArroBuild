/**
 * ArroDesign API — dedicated route
 * POST /api/tools/arrodesign
 *
 * Menggunakan pola streaming SSE untuk progress UX
 * (sesuai arsitektur: jangan biarkan user menatap layar kosong)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseUser, syncDbUser } from "@/lib/auth";
import {
  assertMiniToolAccess,
  reserveMiniToolCredits,
  settleMiniToolReservation,
} from "@/lib/services/mini-tools.service";
import { CreditService } from "@/lib/services/credit.service";
import { TierCapabilityError } from "@/lib/services/tier-capabilities";
import { runArroDesignEngine, getArroDesignCapabilities } from "@/lib/ai/arrodesign-engine";
import {
  estimateArroDesignCredits,
  type ArroDesignInputType,
} from "@/lib/config/arrodesign-prompt";
import type { ArroDesignProgress } from "@/lib/ai/arrodesign-engine";
import { logger } from "@/lib/logger";
import { SafeUrlError, validatePublicHttpUrl } from "@/lib/security/safe-url";
import { readJsonBody, RequestBodyError } from "@/lib/http/read-json-body";
import { enforceUserRouteLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 180; // analisis bisa lama — 3 menit
const MAX_ARRODESIGN_BODY_BYTES = 8_500_000;

const BodySchema = z.object({
  inputType: z.enum(["image", "url"]),
  referenceUrl: z.string().url().optional(),
  imageDataUrl: z.string().min(32).max(8_000_000).optional(),
  projectContext: z.string().max(3000).optional(),
  mode: z.enum(["project", "fresh"]).optional(),
});

/** SSE stream: kirim progress steps + result sebagai JSON lines */
export async function POST(req: NextRequest) {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
  }

  const rateLimited = await enforceUserRouteLimit(supabaseUser.id, "tools");
  if (rateLimited) return rateLimited;

  const dbUser = await syncDbUser(supabaseUser);

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_ARRODESIGN_BODY_BYTES);
  } catch (error) {
    const requestError = error instanceof RequestBodyError ? error : null;
    return NextResponse.json(
      { error: requestError?.message ?? "Invalid JSON" },
      { status: requestError?.statusCode ?? 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload tidak valid: " + parsed.error.issues[0]?.message },
      { status: 422 },
    );
  }

  const { inputType, referenceUrl, imageDataUrl, projectContext, mode } = parsed.data;

  // Validasi input sesuai tipe
  if (inputType === "image" && !imageDataUrl) {
    return NextResponse.json({ error: "Mode gambar membutuhkan imageDataUrl." }, { status: 422 });
  }
  if (inputType === "url" && !referenceUrl) {
    return NextResponse.json(
      { error: "Mode URL membutuhkan referenceUrl yang valid." },
      { status: 422 },
    );
  }

  if (inputType === "url" && referenceUrl) {
    try {
      await validatePublicHttpUrl(referenceUrl);
    } catch (error) {
      const message = error instanceof SafeUrlError ? error.message : "URL referensi tidak aman.";
      logger.warn("arrodesign_reference_url_rejected", {
        userId: dbUser.id,
        code: error instanceof SafeUrlError ? error.code : "UNKNOWN",
      });
      return NextResponse.json({ error: message, code: "UNSAFE_REFERENCE_URL" }, { status: 422 });
    }
  }

  // Check capabilities
  const caps = getArroDesignCapabilities();
  if (inputType === "image" && !caps.imageSupported) {
    return NextResponse.json(
      {
        error:
          "Analisis gambar belum dikonfigurasi (OPENROUTER_API_KEY). Gunakan mode URL, atau hubungi admin.",
        code: "VISION_NOT_CONFIGURED",
        missingKeys: ["OPENROUTER_API_KEY"],
      },
      { status: 503 },
    );
  }

  // Akses & kredit check
  try {
    await assertMiniToolAccess(dbUser.id, "arrodesign");
  } catch (err) {
    if (err instanceof TierCapabilityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  const creditsNeeded = estimateArroDesignCredits(inputType as ArroDesignInputType);
  let reservationId: string | null = null;

  try {
    const reservation = await reserveMiniToolCredits(
      dbUser.id,
      "arrodesign",
      { inputType, mode: mode ?? "fresh" },
      creditsNeeded,
    );
    reservationId = reservation.reservationId;
  } catch (err) {
    if (err instanceof TierCapabilityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  // Streaming response via ReadableStream
  const encoder = new TextEncoder();

  function encode(data: object): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encode(data));
        } catch {
          // client sudah disconnect — oke
        }
      };

      const onProgress = (p: ArroDesignProgress) => {
        send({ type: "progress", step: p.step, message: p.message });
      };

      try {
        const result = await runArroDesignEngine(
          {
            inputType: inputType as ArroDesignInputType,
            referenceUrl,
            imageDataUrl,
            projectContext,
            mode: mode ?? "fresh",
          },
          onProgress,
        );

        // Settle kredit
        const settled = await settleMiniToolReservation(
          dbUser.id,
          reservationId!,
          "arrodesign",
          { inputType, mode: mode ?? "fresh" },
          creditsNeeded,
        );

        send({
          type: "result",
          designMd: result.designMd,
          stitchPrompt: result.stitchPrompt,
          rawOutput: result.rawOutput,
          inputType: result.inputType,
          creditsUsed: result.creditsUsed,
          balanceAfter: settled.balanceAfter,
          tavilyConfigured: caps.tavilyConfigured,
        });
      } catch (err) {
        // Release reservation on error
        if (reservationId) {
          await CreditService.releaseReservation(
            dbUser.id,
            reservationId,
            "arrodesign_failed",
          ).catch(() => {});
        }

        const message = err instanceof Error ? err.message : "Gagal menjalankan ArroDesign.";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** GET — capabilities check (tidak perlu auth) */
export async function GET() {
  const caps = getArroDesignCapabilities();
  return NextResponse.json({
    imageSupported: caps.imageSupported,
    urlSupported: caps.urlSupported,
    tavilyConfigured: caps.tavilyConfigured,
    missingKeys: caps.missingKeys,
  });
}
