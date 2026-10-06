import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { SubscriptionTier } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";
import type { UserTier as OrchestratorUserTier } from "@/lib/ai/prompts/shared";
import { getModelsForTier } from "@/components/generate/types";
import {
  getUserSubscriptionTier,
  tierToOrchestratorUserTier,
  resolveTierId,
  tierIdToUserPlan,
} from "@/lib/services/tier.service";
import { CreditService } from "@/lib/services/credit.service";
import { getTierConfig, TIER, pricingSlugFromTierId, type TierId } from "@/lib/config/tiers";
import type { UserTier } from "@/lib/config/documents";
import { normalizeLegacyModelId } from "@/lib/legacy-model-ids";
import { startOfMonthWib } from "@/lib/quota-period";

export { normalizeLegacyModelId } from "@/lib/legacy-model-ids";

export function isModelAllowedForTier(modelId: string, tierId: TierId): boolean {
  const userTier = pricingSlugFromTierId(tierId) as UserTier;
  return getModelsForTier(userTier).some((model) => model.id === modelId);
}

export async function getSupabaseUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function syncDbUser(supabaseUser: SupabaseUser) {
  const email = supabaseUser.email;
  if (!email) {
    throw new Error("Authenticated user is missing an email address");
  }

  const metadata = supabaseUser.user_metadata ?? {};
  const name =
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined);
  const avatarUrl = metadata.avatar_url as string | undefined;

  return prisma.user.upsert({
    where: { id: supabaseUser.id },
    create: {
      id: supabaseUser.id,
      email,
      name,
      avatarUrl,
      tier: TIER.BASE,
      creditBalance: 0,
    },
    update: {
      email,
      name,
      avatarUrl,
    },
    include: { subscription: true },
  });
}

export function subscriptionToUserTier(tier: SubscriptionTier | null): OrchestratorUserTier {
  return tierToOrchestratorUserTier(tier);
}

export async function getEffectiveTier(userId?: string | null): Promise<OrchestratorUserTier> {
  if (!userId) return "free";
  const subscriptionTier = await getUserSubscriptionTier(userId);
  return subscriptionToUserTier(subscriptionTier);
}

export async function getActiveTierId(userId: string): Promise<TierId | null> {
  return resolveTierId(userId);
}

export async function assertCanGenerate(
  userId: string | null | undefined,
  tier: OrchestratorUserTier,
  modelId?: string,
  estimatedCredits = 8
): Promise<{ ok: true; tierId: TierId } | { ok: false; status: number; error: string }> {
  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: "Login wajib untuk generate dokumen. Silakan masuk atau daftar terlebih dahulu.",
    };
  }

  const tierId = await resolveTierId(userId);
  if (!tierId) {
    return {
      ok: false,
      status: 402,
      error:
        "Paket berlangganan belum aktif. Pilih Base, Core, atau Prime untuk mulai generate.",
    };
  }

  const normalizedModelId = normalizeLegacyModelId(modelId);
  if (normalizedModelId && !isModelAllowedForTier(normalizedModelId, tierId)) {
    const planLabel = tierIdToUserPlan(tierId);
    return {
      ok: false,
      status: 403,
      error: `Model "${normalizedModelId}" tidak tersedia di paket ${planLabel}. Paket Base memakai kelas Hemat (Gemini Flash Lite / DeepSeek).`,
    };
  }

  const config = getTierConfig(tierId);
  const startOfMonth = startOfMonthWib();

  const monthlyCount = await prisma.project.count({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
      status: { not: "FAILED" },
    },
  });

  if (monthlyCount >= config.maxProjectsPerMonth) {
    return {
      ok: false,
      status: 429,
      error: `Kuota bulanan tercapai (${config.maxProjectsPerMonth} proyek/bulan).`,
    };
  }

  const balance = await CreditService.getBalance(userId);
  if (balance.current < estimatedCredits) {
    return {
      ok: false,
      status: 402,
      error: `Kredit tidak cukup. Dibutuhkan ~${estimatedCredits}, tersedia ${balance.current}.`,
    };
  }

  return { ok: true, tierId };
}

export async function getSessionProfile() {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return null;
  }

  const dbUser = await syncDbUser(supabaseUser);
  const tier = await getEffectiveTier(dbUser.id);
  const tierId = await resolveTierId(dbUser.id);
  const creditBalance = dbUser.creditBalance;
  const plan = tierIdToUserPlan(tierId);

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    avatarUrl: dbUser.avatarUrl,
    tier,
    plan,
    tierId,
    creditBalance,
    subscriptionTier: dbUser.subscription?.tier ?? null,
    subscriptionStatus: dbUser.subscription?.status ?? null,
    hasActiveSubscription: tierId !== null,
  };
}
