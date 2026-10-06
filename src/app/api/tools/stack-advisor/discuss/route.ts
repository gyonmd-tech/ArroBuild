import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runStackDiscussTurn, type StackDiscussFields } from "@/lib/ai/stack-discuss";
import { getSupabaseUser, syncDbUser } from "@/lib/auth";
import { assertMiniToolAccess } from "@/lib/services/mini-tools.service";
import { TierCapabilityError } from "@/lib/services/tier-capabilities";
import { enforceUserRouteLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  filledFields: z
    .record(z.string().max(64), z.unknown())
    .refine((fields) => JSON.stringify(fields).length <= 20_000, "filledFields terlalu besar")
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["assistant", "user"]),
        content: z.string().max(4000),
      })
    )
    .max(24)
    .optional(),
  userMessage: z.string().min(1).max(2000),
  turnCount: z.number().int().min(0).max(20),
});

/** Mode Diskusi turns — charge happens on final /api/tools/run. */
export async function POST(req: NextRequest) {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
  }

  const rateLimited = await enforceUserRouteLimit(supabaseUser.id, "discuss");
  if (rateLimited) return rateLimited;

  const dbUser = await syncDbUser(supabaseUser);

  try {
    await assertMiniToolAccess(dbUser.id, "stack-advisor");
  } catch (err) {
    if (err instanceof TierCapabilityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 422 });
  }

  try {
    const result = await runStackDiscussTurn({
      filledFields: (parsed.data.filledFields ?? {}) as StackDiscussFields,
      messages: parsed.data.messages ?? [],
      userMessage: parsed.data.userMessage,
      turnCount: parsed.data.turnCount,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Stack discuss error:", err);
    return NextResponse.json({ error: "Gagal memproses diskusi." }, { status: 500 });
  }
}
