import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSupabaseUser, syncDbUser } from "@/lib/auth";
import {
  CreditService,
  CreditServiceError,
} from "@/lib/services/credit.service";
import { generate } from "@/lib/ai/generator";
import {
  buildSectionRevisePrompt,
  estimateRevisionCredits,
  findSection,
  findSectionByStartLine,
  parseMarkdownSections,
  replaceSection,
  summarizeDocForPrompt,
  unifiedDiff,
} from "@/lib/ai/section-revise";
import { normalizeDocumentKey } from "@/lib/config/documents";
import { DOCUMENT_FILE_KEYS } from "@/lib/config/options";
import { FILE_META, type FileKey } from "@/components/generate/types";
import { logger } from "@/lib/logger";
import {
  assertCanRevise,
  canUseFreeRevision,
  getRevisionQuota,
  TierCapabilityError,
} from "@/lib/services/tier-capabilities";

export const runtime = "nodejs";
export const maxDuration = 90;

const PreviewSchema = z.object({
  action: z.literal("preview"),
  fileKey: z.enum(DOCUMENT_FILE_KEYS),
  sectionName: z.string().min(1).max(200),
  sectionStartLine: z.number().int().min(0).optional(),
  instruction: z.string().min(3).max(800),
});

const AcceptSchema = z.object({
  action: z.literal("accept"),
  fileKey: z.enum(DOCUMENT_FILE_KEYS),
  reservationId: z.string().min(1).optional(),
  isFreeRevision: z.boolean().optional(),
  newContent: z.string().min(1).max(200_000),
  sectionName: z.string().min(1).max(200),
  estimatedCredits: z.number().int().min(0).max(12).optional(),
});

const CancelSchema = z.object({
  action: z.literal("cancel"),
  reservationId: z.string().min(1),
});

const BodySchema = z.discriminatedUnion("action", [
  PreviewSchema,
  AcceptSchema,
  CancelSchema,
]);

function errorResponse(error: unknown) {
  if (error instanceof CreditServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  logger.error("project_revise_error", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "Gagal memproses revisi dokumen" },
    { status: 500 }
  );
}

async function requireOwnedProject(projectId: string) {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser) {
    return {
      error: NextResponse.json(
        { error: "Login wajib", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    } as const;
  }
  const dbUser = await syncDbUser(supabaseUser);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, status: true },
  });
  if (!project) {
    return {
      error: NextResponse.json({ error: "Project tidak ditemukan" }, { status: 404 }),
    } as const;
  }
  if (project.userId !== dbUser.id) {
    return {
      error: NextResponse.json(
        { error: "Akses ditolak", code: "FORBIDDEN" },
        { status: 403 }
      ),
    } as const;
  }
  return { dbUser, project } as const;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!projectId) {
    return NextResponse.json({ error: "Project ID required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  try {
    const owned = await requireOwnedProject(projectId);
    if ("error" in owned) return owned.error;
    const { dbUser } = owned;
    const data = parsed.data;

    if (data.action === "cancel") {
      await CreditService.releaseReservation(
        dbUser.id,
        data.reservationId,
        "revision_cancelled"
      );
      return NextResponse.json({ ok: true });
    }

    if (data.action === "preview") {
      try {
        await assertCanRevise(dbUser.id);
      } catch (err) {
        if (err instanceof TierCapabilityError) {
          return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        throw err;
      }

      const fileKey =
        normalizeDocumentKey(data.fileKey) ?? (data.fileKey as typeof data.fileKey);

      const file = await prisma.generatedFile.findUnique({
        where: {
          projectId_fileKey: { projectId, fileKey },
        },
      });
      if (!file) {
        return NextResponse.json(
          { error: "File dokumen tidak ditemukan" },
          { status: 404 }
        );
      }

      const sections = parseMarkdownSections(file.content);
      const section =
        data.sectionStartLine != null
          ? findSectionByStartLine(sections, data.sectionStartLine) ??
            findSection(sections, data.sectionName)
          : findSection(sections, data.sectionName);
      if (!section) {
        return NextResponse.json(
          {
            error: `Section "${data.sectionName}" tidak ditemukan`,
            availableSections: sections.map((s) => ({
              title: s.title,
              startLine: s.startLine,
            })),
          },
          { status: 404 }
        );
      }

      const estimatedCredits = estimateRevisionCredits(section.content);
      const freeRevision = await canUseFreeRevision(dbUser.id);
      const revisionQuota = await getRevisionQuota(dbUser.id);

      let reservation: { reservationId: string; balanceAfter: number } | null = null;
      if (!freeRevision) {
        const reserved = await CreditService.reserveCredit(
          dbUser.id,
          estimatedCredits,
          projectId,
          {
            reason: "section_revise_preview",
            fileKey: data.fileKey,
            sectionName: section.title,
          }
        );
        reservation = {
          reservationId: reserved.reservationId,
          balanceAfter: reserved.balanceAfter,
        };
      }

      const fileLabel =
        FILE_META[data.fileKey as FileKey]?.label ?? data.fileKey;
      const prompt = buildSectionRevisePrompt({
        fileLabel,
        sectionTitle: section.title,
        sectionContent: section.content,
        instruction: data.instruction,
        documentContextSummary: summarizeDocForPrompt(file.content),
      });

      let afterSection: string;
      try {
        afterSection = await generate(prompt, {
          model: process.env.GEMINI_API_KEY
            ? "gemini-3.1-flash-lite"
            : process.env.DEEPSEEK_API_KEY
              ? "deepseek-v4-flash"
              : "gemini-3.1-flash-lite",
          maxOutputTokens: 4096,
          temperature: 0.35,
        });
      } catch (err) {
        if (reservation) {
          await CreditService.releaseReservation(
            dbUser.id,
            reservation.reservationId,
            "revision_ai_failed"
          );
        }
        throw err;
      }

      afterSection = afterSection
        .replace(/^```(?:markdown|md)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      // Ensure heading preserved if original had one
      if (
        section.headingLine &&
        !afterSection.startsWith("#") &&
        section.title !== "(Seluruh dokumen)"
      ) {
        afterSection = `${section.headingLine}\n\n${afterSection}`;
      }

      const fullProposed = replaceSection(file.content, section, afterSection);
      const diff = unifiedDiff(section.content, afterSection);

      return NextResponse.json({
        reservationId: reservation?.reservationId ?? null,
        isFreeRevision: freeRevision,
        revisionQuota,
        estimatedCredits: freeRevision ? 0 : estimatedCredits,
        balanceAfterReserve: reservation?.balanceAfter ?? null,
        fileKey: data.fileKey,
        sectionName: section.title,
        beforeSection: section.content,
        afterSection,
        fullProposed,
        diff,
        currentVersion: file.version,
      });
    }

    // accept
    const fileKey =
      normalizeDocumentKey(data.fileKey) ?? (data.fileKey as typeof data.fileKey);

    const file = await prisma.generatedFile.findUnique({
      where: {
        projectId_fileKey: { projectId, fileKey },
      },
    });
    if (!file) {
      if (data.reservationId) {
        await CreditService.releaseReservation(
          dbUser.id,
          data.reservationId,
          "revision_file_missing"
        );
      }
      return NextResponse.json(
        { error: "File dokumen tidak ditemukan" },
        { status: 404 }
      );
    }

    const nextVersion = file.version + 1;
    const useFree =
      data.isFreeRevision === true && (await canUseFreeRevision(dbUser.id));

    if (!useFree && !data.reservationId) {
      return NextResponse.json(
        { error: "reservationId wajib untuk revisi berbayar" },
        { status: 422 }
      );
    }

    // Charge before writing: a settled reservation cannot be replayed (409), so
    // a repeated accept can no longer save content without paying for it.
    let commit: { actualCreditsUsed: number; balanceAfter: number };
    if (useFree) {
      commit = await CreditService.commitFreeRevision(dbUser.id, projectId, {
        fileKey: data.fileKey,
        sectionName: data.sectionName,
        version: nextVersion,
      });
    } else {
      // The price is the hold quoted at preview time (computed on the server);
      // the client-supplied estimate is ignored.
      commit = await CreditService.commitRevision(
        dbUser.id,
        data.reservationId!,
        projectId,
        undefined,
        {
          fileKey: data.fileKey,
          sectionName: data.sectionName,
          version: nextVersion,
        }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentRevision.create({
        data: {
          documentId: file.id,
          version: nextVersion,
          content: data.newContent,
          revisionType: useFree ? "section_free" : "section",
          sectionName: data.sectionName,
        },
      });

      await tx.generatedFile.update({
        where: { id: file.id },
        data: {
          content: data.newContent,
          version: nextVersion,
        },
      });
    });

    logger.info("section_revision_accepted", {
      userId: dbUser.id,
      projectId,
      fileKey: data.fileKey,
      sectionName: data.sectionName,
      version: nextVersion,
      credits: commit.actualCreditsUsed,
    });

    return NextResponse.json({
      ok: true,
      version: nextVersion,
      creditsUsed: commit.actualCreditsUsed,
      balanceAfter: commit.balanceAfter,
      content: data.newContent,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
