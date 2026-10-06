/** Canonical public origin used for metadata, sitemap and robots. */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL;
  return (configured ?? "https://arrobuild.vercel.app").replace(/\/+$/, "");
}
