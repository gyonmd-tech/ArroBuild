import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseUser, syncDbUser } from "@/lib/auth";
import { fetchGitHubRepo, GitHubRepoError } from "@/lib/services/github-repo.service";
import { enforceUserRouteLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({
  url: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
  }

  const rateLimited = await enforceUserRouteLimit(supabaseUser.id, "github");
  if (rateLimited) return rateLimited;

  await syncDbUser(supabaseUser);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "URL wajib diisi." }, { status: 422 });
  }

  try {
    const data = await fetchGitHubRepo(parsed.data.url);
    return NextResponse.json({
      data,
      incomplete: Boolean(data.incomplete),
    });
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      const status =
        err.code === "INVALID_URL"
          ? 422
          : err.code === "NOT_FOUND"
            ? 404
            : err.code === "RATE_LIMIT"
              ? 429
              : 500;

      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }

    console.error("GitHub repo fetch error:", err);
    return NextResponse.json({ error: "Gagal mengambil data repo." }, { status: 500 });
  }
}
