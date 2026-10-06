import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionProfile } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getAllTierCapacity, getTierCapacity } from "@/lib/services/capacity.service";
import { tierIdFromPricingSlug, type TierId } from "@/lib/config/tiers";
import { PAID_TIER_IDS } from "@/lib/pricing";
import { enforceUserRouteLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tierSlug = searchParams.get("tier");

  if (tierSlug) {
    const tierId = tierIdFromPricingSlug(tierSlug);
    if (!tierId) {
      return NextResponse.json({ error: "Paket tidak valid" }, { status: 422 });
    }
    const capacity = await getTierCapacity(tierId);
    return NextResponse.json({ capacity });
  }

  const capacities = await getAllTierCapacity();
  return NextResponse.json({ capacities });
}

const JoinSchema = z.object({
  tierId: z.enum(PAID_TIER_IDS as [string, ...string[]]),
  email: z.string().email().optional(),
  note: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = JoinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data waitlist tidak valid" }, { status: 422 });
  }

  const profile = await getSessionProfile();
  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rateLimited = await enforceUserRouteLimit(profile?.id ?? `ip:${ip}`, "waitlist");
  if (rateLimited) return rateLimited;

  const email = (parsed.data.email ?? profile?.email)?.toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "Email atau login diperlukan untuk waitlist" },
      { status: 401 }
    );
  }

  const tierId = tierIdFromPricingSlug(parsed.data.tierId) as TierId | null;
  if (!tierId) {
    return NextResponse.json({ error: "Paket tidak valid" }, { status: 422 });
  }

  const capacity = await getTierCapacity(tierId);
  if (!capacity.isFull) {
    return NextResponse.json({
      ok: true,
      waitlisted: false,
      message: "Masih ada slot — kamu bisa upgrade sekarang.",
      capacity,
    });
  }

  const entry = await prisma.waitlistEntry.upsert({
    where: {
      email_tier: {
        email,
        tier: tierId,
      },
    },
    create: {
      email,
      tier: tierId,
      userId: profile?.id,
      note: parsed.data.note,
      status: "PENDING",
    },
    update: {
      userId: profile?.id ?? undefined,
      note: parsed.data.note,
      status: "PENDING",
    },
  });

  return NextResponse.json({
    ok: true,
    waitlisted: true,
    entryId: entry.id,
    capacity,
    message: `Kamu masuk waitlist ${tierId}. Kami hubungi saat slot terbuka.`,
  });
}
