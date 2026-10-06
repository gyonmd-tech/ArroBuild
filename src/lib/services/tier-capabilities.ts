import { prisma } from "@/lib/db/prisma";
import { getTierConfig, TIER, type TierId } from "@/lib/config/tiers";
import { resolveTierId } from "@/lib/services/tier.service";
import { startOfMonthWib } from "@/lib/quota-period";

export type TierCapability =
  | "fork_project"
  | "regen_per_file"
  | "revise_unlimited"
  | "optional_modules"
  | "mini_tools"
  | "whatsapp_chat";

const CAPABILITY_MAP: Record<
  TierCapability,
  keyof ReturnType<typeof getTierConfig>
> = {
  fork_project: "canForkProject",
  regen_per_file: "canRegenPerFile",
  revise_unlimited: "canReviseUnlimited",
  optional_modules: "canAccessOptionalModules",
  mini_tools: "miniToolsIncluded",
  whatsapp_chat: "whatsappChatPerMonth",
};

export const CORE_FREE_REVISIONS_PER_MONTH = 1;

export class TierCapabilityError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 403
  ) {
    super(message);
    this.name = "TierCapabilityError";
  }
}

export async function getUserTierId(userId: string): Promise<TierId | null> {
  return resolveTierId(userId);
}

export async function assertTierCapability(
  userId: string,
  capability: TierCapability
): Promise<{ tierId: TierId; config: ReturnType<typeof getTierConfig> }> {
  const tierId = await getUserTierId(userId);
  if (!tierId) {
    throw new TierCapabilityError(
      "NO_SUBSCRIPTION",
      "Paket berlangganan belum aktif. Upgrade untuk mengakses fitur ini.",
      402
    );
  }

  const config = getTierConfig(tierId);
  const flag = CAPABILITY_MAP[capability];
  const value = config[flag];

  if (capability === "whatsapp_chat") {
    const limit = config.whatsappChatPerMonth;
    if (limit <= 0) {
      throw new TierCapabilityError(
        "WHATSAPP_NOT_INCLUDED",
        "Chat WhatsApp founder tersedia di paket Core ke atas. Upgrade untuk akses chat langsung dengan founder.",
        403
      );
    }
    const now = new Date();
    const used = await prisma.whatsappChat.count({
      where: {
        userId,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    });
    if (used >= limit) {
      throw new TierCapabilityError(
        "WHATSAPP_QUOTA_EXCEEDED",
        `Kuota chat WhatsApp bulan ini habis (${limit}/bulan).`,
        429
      );
    }
    return { tierId, config };
  }

  if (capability === "mini_tools") {
    const included = config.miniToolsIncluded;
    if (included === 0) {
      throw new TierCapabilityError(
        "MINI_TOOLS_LOCKED",
        "Mini tools tidak tersedia di paket kamu.",
        403
      );
    }
    return { tierId, config };
  }

  if (typeof value === "boolean" && !value) {
    throw new TierCapabilityError(
      "CAPABILITY_LOCKED",
      `Fitur ini tidak tersedia di paket kamu. Upgrade untuk membukanya.`,
      403
    );
  }

  return { tierId, config };
}

function startOfMonth(): Date {
  return startOfMonthWib();
}

export async function countMonthlyFreeRevisions(userId: string): Promise<number> {
  const start = startOfMonth();
  const entries = await prisma.creditLedger.findMany({
    where: {
      userId,
      type: "REVISION",
      createdAt: { gte: start },
    },
    select: { metadata: true },
  });

  return entries.filter((e) => {
    const meta = e.metadata as Record<string, unknown> | null;
    return meta?.freeRevision === true;
  }).length;
}

export interface RevisionQuota {
  tierId: TierId;
  freeRemaining: number;
  hasFreeRevision: boolean;
  unlimitedCount: boolean;
}

export async function getRevisionQuota(userId: string): Promise<RevisionQuota | null> {
  const tierId = await getUserTierId(userId);
  if (!tierId) return null;

  const config = getTierConfig(tierId);
  if (config.canReviseUnlimited) {
    return {
      tierId,
      freeRemaining: 0,
      hasFreeRevision: false,
      unlimitedCount: true,
    };
  }

  if (tierId === TIER.CORE) {
    const used = await countMonthlyFreeRevisions(userId);
    const freeRemaining = Math.max(0, CORE_FREE_REVISIONS_PER_MONTH - used);
    return {
      tierId,
      freeRemaining,
      hasFreeRevision: freeRemaining > 0,
      unlimitedCount: false,
    };
  }

  return {
    tierId,
    freeRemaining: 0,
    hasFreeRevision: false,
    unlimitedCount: false,
  };
}

export async function assertCanRevise(userId: string): Promise<RevisionQuota> {
  const quota = await getRevisionQuota(userId);
  if (!quota) {
    throw new TierCapabilityError(
      "NO_SUBSCRIPTION",
      "Paket berlangganan belum aktif.",
      402
    );
  }
  return quota;
}

export async function canUseFreeRevision(userId: string): Promise<boolean> {
  const quota = await getRevisionQuota(userId);
  return quota?.hasFreeRevision ?? false;
}

export interface WhatsappQuota {
  tierId: TierId;
  limit: number;
  used: number;
  remaining: number;
  priority: "normal" | "priority";
  available: boolean;
}

export async function getWhatsappQuota(userId: string): Promise<WhatsappQuota | null> {
  const tierId = await getUserTierId(userId);
  if (!tierId) return null;

  const config = getTierConfig(tierId);
  const limit = config.whatsappChatPerMonth;
  if (limit <= 0) {
    return {
      tierId,
      limit: 0,
      used: 0,
      remaining: 0,
      priority: config.whatsappChatPriority,
      available: false,
    };
  }

  const now = new Date();
  const used = await prisma.whatsappChat.count({
    where: {
      userId,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    },
  });

  return {
    tierId,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    priority: config.whatsappChatPriority,
    available: used < limit,
  };
}
