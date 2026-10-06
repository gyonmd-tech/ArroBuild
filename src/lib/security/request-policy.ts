const PROTECTED_PREFIXES = [
  "/generate",
  "/dashboard",
  "/project",
  "/api/generate",
  "/api/export",
  "/api/interview",
  "/api/project",
  "/api/payment",
  "/api/user",
  "/api/whatsapp",
  "/api/admin",
] as const;

const PUBLIC_API_PATHS = new Set([
  "/api/payment/config",
  "/api/payment/webhook",
]);

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_API_PATHS.has(pathname)) return false;
  return PROTECTED_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export function isLocalDevelopmentIp(ip: string, nodeEnv: string | undefined): boolean {
  if (nodeEnv !== "development") return false;

  const normalized = ip.toLowerCase().replace(/^::ffff:/, "");
  if (
    normalized === "unknown" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("10.")
  ) {
    return true;
  }

  const match = normalized.match(/^172\.(\d{1,2})\./);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}
