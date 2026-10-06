/**
 * orchestrator.ts (v3) — v2 document keys
 */

import { streamWithFinishReason, type GenerationConfig } from "./generator";
import { buildPromptForTier } from "./prompts/build-prompt";
import { AI_PROMPT_VERSION } from "./prompts/version";
import { ContextManager } from "./context-manager";
import { FALLBACK_CHAIN, getBackoffMs, shouldFallback } from "./retry-handler";
import { queueFileWrite, queueProjectStatusUpdate } from "./db-writer";
import { enforceTier, modelToProvider, toV3Tier } from "./tier-enforcer";
import {
  validateGeneratedContent,
  buildContinuationPrompt,
  buildRepairPrompt,
  sanitizeGeneratedContent,
  mergeContinuationContent,
} from "./validation";
import { formatGenerationError } from "./errors";
import type { GenerationInput } from "./prompts/shared";
import type { DocumentFileKey } from "@/lib/config/documents";
import {
  DOCUMENT_DEFINITIONS,
  DOCUMENT_GENERATION_ORDER,
  DEFAULT_CORE_DOCS_BY_TIER,
  calcDocumentCredits,
  getDefaultModelClass,
  legacyTierSlugToUserTier,
} from "@/lib/config/documents";
import {
  modelClassSlugToId,
  resolveModelForClass,
  resolveModelsForClass,
  isModelConfigured,
} from "@/lib/ai-gateway/model-router";
import {
  getTierConfig,
  MODEL_CLASS,
  validateModelClassForTier,
  type ModelClassId,
  type TierId,
} from "@/lib/config/tiers";

export type { DocumentFileKey as FileKey } from "@/lib/config/documents";
export type GenerationStatus = "pending" | "generating" | "done" | "error";

export interface FileDefinition {
  key: DocumentFileKey;
  fileName: string;
  label: string;
}

export const ALL_FILES: Record<DocumentFileKey, FileDefinition> = Object.fromEntries(
  Object.values(DOCUMENT_DEFINITIONS).map((d) => [
    d.key,
    { key: d.key, fileName: d.fileName, label: d.label },
  ]),
) as Record<DocumentFileKey, FileDefinition>;

export interface GenerationEvent {
  type: "progress" | "chunk" | "file_done" | "all_done" | "error" | "retry";
  fileKey?: DocumentFileKey;
  fileName?: string;
  label?: string;
  chunk?: string;
  content?: string;
  usedModel?: string;
  modelClass?: string;
  promptVersion?: string;
  modelRoute?: string;
  tokensUsed?: number;
  documentsGenerated?: Array<{
    fileKey: DocumentFileKey;
    modelClass: "HEMAT" | "MENENGAH" | "FLAGSHIP" | "ULTRA";
    promptVersion: string;
    modelRoute: string;
    tokensUsed: number;
  }>;
  files?: Record<string, string>;
  error?: string;
  attempt?: number;
  success?: boolean;
  failedFiles?: Partial<Record<DocumentFileKey, string>>;
}

export function getFilesForTier(tier: string): FileDefinition[] {
  const userTier = legacyTierSlugToUserTier(tier);
  return DEFAULT_CORE_DOCS_BY_TIER[userTier].map((key) => ALL_FILES[key]);
}

const MAX_CONTINUATIONS = 3;

async function* streamCompleteFile(
  prompt: string,
  fileKey: DocumentFileKey,
  genConfig: GenerationConfig,
): AsyncGenerator<string, string, undefined> {
  let content = "";
  let currentPrompt = prompt;
  let passMode: "initial" | "continuation" | "repair" = "initial";

  for (let pass = 0; pass <= MAX_CONTINUATIONS; pass++) {
    let passText = "";
    let finishReason: string | null = null;

    const stream = streamWithFinishReason(currentPrompt, genConfig);
    while (true) {
      const result = await stream.next();
      if (result.done) {
        finishReason = result.value ?? null;
        break;
      }
      passText += result.value;
      yield result.value;
    }

    const normalizedPass = sanitizeGeneratedContent(passText);

    if (pass === 0) {
      content = normalizedPass;
    } else if (passMode === "continuation") {
      content = sanitizeGeneratedContent(mergeContinuationContent(content, normalizedPass));
    } else {
      content = normalizedPass;
    }

    const validation = validateGeneratedContent(content, fileKey, finishReason);
    if (validation.valid) {
      return sanitizeGeneratedContent(content);
    }

    if (pass >= MAX_CONTINUATIONS) {
      const fallback = sanitizeGeneratedContent(content);
      const headingCount = (fallback.match(/^#{1,3}\s+.+/gm) ?? []).length;
      if (fallback.length >= 800 && headingCount >= 3) {
        return fallback;
      }
      throw new Error(`Generated content incomplete: ${validation.reasons.join("; ")}`);
    }

    passMode = validation.truncated ? "continuation" : "repair";
    currentPrompt = validation.truncated
      ? buildContinuationPrompt(content, fileKey)
      : buildRepairPrompt(prompt, content, validation.reasons, fileKey);
  }

  return sanitizeGeneratedContent(content);
}

function planGeneration(input: GenerationInput) {
  const userTier = legacyTierSlugToUserTier(input.tier);
  const requestedDocs: DocumentFileKey[] =
    input.selectedDocs ?? DEFAULT_CORE_DOCS_BY_TIER[userTier];
  const enforcement = enforceTier(requestedDocs, input.modelId, input.tier);
  const tierId: TierId =
    enforcement.userTier === "prime" ? "PRIME" : enforcement.userTier === "core" ? "CORE" : "BASE";
  const docsToGenerate = DOCUMENT_GENERATION_ORDER.filter((k) =>
    enforcement.sanitizedDocs.includes(k),
  );

  function resolveDocModelClass(fileKey: DocumentFileKey): ModelClassId {
    const slug =
      input.perDocumentModelClass?.[fileKey] ?? getDefaultModelClass(fileKey, enforcement.userTier);
    const classId = modelClassSlugToId(slug);
    if (!validateModelClassForTier(tierId, classId)) {
      return "HEMAT";
    }
    return classId;
  }

  return { userTier, enforcement, tierId, docsToGenerate, resolveDocModelClass };
}

const MODEL_CLASS_ID_TO_SLUG: Record<ModelClassId, "hemat" | "menengah" | "flagship" | "ultra"> = {
  [MODEL_CLASS.HEMAT]: "hemat",
  [MODEL_CLASS.MENENGAH]: "menengah",
  [MODEL_CLASS.FLAGSHIP]: "flagship",
  [MODEL_CLASS.ULTRA]: "ultra",
};

/**
 * Credits to hold before generating, computed on the server from the same
 * document and model-class resolution the orchestrator uses. Never trust a
 * client-supplied estimate.
 */
export function estimateGenerationCredits(input: GenerationInput): number {
  const plan = planGeneration(input);
  const total = plan.docsToGenerate.reduce(
    (sum, fileKey) =>
      sum +
      calcDocumentCredits(
        fileKey,
        plan.enforcement.userTier,
        MODEL_CLASS_ID_TO_SLUG[plan.resolveDocModelClass(fileKey)],
      ),
    0,
  );
  return Math.max(1, total);
}

export async function* orchestrateGeneration(
  input: GenerationInput,
  projectId?: string,
): AsyncGenerator<GenerationEvent> {
  const promptDepth = toV3Tier(input.tier);
  const { enforcement, tierId, docsToGenerate, resolveDocModelClass } = planGeneration(input);

  if (!enforcement.allowed && enforcement.reason) {
    yield { type: "error", error: enforcement.reason };
    yield { type: "all_done", success: false, error: enforcement.reason };
    return;
  }

  const primaryModel = enforcement.resolvedModel;
  const genConfig: GenerationConfig = {
    maxOutputTokens: enforcement.tokenLimit,
    temperature: 0.55,
    model: primaryModel,
    provider: modelToProvider(primaryModel),
  };

  const tierConfig = getTierConfig(tierId);

  const contextManager = new ContextManager(tierConfig.maxContextInjectionTokens);
  const generatedFiles: Partial<Record<DocumentFileKey, string>> = {};
  const generatedMeta: Array<{
    fileKey: DocumentFileKey;
    modelClass: "HEMAT" | "MENENGAH" | "FLAGSHIP" | "ULTRA";
    promptVersion: string;
    modelRoute: string;
    tokensUsed: number;
  }> = [];
  const failedFiles: Partial<Record<DocumentFileKey, string>> = {};

  const tierAllowed = tierConfig.allowedModelClasses
    .flatMap((mc) => resolveModelsForClass(mc))
    .filter(isModelConfigured);

  for (const fileKey of docsToGenerate) {
    const fileDef = ALL_FILES[fileKey];
    const { fileName, label } = fileDef;
    const contextString = contextManager.buildContextString(fileKey);
    const prompt = buildPromptForTier(fileKey, input, promptDepth, contextString);

    yield { type: "progress", fileKey, fileName, label };

    const docModelClass = resolveDocModelClass(fileKey);
    const primaryRouted = resolveModelForClass(docModelClass);
    const docPrimaryModel = primaryRouted.modelName;

    let fullContent = "";
    let usedModel = docPrimaryModel;
    let usedModelClass: ModelClassId = docModelClass;
    let totalAttempts = 0;
    let lastError: unknown;
    let successGeneration = false;

    const chain = [
      docPrimaryModel,
      ...resolveModelsForClass(docModelClass).filter((m) => m !== docPrimaryModel),
      ...(FALLBACK_CHAIN[docPrimaryModel as keyof typeof FALLBACK_CHAIN] ?? []),
    ].filter(
      (m, i, arr) => tierAllowed.includes(m) && isModelConfigured(m) && arr.indexOf(m) === i,
    );

    for (let modelIdx = 0; modelIdx < chain.length; modelIdx++) {
      const model = chain[modelIdx];
      for (let attempt = 0; attempt < 2; attempt++) {
        totalAttempts++;
        if (totalAttempts > 1) yield { type: "retry", fileKey, attempt: totalAttempts };

        try {
          const attemptConfig: GenerationConfig = {
            ...genConfig,
            model,
            provider: modelToProvider(model as import("./tier-enforcer").ModelId),
            maxOutputTokens: Math.min(
              tierConfig.maxOutputTokensPerDoc,
              DOCUMENT_DEFINITIONS[fileKey].tokenBudget[enforcement.userTier] ||
                tierConfig.maxOutputTokensPerDoc,
            ),
          };
          let fileContent = "";
          const fileStream = streamCompleteFile(prompt, fileKey, attemptConfig);
          while (true) {
            const result = await fileStream.next();
            if (result.done) {
              fileContent = result.value;
              break;
            }
            yield { type: "chunk", fileKey, chunk: result.value };
          }
          fullContent = fileContent;
          usedModel = model;
          usedModelClass = docModelClass;
          successGeneration = true;
          break;
        } catch (err) {
          lastError = err;
          if (attempt < 1 && shouldFallback(err)) {
            await new Promise((r) => setTimeout(r, getBackoffMs(err, attempt)));
          }
        }
      }
      if (successGeneration) break;
      if (!shouldFallback(lastError)) break;
    }

    if (!successGeneration) {
      const errorMessage = formatGenerationError(lastError);
      failedFiles[fileKey] = errorMessage;
      yield { type: "error", fileKey, fileName, label, error: errorMessage };
      continue;
    }

    contextManager.addDocument(fileKey, fullContent);
    generatedFiles[fileKey] = fullContent;
    const tokensUsed = Math.max(1, Math.ceil(fullContent.length / 4));
    generatedMeta.push({
      fileKey,
      modelClass: usedModelClass,
      promptVersion: AI_PROMPT_VERSION,
      modelRoute: usedModel,
      tokensUsed,
    });

    if (projectId) {
      queueFileWrite({
        projectId,
        fileKey,
        fileName,
        label,
        content: fullContent,
        modelClass: usedModelClass,
        promptVersion: AI_PROMPT_VERSION,
        modelRoute: usedModel,
        tokenCount: tokensUsed,
      });
    }

    yield {
      type: "file_done",
      fileKey,
      fileName,
      label,
      content: fullContent,
      usedModel,
      modelClass: usedModelClass,
      promptVersion: AI_PROMPT_VERSION,
      modelRoute: usedModel,
      tokensUsed,
    };
  }

  const successCount = Object.keys(generatedFiles).length;
  const success = successCount > 0 && Object.keys(failedFiles).length === 0;

  if (projectId) {
    queueProjectStatusUpdate(projectId, successCount > 0 ? "DONE" : "FAILED");
  }

  yield {
    type: "all_done",
    success,
    files: successCount > 0 ? (generatedFiles as Record<string, string>) : undefined,
    documentsGenerated: generatedMeta,
    failedFiles: Object.keys(failedFiles).length > 0 ? failedFiles : undefined,
    error: success ? undefined : Object.values(failedFiles)[0],
  };
}
