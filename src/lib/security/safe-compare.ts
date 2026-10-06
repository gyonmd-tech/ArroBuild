import { timingSafeEqual } from "crypto";

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Unset secret denies all. */
export function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return safeEqual(auth, `Bearer ${secret}`);
}
