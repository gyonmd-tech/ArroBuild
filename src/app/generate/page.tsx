"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import ProductTypeStep from "@/components/generate/ProductTypeStep";
import ContextStep from "@/components/generate/ContextStep";
import StackStep from "@/components/generate/StackStep";
import DocumentPickerStep from "@/components/generate/DocumentPickerStep";
import ConfirmScreen from "@/components/generate/ConfirmScreen";
import GenerationProgress from "@/components/generate/GenerationProgress";
import DocPreview from "@/components/generate/DocPreview";
import ModeSelectStep, {
  type IntakeMode,
} from "@/components/generate/ModeSelectStep";
import InterviewStep, {
  type InterviewResult,
} from "@/components/generate/InterviewStep";
import DraftRestoreDialog from "@/components/generate/DraftRestoreDialog";
import type {
  ProductType,
  ProjectStage,
  ContextData,
  Presets,
  GeneratedFiles,
  UserPlanStatus,
  FileKey,
  Feature,
  ModelClass,
  PerDocumentModelClass,
} from "@/components/generate/types";
import {
  getModelsForTier,
  STAGE_PRESETS,
  resolvePreviewTier,
  calcTotalCredits,
  isSubscribed,
  TIER_MODEL_CLASSES,
  sanitizeSelectedDocs,
} from "@/components/generate/types";
import AppShell from "@/components/layout/AppShell";
import {
  clearGenerateDraft,
  draftHasContent,
  readGenerateDraft,
  writeGenerateDraft,
  type GenerateDraft,
} from "@/lib/generate-draft";
import { sanitizePerDocumentModelClass } from "@/lib/config/documents";
import { normalizeLegacyModelId } from "@/lib/legacy-model-ids";

type Step =
  | "mode"
  | "interview"
  | "product-type"
  | "context"
  | "stack"
  | "docs"
  | "confirm"
  | "generating"
  | "preview";

const STEP_LABELS = ["Tipe", "Cerita", "Stack", "Dokumen"];

export default function GeneratePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("mode");
  const [intakeMode, setIntakeMode] = useState<IntakeMode | null>(null);

  // Step 1
  const [productType, setProductType] = useState<ProductType | null>(null);
  const [stage, setStage] = useState<ProjectStage | null>(null);

  // Step 2
  const [contextData, setContextData] = useState<ContextData>({});
  const [features, setFeatures] = useState<Feature[]>([]);

  // Step 3
  const [presets, setPresets] = useState<Presets>({
    framework: "nextjs",
    design: "neo-brutalist",
    agentTool: "cursor",
    stackBundle: undefined,
    programmingLanguage: undefined,
    database: undefined,
    deployment: undefined,
    animationLibrary: undefined,
    designReferenceNote: undefined,
    versionControl: undefined,
    designHandoffTool: undefined,
    projectManagementTool: undefined,
  });

  // Step 4
  const [selectedDocs, setSelectedDocs] = useState<FileKey[]>([
    "prd",
    "architecture",
    "plan-task",
  ]);
  const [selectedModelId, setSelectedModelId] = useState("gemini-3.1-flash-lite");
  const [perDocModelClass, setPerDocModelClass] = useState<PerDocumentModelClass>({});
  const [plan, setPlan] = useState<UserPlanStatus>("none");
  const [creditBalance, setCreditBalance] = useState(0);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const serverDraftIdRef = useRef<string | undefined>(undefined);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Output
  const [projectId, setProjectId] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFiles>({});

  // Limits (monthly + daily from server)
  const [monthlyProjectCount, setMonthlyProjectCount] = useState(0);
  const [monthlyProjectLimit, setMonthlyProjectLimit] = useState<number | null>(null);
  const [dailyProjectCount, setDailyProjectCount] = useState(0);
  const [dailyProjectLimit, setDailyProjectLimit] = useState<number | null>(null);

  const applyUserMe = (data: {
    tier?: UserPlanStatus;
    plan?: UserPlanStatus;
    monthlyProjectCount?: number;
    monthlyProjectLimit?: number | null;
    dailyProjectCount?: number;
    dailyProjectLimit?: number;
    user?: { creditBalance?: number; hasActiveSubscription?: boolean };
  }) => {
    const userPlan = data.plan ?? data.tier ?? "none";
    setPlan(userPlan);
    setCreditBalance(data.user?.creditBalance ?? 0);
    setHasActiveSubscription(Boolean(data.user?.hasActiveSubscription));
    setMonthlyProjectCount(data.monthlyProjectCount ?? 0);
    setMonthlyProjectLimit(data.monthlyProjectLimit ?? null);
    setDailyProjectCount(data.dailyProjectCount ?? 0);
    setDailyProjectLimit(data.dailyProjectLimit ?? null);
    setIsLoggedIn(true);

    if (isSubscribed(userPlan)) {
      const models = getModelsForTier(userPlan);
      if (!models.some((m) => m.id === selectedModelId)) {
        setSelectedModelId(models[0]?.id ?? "gemini-3.1-flash-lite");
      }
    }
  };

  const [pendingDraft, setPendingDraft] = useState<GenerateDraft | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const skipAutosave = useRef(true);

  // Pastikan scroll body tidak tertinggal terkunci dari modal/dialog lain
  useEffect(() => {
    document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    fetch("/api/user/me")
      .then((res) => res.json())
      .then((data) => applyUserMe(data))
      .catch(() => {});

    // Initialize from browser storage after mount (deferred so state updates
    // don't run synchronously inside the effect body / during hydration).
    queueMicrotask(() => {
      const forkIdea = sessionStorage.getItem("arrobuild_fork_idea");
      const forkPresets = sessionStorage.getItem("arrobuild_fork_presets");
      const forkStep = sessionStorage.getItem("arrobuild_fork_step");
      let usedFork = false;
      if (forkIdea) {
        usedFork = true;
        try {
          if (forkIdea.startsWith("{")) {
            const parsed = JSON.parse(forkIdea);
            setProductType(parsed.type);
            setContextData(parsed.data || {});
          } else {
            setProductType("saas");
            setContextData({ freeText: forkIdea });
          }
          setIntakeMode("cepat");
          setStep(
            forkStep === "stack" || forkStep === "presets" ? "stack" : "product-type"
          );
        } catch {
          /* ignore bad fork payload */
        }
        sessionStorage.removeItem("arrobuild_fork_idea");
      }
      if (forkPresets) {
        try {
          setPresets(JSON.parse(forkPresets));
          if (!forkIdea && (forkStep === "stack" || forkStep === "presets")) {
            usedFork = true;
            setIntakeMode("cepat");
            setStep("stack");
          }
        } catch {
          /* ignore */
        }
        sessionStorage.removeItem("arrobuild_fork_presets");
      }
      if (forkStep) {
        sessionStorage.removeItem("arrobuild_fork_step");
      }

      if (!usedFork) {
        const draft = readGenerateDraft();
        if (draft && draftHasContent(draft)) {
          setPendingDraft(draft);
        }
      }

      skipAutosave.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sanitize tier-locked selections when the plan changes (adjust state during
  // render instead of in an effect to avoid cascading renders).
  const [prevPlan, setPrevPlan] = useState(plan);
  if (plan !== prevPlan) {
    setPrevPlan(plan);
    const previewTier = resolvePreviewTier(plan);
    setPerDocModelClass((prev) => sanitizePerDocumentModelClass(prev, previewTier));
    setSelectedDocs((prev) => {
      const next = sanitizeSelectedDocs(prev, previewTier);
      return next.length === prev.length && next.every((k, i) => k === prev[i])
        ? prev
        : next;
    });
  }

  const handlePerDocModelClassChange = useCallback(
    (doc: FileKey, mc: ModelClass) => {
      const previewTier = resolvePreviewTier(plan);
      if (!TIER_MODEL_CLASSES[previewTier].includes(mc)) return;
      setPerDocModelClass((prev) => ({ ...prev, [doc]: mc }));
    },
    [plan]
  );

  // Autosave form draft (debounce) — skip generating/preview
  useEffect(() => {
    if (skipAutosave.current) return;
    if (step === "generating" || step === "preview" || step === "interview") return;
    if (pendingDraft) return; // wait until user accepts/discards

    const timer = window.setTimeout(() => {
      writeGenerateDraft({
        step,
        intakeMode,
        productType,
        stage,
        contextData,
        features,
        presets,
        selectedDocs,
        selectedModelId,
        perDocModelClass,
      });
      setDraftSavedAt(Date.now());
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    step,
    intakeMode,
    productType,
    stage,
    contextData,
    features,
    presets,
    selectedDocs,
    selectedModelId,
    perDocModelClass,
    pendingDraft,
  ]);

  const applyDraft = (draft: GenerateDraft) => {
    if (draft.intakeMode) setIntakeMode(draft.intakeMode);
    if (draft.productType) setProductType(draft.productType);
    if (draft.stage) setStage(draft.stage);
    if (draft.contextData) setContextData(draft.contextData);
    if (draft.features) setFeatures(draft.features);
    if (draft.presets) setPresets(draft.presets);
    if (draft.selectedDocs) {
      setSelectedDocs(
        sanitizeSelectedDocs(draft.selectedDocs, resolvePreviewTier(plan))
      );
    }
    if (draft.selectedModelId) {
      setSelectedModelId(
        normalizeLegacyModelId(draft.selectedModelId) ?? "gemini-3.1-flash-lite"
      );
    }
    if (draft.perDocModelClass) {
      setPerDocModelClass(
        sanitizePerDocumentModelClass(
          draft.perDocModelClass,
          resolvePreviewTier(plan)
        )
      );
    }

    const restoreStep = draft.step as Step | undefined;
    const allowed: Step[] = [
      "mode",
      "product-type",
      "context",
      "stack",
      "docs",
      "confirm",
    ];
    if (restoreStep && allowed.includes(restoreStep)) {
      setStep(restoreStep);
    } else if (draft.productType) {
      setStep("context");
    }
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearGenerateDraft();
    setPendingDraft(null);
    serverDraftIdRef.current = undefined;
  };

  const refreshCredits = () => {
    fetch("/api/user/me")
      .then((res) => res.json())
      .then((data) => applyUserMe(data))
      .catch(() => {
        setIsLoggedIn(false);
      });
  };

  // Refresh balance when entering review so paywall isn't stale after interview spend
  useEffect(() => {
    if (step === "confirm" || step === "docs") refreshCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    refreshCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When stage changes, auto-apply smart preset for docs
  const handleSelectedDocsChange = useCallback(
    (docs: FileKey[]) => {
      setSelectedDocs(sanitizeSelectedDocs(docs, resolvePreviewTier(plan)));
    },
    [plan]
  );

  const handleStageChange = (s: ProjectStage) => {
    setStage(s);
    setSelectedDocs(
      sanitizeSelectedDocs([...STAGE_PRESETS[s]], resolvePreviewTier(plan))
    );
  };

  const handleModeSelect = (mode: IntakeMode) => {
    setIntakeMode(mode);
    if (mode === "cepat") setStep("product-type");
    else setStep("interview");
  };

  const handleInterviewFinished = (result: InterviewResult) => {
    if (result.productType) setProductType(result.productType);
    if (result.stage) {
      setStage(result.stage);
      setSelectedDocs(
        sanitizeSelectedDocs(
          [...STAGE_PRESETS[result.stage]],
          resolvePreviewTier(plan)
        )
      );
    }
    setContextData(result.contextData);
    setFeatures(result.features);
    refreshCredits();

    const hasMinimum =
      Boolean(result.productType) &&
      Boolean(result.contextData.targetUser) &&
      Boolean(result.contextData.mainProblem) &&
      result.features.length >= 1;

    if (result.incomplete || !hasMinimum) {
      if (result.productType) setStep("context");
      else setStep("product-type");
      return;
    }

    setStep("stack");
  };

  // Step index for the 4-step indicator (exclude mode/interview/confirm/generating/preview)
  const stepIndex = ["product-type", "context", "stack", "docs"].indexOf(step);

  // Build structured Knowledge Model JSON from all form state
  const buildKnowledgeModel = () => {
    const km: Record<string, unknown> = {};

    // Core identity
    if (productType) km.productType = productType;
    if (stage) km.projectStage = stage;

    // Context fields (only non-empty)
    const ctx: Record<string, string> = {};
    for (const [key, val] of Object.entries(contextData)) {
      if (val && typeof val === "string" && val.trim()) {
        ctx[key] = val.trim();
      } else if (typeof val === "boolean") {
        ctx[key] = String(val);
      }
    }
    if (Object.keys(ctx).length > 0) km.context = ctx;

    // Structured features
    if (features.length > 0) {
      km.features = features.map((f) => ({
        id: f.id,
        title: f.title,
        priority: f.priority,
        ...(f.description ? { description: f.description } : {}),
      }));
    }

    // Stack & preferences
    const stack: Record<string, string> = {};
    if (presets.framework) stack.framework = presets.framework;
    if (presets.backendFramework) stack.backendFramework = presets.backendFramework;
    if (presets.design) stack.design = presets.design;
    if (presets.agentTool) stack.agentTool = presets.agentTool;
    if (presets.programmingLanguage) stack.programmingLanguage = presets.programmingLanguage;
    if (presets.database) stack.database = presets.database;
    if (presets.deployment) stack.deployment = presets.deployment;
    if (presets.animationLibrary) stack.animationLibrary = presets.animationLibrary;
    if (presets.stackBundle) stack.stackBundle = presets.stackBundle;
    if (presets.designReferenceNote) stack.designReferenceNote = presets.designReferenceNote;
    if (presets.versionControl) stack.versionControl = presets.versionControl;
    if (presets.designHandoffTool) stack.designHandoffTool = presets.designHandoffTool;
    if (presets.projectManagementTool) stack.projectManagementTool = presets.projectManagementTool;
    if (Object.keys(stack).length > 0) km.stack = stack;

    return km;
  };

  // Serialize Knowledge Model to string for API backward compat
  // (API still expects `idea: string`)
  const buildIdeaString = (): string => {
    const km = buildKnowledgeModel();
    return JSON.stringify(km, null, 2);
  };

  // Server-side draft sync (debounced, logged-in only)
  useEffect(() => {
    if (!isLoggedIn || skipAutosave.current) return;
    if (step === "generating" || step === "preview" || step === "interview") return;
    if (pendingDraft) return;
    if (!productType && features.length === 0) return;

    const timer = window.setTimeout(() => {
      const planData = {
        ...buildKnowledgeModel(),
        selectedDocs,
        perDocumentModelClass: perDocModelClass,
        intakeMode,
        step,
      };
      fetch("/api/project/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: serverDraftIdRef.current,
          idea: buildIdeaString(),
          planData,
          clarifications: {},
          presets,
        }),
      })
        .then((r) => r.json())
        .then((d: { id?: string }) => {
          if (d.id) serverDraftIdRef.current = d.id;
        })
        .catch(() => {});
    }, 1500);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLoggedIn,
    step,
    intakeMode,
    productType,
    stage,
    contextData,
    features,
    presets,
    selectedDocs,
    perDocModelClass,
    pendingDraft,
  ]);

  // Summary string for confirm screen
  const buildContextSummary = (): string => {
    const parts: string[] = [];
    if (contextData.targetUser) parts.push(`Target: ${contextData.targetUser}`);
    if (contextData.mainProblem) parts.push(`Problem: ${contextData.mainProblem}`);
    if (contextData.coreFeatures) parts.push(`Fitur: ${contextData.coreFeatures}`);
    if (contextData.buyerDesc) parts.push(`Buyer: ${contextData.buyerDesc}`);
    if (contextData.aiUseCase) parts.push(`AI: ${contextData.aiUseCase}`);
    if (contextData.freeText) parts.push(contextData.freeText);
    return parts.slice(0, 3).join(" · ");
  };

  const handleReset = () => {
    setProductType(null);
    setStage(null);
    setContextData({});
    setFeatures([]);
    setPresets({
      framework: "nextjs",
      design: "neo-brutalist",
      agentTool: "cursor",
      stackBundle: undefined,
      programmingLanguage: undefined,
      database: undefined,
      deployment: undefined,
      animationLibrary: undefined,
      designReferenceNote: undefined,
      versionControl: undefined,
      designHandoffTool: undefined,
      projectManagementTool: undefined,
    });
    setSelectedDocs(["prd", "architecture", "plan-task", "design-system", "agent-rules"]);
    setSelectedModelId("gemini-3.1-flash-lite");
    setPerDocModelClass({});
    setProjectId(null);
    setGeneratedFiles({});
    setIntakeMode(null);
    setPendingDraft(null);
    setDraftSavedAt(null);
    clearGenerateDraft();
    serverDraftIdRef.current = undefined;
    setStep("mode");
  };

  const isFormStep = stepIndex >= 0;
  const showStepIndicator = isFormStep;

  // Step summary for breadcrumb
  const stepSummaries: Record<string, string> = {
    "product-type": productType ?? "",
    context: contextData.targetUser ? contextData.targetUser.split(" ").slice(0, 2).join(" ") : "",
    stack: presets.backendFramework
      ? `${presets.framework} + ${presets.backendFramework}`
      : presets.framework,
    docs: `${selectedDocs.length} dok`,
  };

  return (
    <AppShell tone="app" showFooter={false} padded={false}>
      <div
        className={`generate-app relative w-full min-h-screen overflow-x-hidden${
          pendingDraft ? " generate-app--draft-open" : ""
        }`}
      >
        {/* ── Sub-header step bar ── */}
        <header
          className="sticky top-0 z-40 border-b"
          style={{
            borderColor: "var(--app-border-default)",
            background: "rgba(13,19,33,0.95)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
            {/* Back to home */}
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm flex-shrink-0 transition-colors hover:opacity-70"
              style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">ArroBuild</span>
            </Link>

            {/* Step indicator — only during form steps */}
            {showStepIndicator && (
              <div className="flex items-center gap-0 flex-1 justify-center">
                {STEP_LABELS.map((label, i) => {
                  const isCompleted = i < stepIndex;
                  const isActive = i === stepIndex;
                  const summary = stepSummaries[
                    ["product-type", "context", "stack", "docs"][i]
                  ];
                  const stepName = ["product-type", "context", "stack", "docs"][i] as Step;

                  return (
                    <div key={label} className="flex items-center">
                      <button type="button"
                        onClick={() => isCompleted && setStep(stepName)}
                        className="flex items-center gap-2.5 transition-all group px-3"
                        style={{ cursor: isCompleted ? "pointer" : "default" }}
                        disabled={!isCompleted}
                      >
                        {/* Step circle */}
                        <div
                          className="flex-shrink-0 flex items-center justify-center transition-all duration-300"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: isCompleted
                              ? "var(--app-blue)"
                              : isActive
                              ? "rgba(255,176,32,0.1)"
                              : "transparent",
                            border: isCompleted
                              ? "none"
                              : isActive
                              ? "2px solid var(--app-amber)"
                              : "1px solid var(--app-border-default)",
                            boxShadow: isActive ? "0 0 12px rgba(255,176,32,0.18)" : "none",
                          }}
                        >
                          {isCompleted ? (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: isActive ? 700 : 500,
                                color: isActive ? "var(--app-amber)" : "rgba(240,243,250,0.3)",
                                fontFamily: "var(--font-jetbrains-mono), monospace",
                              }}
                            >
                              {i + 1}
                            </span>
                          )}
                        </div>

                        {/* Label + summary */}
                        <div className="hidden sm:flex flex-col items-start">
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: isActive ? 600 : 500,
                              color: isActive
                                ? "var(--app-text-primary)"
                                : isCompleted
                                ? "var(--app-sky)"
                                : "var(--app-text-tertiary)",
                              fontFamily: "var(--font-inter), system-ui, sans-serif",
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {label}
                          </span>
                          {isCompleted && summary && (
                            <span
                              className="max-w-[70px] truncate"
                              style={{
                                fontSize: 10,
                                color: "rgba(255,255,255,0.25)",
                                fontFamily: "var(--font-jetbrains-mono), monospace",
                                marginTop: 1,
                              }}
                            >
                              {summary}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Connector line */}
                      {i < 3 && (
                        <div
                          className="w-8 sm:w-12 h-px transition-all duration-500"
                          style={{
                            background: i < stepIndex
                              ? "var(--app-blue)"
                              : i === stepIndex
                              ? "var(--app-border-default)"
                              : "var(--app-border-default)",
                            borderStyle: i < stepIndex ? "solid" : "dashed",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mode / interview / confirm status */}
            {step === "mode" && (
              <span
                className="text-xs flex-1 text-center"
                style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
              >
                Pilih mode isi plan
              </span>
            )}
            {step === "interview" && (
              <span
                className="text-xs flex-1 text-center"
                style={{ color: "var(--app-sky)", fontFamily: "var(--font-jetbrains-mono), monospace" }}
              >
                Mode Dipandu AI
              </span>
            )}
            {step === "confirm" && (
              <span
                className="text-xs flex-1 text-center"
                style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
              >
                Review pilihan
              </span>
            )}
            {step === "generating" && (
              <span
                className="text-xs flex-1 text-center"
                style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
              >
                Generating...
              </span>
            )}
            {step === "preview" && (
              <span
                className="text-xs flex-1 text-center"
                style={{ color: "var(--app-sky)", fontFamily: "var(--font-jetbrains-mono), monospace" }}
              >
                ✦ Docs siap!
              </span>
            )}

            {/* Progress % + autosave hint */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {draftSavedAt &&
                step !== "generating" &&
                step !== "preview" &&
                !pendingDraft && (
                  <span
                    className="hidden sm:inline font-mono text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      color: "var(--app-sky)",
                      background: "rgba(56,189,248,0.1)",
                      border: "1px solid rgba(56,189,248,0.25)",
                    }}
                  >
                    Draft tersimpan
                  </span>
                )}
              {showStepIndicator && (
                <>
                  <div
                    className="w-16 h-1 rounded-full overflow-hidden"
                    style={{ background: "var(--app-bg-hover)" }}
                  >
                    <div
                      className="h-full transition-all duration-500 rounded-full"
                      style={{
                        width: `${((stepIndex + 1) / 4) * 100}%`,
                        background: "var(--app-amber)",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.3)",
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      minWidth: 28,
                      textAlign: "right",
                    }}
                  >
                    {Math.round(((stepIndex + 1) / 4) * 100)}%
                  </span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Draft restore — portal ke body agar overlay tidak bentrok dengan konten step */}
        {pendingDraft && (
          <DraftRestoreDialog
            savedAt={pendingDraft.savedAt}
            onContinue={() => applyDraft(pendingDraft)}
            onDiscard={discardDraft}
          />
        )}

        {/* ── Main content ── */}
        <div
          className={`relative z-10 w-full${
            pendingDraft ? " pointer-events-none select-none" : ""
          }`}
        >
          <div key={step} className="animate-fade-slide-up w-full">
          {step === "mode" && <ModeSelectStep onSelect={handleModeSelect} />}

          {step === "interview" && (
            <InterviewStep
              onFinished={handleInterviewFinished}
              onBack={() => {
                setIntakeMode(null);
                setStep("mode");
              }}
            />
          )}

          {step === "product-type" && (
            <ProductTypeStep
              value={productType}
              stage={stage}
              onChange={setProductType}
              onStageChange={handleStageChange}
              onNext={() => setStep("context")}
            />
          )}

          {step === "context" && productType && (
            <ContextStep
              productType={productType}
              value={contextData}
              onChange={setContextData}
              features={features}
              onFeaturesChange={setFeatures}
              onNext={() => setStep("stack")}
              onBack={() =>
                setStep(intakeMode === "dipandu" ? "mode" : "product-type")
              }
            />
          )}

          {step === "stack" && productType && (
            <StackStep
              value={presets}
              productType={productType}
              onChange={setPresets}
              onNext={() => setStep("docs")}
              onBack={() => setStep("context")}
            />
          )}

          {step === "docs" && (
            <DocumentPickerStep
              value={selectedDocs}
              stage={stage}
              plan={plan}
              perDocModelClass={perDocModelClass}
              onDocsChange={handleSelectedDocsChange}
              onModelClassChange={handlePerDocModelClassChange}
              onNext={() => setStep("confirm")}
              onBack={() => setStep("stack")}
            />
          )}

          {step === "confirm" && productType && (
            <ConfirmScreen
              productType={productType}
              stage={stage}
              contextSummary={buildContextSummary()}
              presets={presets}
              selectedDocs={selectedDocs}
              perDocModelClass={perDocModelClass}
              plan={plan}
              creditBalance={creditBalance}
              hasActiveSubscription={hasActiveSubscription}
              limitReached={
                monthlyProjectLimit !== null &&
                monthlyProjectCount >= monthlyProjectLimit
              }
              dailyLimitReached={
                dailyProjectLimit !== null && dailyProjectCount >= dailyProjectLimit
              }
              dailyProjectCount={dailyProjectCount}
              dailyProjectLimit={dailyProjectLimit ?? 0}
              onEdit={(s) => setStep(s)}
              onGenerate={() => {
                refreshCredits();
                setStep("generating");
              }}
            />
          )}

          {step === "generating" && (
            <GenerationProgress
              idea={buildIdeaString()}
              clarifications={{}}
              presets={presets}
              plan={plan}
              modelId={selectedModelId}
              selectedDocs={selectedDocs}
              perDocModelClass={perDocModelClass}
              estimatedCredits={calcTotalCredits(
                selectedDocs,
                resolvePreviewTier(plan),
                perDocModelClass
              )}
              productType={productType ?? undefined}
              projectStage={stage ?? undefined}
              features={features}
              onProjectCreated={setProjectId}
              onComplete={(files) => {
                clearGenerateDraft();
                setDraftSavedAt(null);
                setGeneratedFiles(files);
                if (projectId) {
                  router.push(`/project/${projectId}`);
                } else {
                  setStep("preview");
                }
              }}
              onError={() => setStep("confirm")}
            />
          )}

          {step === "preview" && (
            <DocPreview
              projectId={projectId}
              files={generatedFiles}
              onRestart={handleReset}
            />
          )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
