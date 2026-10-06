import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getTierConfig, type TierId } from "@/lib/config/tiers";
import { logger } from "@/lib/logger";

type RedisEnvironment = Record<string, string | undefined>;

export function getRedisCredentials(environment: RedisEnvironment = process.env) {
  const url =
    environment.UPSTASH_REDIS_REST_KV_REST_API_URL ??
    environment.UPSTASH_REDIS_REST_URL;
  const token =
    environment.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ??
    environment.UPSTASH_REDIS_REST_TOKEN;

  return url && token ? { url, token } : null;
}

export function isRedisConfigured(environment: RedisEnvironment = process.env): boolean {
  return getRedisCredentials(environment) !== null;
}

function createRedis() {
  const credentials = getRedisCredentials();
  if (!credentials) return null;

  const { url, token } = credentials;
  return new Redis({ url, token });
}

const redis = createRedis();

function isRateLimitRequired(): boolean {
  return (
    process.env.RATE_LIMIT_REQUIRED === "true" ||
    process.env.NODE_ENV === "production"
  );
}

function redisUnavailable(): boolean {
  if (redis) return false;
  if (isRateLimitRequired()) {
    logger.error("rate_limit_redis_missing", {
      message: "Upstash Redis tidak dikonfigurasi — rate limit tidak aktif",
    });
    return true;
  }
  return false;
}

export const ipLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "arrobuild:ip",
    })
  : null;

const generateLimiters = new Map<TierId, Ratelimit>();

export function generateLimiter(tierId: TierId): Ratelimit | null {
  if (!redis) return null;

  const existing = generateLimiters.get(tierId);
  if (existing) return existing;

  const config = getTierConfig(tierId);
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.maxProjectsPerDay, "1 d"),
    prefix: `arrobuild:generate:${tierId}`,
  });
  generateLimiters.set(tierId, limiter);
  return limiter;
}

export async function checkIpRateLimit(ip: string): Promise<boolean> {
  if (redisUnavailable()) {
    return !isRateLimitRequired();
  }
  if (!ipLimiter) return true;
  const { success } = await ipLimiter.limit(ip);
  return success;
}

export async function checkGenerateRateLimit(
  userId: string,
  tierId: TierId
): Promise<{ ok: boolean; limit?: number }> {
  if (redisUnavailable()) {
    return { ok: !isRateLimitRequired(), limit: getTierConfig(tierId).maxProjectsPerDay };
  }
  const limiter = generateLimiter(tierId);
  if (!limiter) return { ok: true };
  const { success } = await limiter.limit(userId);
  return {
    ok: success,
    limit: getTierConfig(tierId).maxProjectsPerDay,
  };
}

/**
 * Per-user burst limits for routes that call paid AI models (credits cap the
 * total spend; these cap how fast one account can hit the providers), plus
 * anonymous write endpoints keyed by IP.
 */
export const AI_ROUTE_LIMITS = {
  generate: { requests: 5, window: "10 m" },
  regen: { requests: 10, window: "10 m" },
  revise: { requests: 30, window: "10 m" },
  interview: { requests: 60, window: "10 m" },
  tools: { requests: 20, window: "10 m" },
  discuss: { requests: 60, window: "10 m" },
  github: { requests: 30, window: "10 m" },
  waitlist: { requests: 5, window: "1 h" },
} as const satisfies Record<string, { requests: number; window: `${number} ${"s" | "m" | "h"}` }>;

export type AiRoute = keyof typeof AI_ROUTE_LIMITS;

const userRouteLimiters = new Map<AiRoute, Ratelimit>();

function userRouteLimiter(route: AiRoute): Ratelimit | null {
  if (!redis) return null;
  const existing = userRouteLimiters.get(route);
  if (existing) return existing;

  const { requests, window } = AI_ROUTE_LIMITS[route];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `arrobuild:user:${route}`,
  });
  userRouteLimiters.set(route, limiter);
  return limiter;
}

export async function checkUserRouteLimit(userId: string, route: AiRoute): Promise<boolean> {
  if (redisUnavailable()) {
    return !isRateLimitRequired();
  }
  const limiter = userRouteLimiter(route);
  if (!limiter) return true;
  const { success } = await limiter.limit(userId);
  return success;
}

/** Returns a 429 response when the user is over the route's limit, else null. */
export async function enforceUserRouteLimit(
  userId: string,
  route: AiRoute
): Promise<Response | null> {
  if (await checkUserRouteLimit(userId, route)) return null;
  return new Response(
    JSON.stringify({ error: "Terlalu banyak permintaan. Coba lagi beberapa menit lagi." }),
    { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
  );
}
