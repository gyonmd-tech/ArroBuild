"use client";

import type {
  ProductType,
  ProjectStage,
  Presets,
  FileKey,
  UserPlanStatus,
  PerDocumentModelClass,
} from "./types";
import {
  FILE_META,
  MODEL_CLASSES,
  DOC_DEFAULT_MODEL_CLASS,
  TIER_LABELS,
  TIER_CREDIT_POOL,
  PLAN_STATUS_LABELS,
  calcDocCredits,
  calcTotalCredits,
  resolvePreviewTier,
  isSubscribed,
  type UserTier,
} from "./types";
import {
  recommendTierForPlan,
  tierLabel,
  pricingHrefForTier,
} from "@/lib/services/tier-recommendation";
import { DocIcon, ModelClassIcon } from "@/lib/ui/app-icons";

interface Props {
  productType: ProductType;
  stage: ProjectStage | null;
  contextSummary: string;
  presets: Presets;
  selectedDocs: FileKey[];
  perDocModelClass: PerDocumentModelClass;
  plan: UserPlanStatus;
  creditBalance?: number;
  hasActiveSubscription?: boolean;
  limitReached?: boolean;
  dailyLimitReached?: boolean;
  dailyProjectCount?: number;
  dailyProjectLimit?: number;
  onEdit: (step: "product-type" | "context" | "stack" | "docs") => void;
  onGenerate: () => void;
}

const PRODUCT_LABELS: Record<ProductType, string> = {
  saas: "SaaS",
  marketplace: "Marketplace",
  mobile: "Mobile App",
  api: "API / Dev Tool",
  "ai-app": "AI-Powered App",
  ecommerce: "E-Commerce",
  portfolio: "Portfolio",
  internal: "Internal Tool",
  other: "Lainnya",
};

const STAGE_LABELS: Record<ProjectStage, string> = {
  idea: "Ide baru",
  prototype: "Ada prototype / MVP",
  production: "Sudah production",
};

const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: "Next.js",
  nuxt: "Nuxt.js",
  remix: "Remix",
  sveltekit: "SvelteKit",
  astro: "Astro",
  "react-spa": "React SPA",
  "vue-spa": "Vue SPA",
  "vanilla-js": "Vanilla JS",
  laravel: "Laravel",
  express: "Express.js",
  nestjs: "NestJS",
  fastapi: "FastAPI",
  django: "Django",
  rails: "Rails",
  "go-fiber": "Go Fiber",
  hono: "Hono",
  "react-native": "React Native",
  flutter: "Flutter",
  expo: "Expo",
  "native-ios": "Native iOS (Swift)",
  "native-android": "Native Android (Kotlin)",
  "ai-recommend": "Biarkan AI rekomendasikan",
};

const DESIGN_LABELS: Record<string, string> = {
  "neo-brutalist": "Neo-Brutalist",
  minimal: "Minimal",
  corporate: "Corporate",
  bold: "Bold & Colorful",
  glassmorphism: "Glassmorphism",
  dashboard: "Dashboard / Data",
  "ai-recommend": "Biarkan AI pilihkan",
  apple: "Apple Style",
  linear: "Linear Style",
  stripe: "Stripe Style",
  notion: "Notion Style",
  vercel: "Vercel Style",
};

const AGENT_LABELS: Record<string, string> = {
  cursor: "Cursor",
  "claude-code": "Claude Code",
  windsurf: "Windsurf",
  cline: "Cline",
  opencode: "OpenCode",
  custom: "Custom / Lainnya",
};

const DATABASE_LABELS: Record<string, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  sqlite: "SQLite",
  redis: "Redis",
  supabase: "Supabase",
  firebase: "Firebase",
  planetscale: "PlanetScale",
  turso: "Turso",
  pgvector: "pgvector",
  pinecone: "Pinecone",
  weaviate: "Weaviate",
  qdrant: "Qdrant",
  none: "Tidak pakai",
};

const ANIMATION_LABELS: Record<string, string> = {
  "framer-motion": "Framer Motion",
  gsap: "GSAP",
  lottie: "Lottie",
  rive: "Rive",
  "css-only": "CSS-only",
  "ai-recommend": "Biarkan AI",
};

const BUNDLE_LABELS: Record<string, string> = {
  "modern-fullstack": "⚡ Modern Fullstack",
  "classic-reliable": "🏛️ Classic Reliable",
  "ai-native": "🤖 AI-Native Stack",
  "mobile-crossplatform": "📱 Mobile Cross-platform",
  "marketplace-ready": "🛍️ Marketplace Ready",
  "portfolio-cepat": "🎨 Portfolio Cepat",
  custom: "🛠️ Rakit Sendiri",
};

const LANGUAGE_LABELS: Record<string, string> = {
  "javascript-typescript": "JavaScript / TypeScript",
  python: "Python",
  php: "PHP",
  ruby: "Ruby",
  go: "Go",
  dart: "Dart",
  swift: "Swift",
  kotlin: "Kotlin",
};

const VC_LABELS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  undecided: "Belum tahu",
};

const PM_LABELS: Record<string, string> = {
  notion: "Notion",
  linear: "Linear",
  trello: "Trello",
  none: "Tidak pakai",
};



function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="font-mono text-[10px] font-bold tracking-wide uppercase mt-0.5 flex-shrink-0 w-24"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-xs"
        style={{ color: "var(--color-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export default function ConfirmScreen({
  productType,
  stage,
  contextSummary,
  presets,
  selectedDocs,
  perDocModelClass,
  plan,
  creditBalance = 0,
  hasActiveSubscription = false,
  limitReached,
  dailyLimitReached = false,
  dailyProjectCount = 0,
  dailyProjectLimit = 0,
  onEdit,
  onGenerate,
}: Props) {
  const previewTier = resolvePreviewTier(plan);
  const totalCredits = calcTotalCredits(selectedDocs, previewTier, perDocModelClass);
  const creditPool = TIER_CREDIT_POOL[previewTier];
  const needsSubscription = !hasActiveSubscription;
  // Include balance 0 — previously `creditBalance > 0` hid the warning while
  // still disabling the button, so users saw a grey Generate with no reason.
  const insufficientCredits =
    hasActiveSubscription && creditBalance < totalCredits;
  const canGenerate =
    hasActiveSubscription &&
    !limitReached &&
    !dailyLimitReached &&
    creditBalance >= totalCredits;
  const balanceAfter = creditBalance - totalCredits;
  const planLabel = isSubscribed(plan)
    ? TIER_LABELS[plan]
    : PLAN_STATUS_LABELS.none;

  const tierRec = recommendTierForPlan({
    estimatedCredits: totalCredits,
    selectedDocs,
    perDocumentModelClass: perDocModelClass,
  });

  const tierRank: Record<UserTier, number> = { base: 1, core: 2, prime: 3 };
  const showTierHint =
    needsSubscription ||
    (hasActiveSubscription &&
      isSubscribed(plan) &&
      tierRank[plan] < tierRank[tierRec.recommended]);

  return (
    <div className="generate-app max-w-[720px] mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <span
          className="font-mono text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full mb-4 inline-block"
          style={{
            background: "rgba(255,176,32,0.08)",
            color: "var(--app-amber)",
            border: "0.5px solid rgba(255,176,32,0.25)",
          }}
        >
          Review & Generate
        </span>
        <h2
          className="font-unbounded font-extrabold text-[clamp(24px,3vw,28px)] mb-2"
          style={{ color: "var(--app-text-primary)", letterSpacing: "-0.02em" }}
        >
          Sudah semuanya?
        </h2>
        <p
          className="font-mono text-[14px]"
          style={{ color: "var(--app-text-secondary)" }}
        >
          Cek ringkasan proyekmu sebelum generate. Klik bagian manapun untuk edit.
        </p>
      </div>

      {/* Summary blocks */}
      <div className="flex flex-col gap-3 mb-6">
        {/* Product & Stage */}
        <button type="button"
          onClick={() => onEdit("product-type")}
          className="text-left px-4 py-4 rounded-xl transition-all group w-full"
          style={{
            background: "var(--color-bg-elevated)",
            border: "0.5px solid var(--color-border-default)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="font-mono text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "var(--app-amber)" }}
            >
              — Tipe & Fase
            </span>
            <span
              className="font-mono text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Edit →
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <SummaryRow label="Tipe" value={PRODUCT_LABELS[productType]} />
            <SummaryRow label="Fase" value={stage ? STAGE_LABELS[stage] : "—"} />
          </div>
        </button>

        {/* Context - Mini Brief Preview */}
        {contextSummary && (
          <div
            className="text-left px-4 py-4 rounded-xl transition-all w-full relative overflow-hidden group"
            style={{
              background: "var(--color-bg-elevated)",
              border: "0.5px solid var(--color-border-default)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="font-mono text-[10px] font-bold tracking-widest uppercase"
                style={{ color: "var(--app-amber)" }}
              >
                — Mini Brief Preview
              </span>
              <button type="button"
                onClick={() => onEdit("context")}
                className="font-mono text-[11px] opacity-0 group-hover:opacity-100 transition-opacity z-10 relative cursor-pointer hover:text-white"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Edit →
              </button>
            </div>
            
            {/* Outline document styling */}
            <div 
              className="p-3 rounded-lg relative text-xs"
              style={{
                background: "rgba(0,0,0,0.2)",
                border: "1px solid rgba(255,255,255,0.04)",
                fontFamily: "var(--font-jetbrains-mono), monospace",
              }}
            >
              <div className="flex items-center gap-2 mb-2 pb-2" style={{ borderBottom: "1px dashed rgba(255,255,255,0.1)" }}>
                <span className="w-2 h-2 rounded-full bg-red-500/50"></span>
                <span className="w-2 h-2 rounded-full bg-yellow-500/50"></span>
                <span className="w-2 h-2 rounded-full bg-green-500/50"></span>
                <span className="ml-2 text-[9px] opacity-50 uppercase">knowledge_model.json</span>
              </div>
              <p
                style={{
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.6,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {contextSummary}
              </p>
              
              {/* Fade out effect at bottom */}
              <div 
                className="absolute bottom-0 left-0 right-0 h-8 rounded-b-lg"
                style={{
                  background: "linear-gradient(to bottom, transparent, rgba(10,10,10,0.9))"
                }}
              />
            </div>
          </div>
        )}

        {/* Stack */}
        <button type="button"
          onClick={() => onEdit("stack")}
          className="text-left px-4 py-4 rounded-xl transition-all group w-full"
          style={{
            background: "var(--color-bg-elevated)",
            border: "0.5px solid var(--color-border-default)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="font-mono text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "var(--app-amber)" }}
            >
              — Stack & Style
            </span>
            <span
              className="font-mono text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Edit →
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {presets.stackBundle && (
              <SummaryRow
                label="Paket"
                value={BUNDLE_LABELS[presets.stackBundle] ?? presets.stackBundle}
              />
            )}
            {presets.programmingLanguage && (
              <SummaryRow
                label="Bahasa"
                value={LANGUAGE_LABELS[presets.programmingLanguage] ?? presets.programmingLanguage}
              />
            )}
            <SummaryRow
              label={presets.backendFramework ? "Frontend" : "Framework"}
              value={FRAMEWORK_LABELS[presets.framework] ?? presets.framework}
            />
            {presets.backendFramework && (
              <SummaryRow
                label="Backend"
                value={FRAMEWORK_LABELS[presets.backendFramework] ?? presets.backendFramework}
              />
            )}
            <SummaryRow
              label="Design"
              value={DESIGN_LABELS[presets.design] ?? presets.design}
            />
            <SummaryRow
              label="AI Tool"
              value={AGENT_LABELS[presets.agentTool] ?? presets.agentTool}
            />
            {presets.database && (
              <SummaryRow label="Database" value={DATABASE_LABELS[presets.database] ?? presets.database} />
            )}
            {presets.animationLibrary && (
              <SummaryRow label="Animasi" value={ANIMATION_LABELS[presets.animationLibrary] ?? presets.animationLibrary} />
            )}
            {presets.versionControl && (
              <SummaryRow label="VCS" value={VC_LABELS[presets.versionControl] ?? presets.versionControl} />
            )}
            {presets.projectManagementTool && presets.projectManagementTool !== "none" && (
              <SummaryRow label="PM Tool" value={PM_LABELS[presets.projectManagementTool] ?? presets.projectManagementTool} />
            )}
            {presets.designReferenceNote && (
              <SummaryRow label="Referensi" value={presets.designReferenceNote} />
            )}
          </div>
        </button>

        {/* Docs & Model */}
        <button type="button"
          onClick={() => onEdit("docs")}
          className="text-left px-4 py-4 rounded-xl transition-all group w-full"
          style={{
            background: "var(--color-bg-elevated)",
            border: "0.5px solid var(--color-border-default)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="font-mono text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "var(--app-amber)" }}
            >
              — Dokumen & Model
            </span>
            <span
              className="font-mono text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Edit →
            </span>
          </div>

          {/* Per-doc list with model class */}
          <div className="flex flex-col gap-1.5 mb-3">
            {selectedDocs.map((key) => {
              const mc = perDocModelClass[key] ?? DOC_DEFAULT_MODEL_CLASS[key][previewTier];
              const classInfo = MODEL_CLASSES.find((c) => c.id === mc);
              const credits = calcDocCredits(key, previewTier, mc);
              return (
                <div key={key} className="flex items-center justify-between">
                  <span
                    className="font-mono text-[11px] inline-flex items-center gap-1.5"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <DocIcon doc={key} size={12} />
                    {FILE_META[key].label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                      style={{
                        background:
                          mc === "hemat"
                            ? "rgba(34,197,94,0.1)"
                            : mc === "menengah"
                            ? "rgba(59,130,246,0.1)"
                            : mc === "flagship"
                            ? "rgba(168,85,247,0.1)"
                            : "rgba(255,199,0,0.1)",
                        color:
                          mc === "hemat"
                            ? "#22C55E"
                            : mc === "menengah"
                            ? "#60A5FA"
                            : mc === "flagship"
                            ? "#A855F7"
                            : "#FFC700",
                        fontWeight: 600,
                      }}
                    >
                      {mc && <ModelClassIcon modelClass={mc} size={10} />}
                      {classInfo?.label}
                    </span>
                    <span
                      className="font-mono text-[10px] font-bold"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      {credits} kr
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Total credits — prominent commit card */}
          <div
            className="rounded-xl px-5 py-5 mt-4"
            style={{
              background: "rgba(255,176,32,0.08)",
              border: "1px solid rgba(255,176,32,0.3)",
            }}
          >
            <p
              className="font-mono text-[12px] font-bold uppercase tracking-wide mb-2"
              style={{ color: "var(--app-amber)" }}
            >
              Biaya batch ini
            </p>
            <p
              className="font-unbounded font-extrabold"
              style={{ fontSize: 36, color: "var(--app-amber)", lineHeight: 1 }}
            >
              {totalCredits}{" "}
              <span className="font-mono text-[16px] font-bold" style={{ color: "var(--app-text-secondary)" }}>
                kredit
              </span>
            </p>
            <p className="font-mono text-[12px] mt-2" style={{ color: "var(--app-text-tertiary)" }}>
              Kredit langsung terpotong saat generate dimulai
            </p>
          </div>

          {/* Actual balance vs cost — not pool max disguised as balance */}
          <div
            className="mt-3 rounded-lg px-3 py-2.5 space-y-1.5"
            style={{
              background: insufficientCredits
                ? "rgba(239,68,68,0.08)"
                : "rgba(255,176,32,0.05)",
              border: insufficientCredits
                ? "0.5px solid rgba(239,68,68,0.25)"
                : "0.5px solid rgba(255,176,32,0.18)",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-mono text-[11px]"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Saldo kamu · {planLabel}
              </span>
              <span
                className="font-mono text-xs font-bold"
                style={{
                  color: insufficientCredits ? "#EF4444" : "var(--color-text-primary)",
                }}
              >
                {creditBalance.toLocaleString()} kredit
              </span>
            </div>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    (Math.max(creditBalance, 0) / Math.max(creditPool, 1)) * 100,
                    100
                  )}%`,
                  background: insufficientCredits ? "#EF4444" : "var(--app-amber)",
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span
                className="font-mono text-[10px]"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                Pool {planLabel}: {creditPool.toLocaleString()}/bulan
              </span>
              <span
                className="font-mono text-[10px]"
                style={{
                  color: canGenerate
                    ? "rgba(255,176,32,0.7)"
                    : "rgba(255,255,255,0.3)",
                }}
              >
                {canGenerate
                  ? `Sisa setelah generate: ${balanceAfter.toLocaleString()}`
                  : insufficientCredits
                    ? `Kurang ${Math.max(totalCredits - creditBalance, 0)} kredit`
                    : "—"}
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Paywall / warnings */}
      {needsSubscription ? (
        <div
          className="flex flex-col gap-2 px-4 py-3 rounded-xl mb-6"
          style={{
            background: "rgba(255,176,32,0.06)",
            border: "0.5px solid rgba(255,176,32,0.25)",
          }}
        >
          <div className="flex items-start gap-2">
            <span style={{ color: "var(--app-amber)", fontSize: 13, marginTop: 1 }}>🔒</span>
            <p
              className="font-mono text-xs font-bold"
              style={{ color: "var(--app-amber)", lineHeight: 1.6 }}
            >
              Paket berlangganan diperlukan untuk generate
            </p>
          </div>
          <p
            className="font-mono text-[11px]"
            style={{ color: "var(--color-text-secondary)", marginLeft: 22 }}
          >
            Isi form gratis — bayar hanya saat kamu siap generate dokumen. Estimasi batch ini:{" "}
            <strong>{totalCredits} kredit</strong>.
          </p>
          <p
            className="font-mono text-[11px]"
            style={{ color: "var(--color-text-secondary)", marginLeft: 22 }}
          >
            Rekomendasi: paket <strong>{tierLabel(tierRec.recommended)}</strong> — {tierRec.reason}
          </p>
          <a
            href={pricingHrefForTier(tierRec.recommended)}
            className="font-mono text-[11px] underline mt-1"
            style={{ color: "var(--app-amber)", marginLeft: 22 }}
          >
            Pilih {tierLabel(tierRec.recommended)} →
          </a>
        </div>
      ) : showTierHint ? (
        <div
          className="flex flex-col gap-2 px-4 py-3 rounded-xl mb-6"
          style={{
            background: "rgba(59,130,246,0.06)",
            border: "0.5px solid rgba(59,130,246,0.2)",
          }}
        >
          <p
            className="font-mono text-[11px]"
            style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}
          >
            Plan ini lebih cocok dengan paket <strong>{tierLabel(tierRec.recommended)}</strong>:{" "}
            {tierRec.reason}
          </p>
          <a
            href={pricingHrefForTier(tierRec.recommended)}
            className="font-mono text-[11px] underline"
            style={{ color: "#3B82F6" }}
          >
            Lihat paket {tierLabel(tierRec.recommended)} →
          </a>
        </div>
      ) : insufficientCredits ? (
        <div
          className="flex flex-col gap-2 px-4 py-3 rounded-xl mb-6"
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "0.5px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <div className="flex items-start gap-2">
            <span style={{ color: "#EF4444", fontSize: 13, marginTop: 1 }}>⚠</span>
            <p
              className="font-mono text-xs font-bold"
              style={{ color: "#EF4444", lineHeight: 1.6 }}
            >
              Kredit tidak cukup
            </p>
          </div>
          <p
            className="font-mono text-[11px]"
            style={{ color: "var(--color-text-secondary)", marginLeft: 22 }}
          >
            Dibutuhkan {totalCredits} kredit, saldo kamu {creditBalance.toLocaleString()} kredit.
          </p>
          <a
            href="/dashboard?upgrade=true"
            className="font-mono text-[11px] underline mt-1"
            style={{ color: "var(--app-amber)", marginLeft: 22 }}
          >
            Upgrade paket untuk tambah kredit →
          </a>
        </div>
      ) : dailyLimitReached ? (
        <div
          className="flex flex-col gap-2 px-4 py-3 rounded-xl mb-6"
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "0.5px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <div className="flex items-start gap-2">
            <span style={{ color: "#EF4444", fontSize: 13, marginTop: 1 }}>⚠</span>
            <p
              className="font-mono text-xs font-bold"
              style={{ color: "#EF4444", lineHeight: 1.6 }}
            >
              Limit harian generate tercapai
            </p>
          </div>
          <p
            className="font-mono text-[11px]"
            style={{ color: "var(--color-text-secondary)", marginLeft: 22 }}
          >
            {dailyProjectCount}/{dailyProjectLimit} proyek berhasil hari ini. Proyek gagal tidak
            dihitung — coba lagi besok atau lanjutkan testing setelah reset harian.
          </p>
        </div>
      ) : limitReached ? (
        <div
          className="flex flex-col gap-2 px-4 py-3 rounded-xl mb-6"
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "0.5px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <div className="flex items-start gap-2">
            <span style={{ color: "#EF4444", fontSize: 13, marginTop: 1 }}>⚠</span>
            <p
              className="font-mono text-xs font-bold"
              style={{ color: "#EF4444", lineHeight: 1.6 }}
            >
              Limit paket telah habis
            </p>
          </div>
          <p
            className="font-mono text-[11px]"
            style={{ color: "var(--color-text-secondary)", marginLeft: 22 }}
          >
            Kamu sudah mencapai batas pembuatan proyek. Silakan upgrade ke paket berbayar untuk terus menggunakan AI.
          </p>
          <a
            href="/dashboard?upgrade=true"
            className="font-mono text-[11px] underline mt-1"
            style={{ color: "var(--app-amber)", marginLeft: 22 }}
          >
            Lihat paket & upgrade →
          </a>
        </div>
      ) : (
        <div
          className="flex items-start gap-2 px-4 py-3 rounded-xl mb-6"
          style={{
            background: "rgba(59,130,246,0.06)",
            border: "0.5px solid rgba(59,130,246,0.2)",
          }}
        >
          <span style={{ color: "#3B82F6", fontSize: 13, marginTop: 1 }}>ⓘ</span>
          <p
            className="font-mono text-xs"
            style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}
          >
            Pastikan deskripsi proyekmu sudah lengkap untuk hasil yang lebih relevan dan spesifik.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button type="button"
          onClick={() => onEdit("docs")}
          className="px-5 py-3 rounded-xl font-mono text-sm transition-all"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-secondary)",
            border: "0.5px solid var(--color-border-default)",
          }}
        >
          ← Ubah pilihan
        </button>
        <button type="button"
          onClick={canGenerate ? onGenerate : undefined}
          disabled={!canGenerate}
          className="flex-1 py-3 rounded-xl font-mono font-bold text-sm transition-all flex items-center justify-center gap-2"
          style={{
            background: canGenerate ? "var(--app-amber)" : "var(--app-bg-elevated)",
            color: canGenerate ? "#0D1321" : "var(--app-text-tertiary)",
            cursor: canGenerate ? "pointer" : "not-allowed",
            border: canGenerate ? "none" : "0.5px solid var(--color-border-default)",
          }}
        >
          <span>✦</span>
          <span>
            {needsSubscription
              ? "Upgrade untuk generate"
              : insufficientCredits
              ? `Kredit kurang (${creditBalance}/${totalCredits})`
              : limitReached
              ? "Limit proyek habis"
              : `Generate sekarang (${totalCredits} kredit) →`}
          </span>
        </button>
      </div>
    </div>
  );
}

