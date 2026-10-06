/**
 * retry-handler.ts
 * Fallback model strategy + exponential backoff retry.
 * Jika model utama gagal/rate-limit, otomatis coba model berikutnya
 * yang masih diizinkan oleh tier user.
 */

import { type ModelId } from "./tier-enforcer";

// ─── Fallback Chain ─────────────────────────────────────────────────────────

/**
 * Urutan fallback per model — jika model utama gagal,
 * coba model berikutnya dalam chain.
 */
export const FALLBACK_CHAIN: Record<ModelId, ModelId[]> = {
  "claude-sonnet-4-20250514": [
    "gpt-5.4",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
  ],
  "gpt-5.4": ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
  "gemini-3.5-flash": ["gemini-3.1-flash-lite", "deepseek-v4-flash"],
  "gemini-3.1-flash-lite": ["deepseek-v4-flash", "gemini-3.5-flash"],
  "deepseek-v4-flash": ["gemini-3.1-flash-lite", "gemini-3.5-flash"],
};

// ─── Error Classifiers ──────────────────────────────────────────────────────

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Too Many Requests") ||
    msg.includes("rate_limit")
  );
}

function isProviderUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("UNAVAILABLE")
  );
}

function isModelNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("NOT_FOUND") ||
    msg.includes("is not found") ||
    msg.includes("no longer available")
  );
}

function isMissingProviderKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("_API_KEY is not set");
}

export function isFreeTierQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) &&
    (msg.includes("free_tier") ||
      msg.includes("FreeTier") ||
      msg.includes("limit: 20"))
  );
}

/**
 * Daily Gemini free-tier quota — still try the next provider in chain (e.g. DeepSeek).
 */
export function shouldFallback(err: unknown): boolean {
  if (isModelNotFoundError(err)) return true;
  if (isMissingProviderKeyError(err)) return true;
  if (isFreeTierQuotaError(err)) return true;
  return isRateLimitError(err) || isProviderUnavailableError(err);
}

const MAX_BACKOFF_MS = 15_000;

export function getBackoffMs(err: unknown, attempt: number): number {
  // Extract retry-after from error message if present
  const msg = err instanceof Error ? err.message : String(err);
  const retryMatch =
    msg.match(/retry in (\d+(?:\.\d+)?)s/i) ??
    msg.match(/"retryDelay":\s*"(\d+)s"/);
  if (retryMatch) {
    // Never sleep longer than a route can afford; past the cap, fall back instead.
    return Math.min(Math.ceil(parseFloat(retryMatch[1]) * 1000) + 1000, MAX_BACKOFF_MS);
  }

  // Rate limit: exponential backoff starting at 2s
  if (isRateLimitError(err)) {
    return Math.min(2000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
  }

  // Other errors: flat 500ms
  return 500 * (attempt + 1);
}
