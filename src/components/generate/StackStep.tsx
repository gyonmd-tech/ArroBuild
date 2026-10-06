"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ChevronDown, ChevronRight, Pencil, Package, Wrench } from "lucide-react";
import type {
  ProductType,
  Presets,
  Framework,
  AgentTool,
  Database,
  AnimationLibrary,
  StackBundleId,
  ProgrammingLanguage,
  VersionControl,
  DesignHandoffTool,
  ProjectManagementTool,
  Deployment,
} from "./types";
import {
  STACK_BUNDLES,
  LANGUAGE_FRAMEWORK_MAP,
  PRODUCT_DB_RECOMMENDATIONS,
  DESIGNS_DATA,
} from "./types";
import { TechLogo, TechLogoStack, TECH_DISPLAY_NAMES } from "@/lib/ui/tech-logos";

interface Props {
  productType: ProductType;
  value: Presets;
  onChange: (v: Presets) => void;
  onNext: () => void;
  onBack: () => void;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS: { id: ProgrammingLanguage; label: string }[] = [
  { id: "javascript-typescript", label: "JS / TS" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "go", label: "Go" },
  { id: "dart", label: "Dart" },
  { id: "ruby", label: "Ruby" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
];

type FrameworkGroup = { label: string; items: { id: Framework; label: string; desc: string }[] };

const SINGLE_FRAMEWORK_GROUPS = new Set(["Full-stack", "Mobile", "Biarkan AI"]);

function isFrameworkSelected(
  groupLabel: string,
  fwId: Framework,
  value: Presets
): boolean {
  if (groupLabel === "Backend") return value.backendFramework === fwId;
  return value.framework === fwId;
}

function handleFrameworkSelect(
  groupLabel: string,
  fwId: Framework,
  value: Presets,
  onChange: (next: Presets) => void
) {
  const patch = { stackBundle: undefined as Presets["stackBundle"] };

  if (SINGLE_FRAMEWORK_GROUPS.has(groupLabel)) {
    onChange({
      ...value,
      ...patch,
      framework: fwId,
      backendFramework: undefined,
    });
    return;
  }

  if (groupLabel === "Frontend") {
    onChange({
      ...value,
      ...patch,
      framework: value.framework === fwId ? value.framework : fwId,
    });
    return;
  }

  if (groupLabel === "Backend") {
    onChange({
      ...value,
      ...patch,
      backendFramework: value.backendFramework === fwId ? undefined : fwId,
    });
  }
}

const ALL_FRAMEWORK_GROUPS: FrameworkGroup[] = [
  {
    label: "Full-stack",
    items: [
      { id: "nextjs", label: "Next.js", desc: "React full-stack" },
      { id: "nuxt", label: "Nuxt.js", desc: "Vue full-stack" },
      { id: "remix", label: "Remix", desc: "React web" },
      { id: "sveltekit", label: "SvelteKit", desc: "Svelte full-stack" },
    ],
  },
  {
    label: "Frontend",
    items: [
      { id: "astro", label: "Astro", desc: "Static + content" },
      { id: "react-spa", label: "React SPA", desc: "Client-side" },
      { id: "vue-spa", label: "Vue SPA", desc: "Client-side" },
      { id: "vanilla-js", label: "Vanilla JS", desc: "No framework" },
    ],
  },
  {
    label: "Backend",
    items: [
      { id: "laravel", label: "Laravel", desc: "PHP framework" },
      { id: "express", label: "Express", desc: "Node.js minimal" },
      { id: "nestjs", label: "NestJS", desc: "Node.js structured" },
      { id: "fastapi", label: "FastAPI", desc: "Python async" },
      { id: "django", label: "Django", desc: "Python batteries" },
      { id: "rails", label: "Rails", desc: "Ruby web" },
      { id: "go-fiber", label: "Go Fiber", desc: "Go high-perf" },
      { id: "hono", label: "Hono", desc: "Edge-first" },
    ],
  },
  {
    label: "Mobile",
    items: [
      { id: "react-native", label: "React Native", desc: "Cross-platform" },
      { id: "flutter", label: "Flutter", desc: "Dart UI kit" },
      { id: "expo", label: "Expo", desc: "React Native+" },
      { id: "native-ios", label: "Native iOS", desc: "Swift" },
      { id: "native-android", label: "Native Android", desc: "Kotlin" },
    ],
  },
  {
    label: "Biarkan AI",
    items: [{ id: "ai-recommend", label: "AI Pilihkan", desc: "Sesuai konteks" }],
  },
];

const DB_CATEGORIES: { label: string; items: { id: Database; label: string; desc: string }[] }[] = [
  {
    label: "SQL / Relasional",
    items: [
      { id: "postgresql", label: "PostgreSQL", desc: "Open source, powerful" },
      { id: "mysql", label: "MySQL", desc: "Populer & reliabel" },
      { id: "sqlite", label: "SQLite", desc: "Ringan, embedded" },
    ],
  },
  {
    label: "Backend-as-a-Service",
    items: [
      { id: "supabase", label: "Supabase", desc: "Postgres + Auth + Storage" },
      { id: "firebase", label: "Firebase", desc: "Google BaaS" },
      { id: "planetscale", label: "PlanetScale", desc: "Serverless MySQL" },
      { id: "turso", label: "Turso", desc: "Edge SQLite" },
    ],
  },
  {
    label: "NoSQL",
    items: [
      { id: "mongodb", label: "MongoDB", desc: "Document-based" },
      { id: "redis", label: "Redis", desc: "In-memory cache" },
    ],
  },
  {
    label: "Vector (AI)",
    items: [
      { id: "pgvector", label: "pgvector", desc: "Postgres + vector" },
      { id: "pinecone", label: "Pinecone", desc: "Managed vector DB" },
      { id: "weaviate", label: "Weaviate", desc: "Open vector DB" },
      { id: "qdrant", label: "Qdrant", desc: "Rust vector DB" },
    ],
  },
  {
    label: "Tidak pakai",
    items: [{ id: "none", label: "Tidak pakai DB", desc: "Stateless / external" }],
  },
];



const AGENT_TOOLS: { id: AgentTool; label: string; desc: string; badge?: string }[] = [
  { id: "cursor", label: "Cursor", desc: "IDE + AI inline", badge: "Populer" },
  { id: "claude-code", label: "Claude Code", desc: "Terminal agent", badge: "Kuat" },
  { id: "windsurf", label: "Windsurf", desc: "IDE oleh Codeium" },
  { id: "cline", label: "Cline", desc: "VSCode extension" },
  { id: "opencode", label: "OpenCode", desc: "Open source TUI" },
  { id: "custom", label: "Custom / Lainnya", desc: "Workflow sendiri" },
];

const ANIMATION_LIBS: { id: AnimationLibrary; label: string; desc: string }[] = [
  { id: "framer-motion", label: "Framer Motion", desc: "React animation library" },
  { id: "gsap", label: "GSAP", desc: "Pro-grade, performant" },
  { id: "lottie", label: "Lottie", desc: "After Effects JSON" },
  { id: "rive", label: "Rive", desc: "Interactive graphics" },
  { id: "css-only", label: "CSS-only", desc: "Pure CSS transitions" },
  { id: "ai-recommend", label: "Biarkan AI", desc: "AI rekomendasikan" },
];

const DEPLOYMENT_OPTIONS: { id: Deployment; label: string }[] = [
  { id: "vercel", label: "Vercel" },
  { id: "netlify", label: "Netlify" },
  { id: "railway", label: "Railway" },
  { id: "fly-io", label: "Fly.io" },
  { id: "vps", label: "VPS / Dedicated" },
  { id: "docker", label: "Docker" },
  { id: "aws", label: "AWS / GCP / Azure" },
  { id: "none", label: "Tidak pakai" },
];

const VC_OPTIONS: { id: VersionControl; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "gitlab", label: "GitLab" },
  { id: "bitbucket", label: "Bitbucket" },
  { id: "undecided", label: "Belum tahu" },
];

const DESIGN_HANDOFF_OPTIONS: { id: DesignHandoffTool; label: string }[] = [
  { id: "figma", label: "Figma" },
  { id: "sketch", label: "Sketch" },
  { id: "adobe-xd", label: "Adobe XD" },
  { id: "none", label: "Tidak pakai" },
];

const PM_OPTIONS: { id: ProjectManagementTool; label: string }[] = [
  { id: "notion", label: "Notion" },
  { id: "linear", label: "Linear" },
  { id: "trello", label: "Trello" },
  { id: "none", label: "Tidak pakai" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionTitle({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h3
        className="text-xs font-bold tracking-[0.18em] uppercase mb-1"
        style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-jetbrains-mono), monospace" }}
      >
        {children}
      </h3>
      {subtitle && (
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div
      className="my-8"
      style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}
    />
  );
}

function StackSummaryCard({
  value,
  onNext,
  canProceed,
}: {
  value: Presets;
  onNext: () => void;
  canProceed: boolean;
}) {
  const FRAMEWORK_LABELS: Record<string, string> = {
    nextjs: "Next.js", nuxt: "Nuxt.js", remix: "Remix", sveltekit: "SvelteKit",
    astro: "Astro", "react-spa": "React SPA", "vue-spa": "Vue SPA", "vanilla-js": "Vanilla JS",
    laravel: "Laravel", express: "Express", nestjs: "NestJS", fastapi: "FastAPI",
    django: "Django", rails: "Rails", "go-fiber": "Go Fiber", hono: "Hono",
    "react-native": "React Native", flutter: "Flutter", expo: "Expo",
    "native-ios": "iOS (Swift)", "native-android": "Android (Kotlin)",
    "ai-recommend": "AI Pilihkan",
  };
  const DESIGN_LABELS: Record<string, string> = {
    "neo-brutalist": "Neo-Brutalist", minimal: "Minimal", corporate: "Corporate",
    bold: "Bold", glassmorphism: "Glassmorphism", dashboard: "Dashboard",
    apple: "Apple", linear: "Linear", stripe: "Stripe", notion: "Notion",
    vercel: "Vercel", "ai-recommend": "AI Pilihkan",
  };
  const AGENT_LABELS: Record<string, string> = {
    cursor: "Cursor", "claude-code": "Claude Code", windsurf: "Windsurf",
    cline: "Cline", opencode: "OpenCode", custom: "Custom",
  };
  const DB_LABELS: Record<string, string> = {
    postgresql: "PostgreSQL", mysql: "MySQL", sqlite: "SQLite", mongodb: "MongoDB",
    redis: "Redis", supabase: "Supabase", firebase: "Firebase", planetscale: "PlanetScale",
    turso: "Turso", pgvector: "pgvector", pinecone: "Pinecone", weaviate: "Weaviate",
    qdrant: "Qdrant", none: "Tidak pakai",
  };
  const DEPLOY_LABELS: Record<string, string> = {
    vercel: "Vercel", netlify: "Netlify", railway: "Railway", "fly-io": "Fly.io",
    vps: "VPS", docker: "Docker", aws: "AWS/GCP", none: "Tidak pakai",
  };
  const ANIM_LABELS: Record<string, string> = {
    "framer-motion": "Framer Motion", gsap: "GSAP", lottie: "Lottie", rive: "Rive",
    "css-only": "CSS-only", "ai-recommend": "AI Pilihkan",
  };

  const rows: { label: string; value: string; techKey?: string; highlight?: boolean }[] = [
    {
      label: value.backendFramework ? "Frontend" : "Framework",
      value: FRAMEWORK_LABELS[value.framework] ?? value.framework,
      techKey: value.framework,
      highlight: true,
    },
    ...(value.backendFramework
      ? [{
          label: "Backend",
          value: FRAMEWORK_LABELS[value.backendFramework] ?? value.backendFramework,
          techKey: value.backendFramework,
          highlight: true,
        }]
      : []),
    { label: "Design", value: DESIGN_LABELS[value.design] ?? value.design },
    { label: "AI Tool", value: AGENT_LABELS[value.agentTool] ?? value.agentTool, techKey: value.agentTool },
  ];
  if (value.database) {
    rows.push({
      label: "Database",
      value: DB_LABELS[value.database] ?? value.database,
      techKey: value.database,
    });
  }
  if (value.animationLibrary) {
    rows.push({
      label: "Animasi",
      value: ANIM_LABELS[value.animationLibrary] ?? value.animationLibrary,
      techKey: value.animationLibrary,
    });
  }
  if (value.deployment) {
    rows.push({
      label: "Deploy",
      value: DEPLOY_LABELS[value.deployment] ?? value.deployment,
      techKey: value.deployment,
    });
  }

  const summaryKey = `${value.stackBundle ?? "custom"}-${value.framework}-${value.database ?? ""}`;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--app-bg-elevated)",
        border: "0.5px solid var(--app-border-default)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      <div className="px-5 py-4" style={{ borderBottom: "0.5px solid var(--app-border-default)" }}>
        <div className="flex items-center gap-2">
          <Package size={18} strokeWidth={1.75} style={{ color: "var(--app-amber)" }} />
          <span className="font-unbounded text-[15px] font-bold" style={{ color: "var(--app-text-primary)" }}>
            Stack Kamu
          </span>
          {value.stackBundle && (
            <span
              className="ml-auto font-mono text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
              style={{
                background: "rgba(255,176,32,0.1)",
                color: "var(--app-amber)",
                border: "1px solid rgba(255,176,32,0.25)",
              }}
            >
              {value.stackBundle.replace(/-/g, " ")}
            </span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={summaryKey}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] as const }}
          className="px-5 py-3"
        >
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-2.5 gap-3"
              style={{
                borderBottom: i < rows.length - 1 ? "0.5px solid var(--app-border-default)" : "none",
              }}
            >
              <span
                className="font-mono text-[11px] font-semibold uppercase tracking-wide shrink-0"
                style={{ color: "var(--app-text-tertiary)" }}
              >
                {row.label}
              </span>
              <span className="flex items-center gap-2 min-w-0">
                {row.techKey && (
                  <TechLogo
                    name={TECH_DISPLAY_NAMES[row.techKey] ?? row.value}
                    size={14}
                  />
                )}
                <span
                  className="font-mono text-[13px] font-semibold truncate"
                  style={{ color: row.highlight ? "var(--app-text-primary)" : "var(--app-text-secondary)" }}
                >
                  {row.value}
                </span>
              </span>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="px-5 pb-5 pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="w-full py-3.5 rounded-lg font-mono font-bold text-[14px] transition-all duration-120"
          style={{
            background: canProceed ? "var(--app-amber)" : "var(--app-bg-hover)",
            color: canProceed ? "#0D1321" : "var(--app-text-tertiary)",
            cursor: canProceed ? "pointer" : "not-allowed",
            border: canProceed ? "none" : "0.5px solid var(--app-border-default)",
          }}
        >
          Lanjut ke Dokumen →
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StackStep({ productType, value, onChange, onNext, onBack }: Props) {
  const [showCustomize, setShowCustomize] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const update = (patch: Partial<Presets>) => onChange({ ...value, ...patch });

  // Recommend bundle for this product type
  const BUNDLE_RECOMMENDATIONS: Partial<Record<ProductType, StackBundleId>> = {
    saas: "modern-fullstack",
    marketplace: "marketplace-ready",
    "ai-app": "ai-native",
    mobile: "mobile-crossplatform",
    portfolio: "portfolio-cepat",
  };
  const recommendedBundle = BUNDLE_RECOMMENDATIONS[productType];

  // Get filtered frameworks by selected language
  const filteredGroups: FrameworkGroup[] = (() => {
    if (!value.programmingLanguage) return ALL_FRAMEWORK_GROUPS;
    const allowed = LANGUAGE_FRAMEWORK_MAP[value.programmingLanguage] ?? [];
    return ALL_FRAMEWORK_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((fw) => allowed.includes(fw.id)),
    })).filter((g) => g.items.length > 0);
  })();

  // Recommended DBs for this product
  const recommendedDBs = PRODUCT_DB_RECOMMENDATIONS[productType] ?? [];

  // Show animation section: only for web products
  const showAnimation = !["api", "internal"].includes(productType);

  return (
    <div className="generate-app w-full max-w-[1100px] mx-auto px-4 sm:px-6 py-10 sm:py-14">
      {/* Header */}
      <div className="mb-10 max-w-3xl">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[11px] font-bold tracking-widest uppercase mb-5"
          style={{
            background: "rgba(255,176,32,0.08)",
            color: "var(--app-amber)",
            border: "0.5px solid rgba(255,176,32,0.2)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--app-amber)" }} />
          Step 3 of 4
        </div>
        <h1
          className="font-unbounded font-extrabold mb-3"
          style={{
            fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
            letterSpacing: "-0.02em",
            color: "var(--app-text-primary)",
            lineHeight: 1.15,
          }}
        >
          Tech stack & preferences
        </h1>
        <p className="text-base font-mono text-[14px]" style={{ color: "var(--app-text-secondary)", lineHeight: 1.6 }}>
          Pilih paket siap pakai, atau rakit sendiri sesuai kebutuhan.{" "}
          <span style={{ color: "rgba(255,255,255,0.3)" }}>
            AI akan menyesuaikan output dengan stack yang kamu pilih.
          </span>
        </p>
      </div>

      {/* Two-column layout: form left, summary sticky right */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* ── LEFT: Form ── */}
        <div className="flex-1 min-w-0">

          {/* ═══ A: Stack Bundles ═══ */}
          <SectionTitle subtitle="Pilih preset lengkap, atau rakit dari nol di bawah">
            Paket Stack
          </SectionTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {STACK_BUNDLES.map((bundle) => {
              const isSelected = value.stackBundle === bundle.id;
              const isRecommended = bundle.id === recommendedBundle;

              return (
                <button type="button"
                  key={bundle.id}
                  onClick={() => {
                    if (isSelected) {
                      update({ stackBundle: undefined });
                      return;
                    }
                    update({
                      stackBundle: bundle.id,
                      framework: bundle.framework,
                      backendFramework: undefined,
                      database: bundle.database,
                      deployment: bundle.deployment,
                      animationLibrary: bundle.animationLibrary,
                      programmingLanguage: bundle.programmingLanguage,
                    });
                    setShowCustomize(false);
                  }}
                  className="relative text-left rounded-2xl transition-all duration-200 group"
                  style={{
                    padding: "18px 20px",
                    background: isSelected
                      ? "rgba(255,176,32,0.04)"
                      : "var(--app-bg-elevated)",
                    border: isSelected
                      ? "1.5px solid var(--app-amber)"
                      : "0.5px solid var(--app-border-default)",
                    transform: isSelected ? "translateY(-2px)" : "none",
                    boxShadow: isSelected
                      ? "0 8px 24px rgba(0,0,0,0.3)"
                      : "none",
                  }}
                >
                  <div className="flex flex-col gap-3 mb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold text-sm"
                          style={{
                            color: isSelected ? "var(--app-amber)" : "var(--app-text-primary)",
                          }}
                        >
                          {bundle.label}
                        </span>
                        {isRecommended && (
                          <span
                            className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: "rgba(56,189,248,0.12)",
                              color: "var(--app-sky)",
                              border: "1px solid rgba(56,189,248,0.25)",
                            }}
                          >
                            <Sparkles size={10} strokeWidth={2} />
                            Cocok
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <TechLogoStack names={bundle.techBadges} size={13} />
                        {isSelected && (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: "var(--app-amber)" }}
                          >
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tech badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {bundle.techBadges.slice(0, 4).map((tech) => (
                      <span key={tech} className="tech-badge">
                        {tech}
                      </span>
                    ))}
                    {bundle.techBadges.length > 4 && (
                      <span className="tech-badge">+{bundle.techBadges.length - 4}</span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Rakit Sendiri */}
            <button type="button"
              onClick={() => {
                update({ stackBundle: undefined });
                setShowCustomize(true);
              }}
              className="text-left rounded-2xl transition-all duration-200"
              style={{
                padding: "18px 20px",
                background: !value.stackBundle ? "rgba(255,255,255,0.03)" : "var(--color-bg-elevated)",
                border: !value.stackBundle
                  ? "1.5px dashed rgba(255,255,255,0.15)"
                  : "0.5px dashed rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Wrench size={18} strokeWidth={1.75} style={{ color: "var(--app-text-tertiary)" }} />
                <span className="font-semibold text-sm" style={{ color: "var(--app-text-secondary)" }}>
                  Rakit Sendiri
                </span>
              </div>
              <p className="text-xs font-mono" style={{ color: "var(--app-text-tertiary)" }}>
                Pilih tiap bagian manual
              </p>
            </button>
          </div>

          {/* Customize from bundle */}
          {value.stackBundle && (
            <button
              type="button"
              onClick={() => setShowCustomize(!showCustomize)}
              className="flex items-center gap-2 font-mono text-[13px] mb-6 transition-colors"
              style={{ color: showCustomize ? "var(--app-amber)" : "var(--app-text-tertiary)" }}
            >
              {showCustomize ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Pencil size={13} strokeWidth={1.75} />
              <span>{showCustomize ? "Sembunyikan kustomisasi" : "Sesuaikan dari sini"}</span>
            </button>
          )}

          {/* ═══ B–G: Customization Sections ═══ */}
          {(showCustomize || !value.stackBundle) && (
            <div className="animate-fade-slide-up space-y-0">

              <Divider />

              {/* ── B: Language ── */}
              <SectionTitle subtitle="Filter framework berdasarkan bahasa">
                Bahasa Pemrograman
              </SectionTitle>
              <div className="flex flex-wrap gap-2 mb-6">
                {LANGUAGE_OPTIONS.map((lang) => {
                  const isActive = value.programmingLanguage === lang.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => update({ programmingLanguage: isActive ? undefined : lang.id })}
                      className={`generate-chip ${isActive ? "is-selected" : ""}`}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>

              {/* ── Framework grid ── */}
              <SectionTitle subtitle="Pilih frontend dan backend secara terpisah, atau satu framework full-stack">
                Framework
              </SectionTitle>
              <div className="space-y-4 mb-6">
                {filteredGroups.map((group) => (
                  <div key={group.label}>
                    <p
                      className="text-xs font-medium mb-2"
                      style={{
                        color: "rgba(255,255,255,0.25)",
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        fontSize: "10px",
                      }}
                    >
                      {group.label}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {group.items.map((fw) => {
                        const isActive = isFrameworkSelected(group.label, fw.id, value);
                        return (
                          <button
                            type="button"
                            key={fw.id}
                            onClick={() => handleFrameworkSelect(group.label, fw.id, value, onChange)}
                            className="text-left rounded-xl px-4 py-3 transition-all duration-150"
                            style={{
                              background: isActive
                                ? "rgba(255,176,32,0.07)"
                                : "rgba(255,255,255,0.03)",
                              border: isActive
                                ? "1.5px solid rgba(255,176,32,0.4)"
                                : "0.5px solid rgba(255,255,255,0.07)",
                            }}
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <TechLogo name={TECH_DISPLAY_NAMES[fw.id] ?? fw.label} size={14} />
                              <div
                                className="font-mono font-semibold text-[13px]"
                                style={{ color: isActive ? "var(--app-amber)" : "var(--app-text-primary)" }}
                              >
                                {fw.label}
                              </div>
                            </div>
                            <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                              {fw.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <Divider />

              {/* ── C: Database ── */}
              <SectionTitle subtitle="Database dan storage yang dipakai">
                Database
              </SectionTitle>
              {recommendedDBs.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Rekomendasi untuk{" "}
                    <span style={{ color: "rgba(255,176,32,0.6)" }}>
                      {productType}:
                    </span>
                  </span>
                  {recommendedDBs.map((db) => (
                    <button
                      key={db}
                      type="button"
                      onClick={() => update({ database: db })}
                      className="generate-chip inline-flex items-center gap-1.5 !text-[11px] !py-1 !px-2.5"
                    >
                      <Sparkles size={10} strokeWidth={2} />
                      {db}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-4 mb-6">
                {DB_CATEGORIES.map((cat) => (
                  <div key={cat.label}>
                    <p
                      className="text-xs font-medium mb-2 font-mono uppercase tracking-wider"
                      style={{ color: "var(--app-text-tertiary)", fontSize: "10px" }}
                    >
                      {cat.label}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {cat.items.map((db) => {
                        const isActive = value.database === db.id;
                        return (
                          <button
                            key={db.id}
                            type="button"
                            onClick={() => update({ database: db.id })}
                            className="text-left rounded-xl px-4 py-3 transition-all duration-150"
                            style={{
                              background: isActive
                                ? "rgba(255,176,32,0.07)"
                                : "var(--app-bg-elevated)",
                              border: isActive
                                ? "1.5px solid rgba(255,176,32,0.4)"
                                : "0.5px solid var(--app-border-default)",
                            }}
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <TechLogo name={TECH_DISPLAY_NAMES[db.id] ?? db.label} size={14} />
                              <div
                                className="font-mono font-semibold text-[13px]"
                                style={{ color: isActive ? "var(--app-amber)" : "var(--app-text-primary)" }}
                              >
                                {db.label}
                              </div>
                            </div>
                            <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                              {db.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <Divider />

              {/* ── D: Animation (conditional) ── */}
              {showAnimation && (
                <>
                  <SectionTitle subtitle="Library untuk micro-interaction dan animasi">
                    Animasi & Motion
                  </SectionTitle>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                    {ANIMATION_LIBS.map((lib) => {
                      const isActive = value.animationLibrary === lib.id;
                      return (
                        <button type="button"
                          key={lib.id}
                          onClick={() => update({ animationLibrary: isActive ? undefined : lib.id })}
                          className="text-left rounded-xl px-4 py-3 transition-all duration-150"
                          style={{
                            background: isActive ? "rgba(255,176,32,0.07)" : "rgba(255,255,255,0.03)",
                            border: isActive
                              ? "1.5px solid rgba(255,176,32,0.4)"
                              : "0.5px solid rgba(255,255,255,0.07)",
                          }}
                        >
                          <div
                            className="font-mono font-semibold text-[13px] mb-0.5"
                            style={{ color: isActive ? "var(--app-amber)" : "var(--app-text-primary)" }}
                          >
                            {lib.label}
                          </div>
                          <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                            {lib.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <Divider />
                </>
              )}

              {/* ── E: Design Style ── */}
              <SectionTitle subtitle="Gaya visual yang jadi referensi AI saat generate docs">
                Design Style
              </SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {DESIGNS_DATA.map((ds) => {
                  const isActive = value.design === ds.id;
                  return (
                    <button type="button"
                      key={ds.id}
                      onClick={() => update({ design: ds.id })}
                      className="text-left rounded-xl overflow-hidden transition-all duration-300 group flex flex-col"
                      style={{
                        background: isActive ? "rgba(255,176,32,0.04)" : "rgba(255,255,255,0.02)",
                        border: isActive
                          ? "1.5px solid rgba(255,176,32,0.5)"
                          : "0.5px solid rgba(255,255,255,0.08)",
                        height: "100%",
                      }}
                    >
                      {/* Mini Preview Mockup */}
                      <div
                        className="h-24 w-full flex items-center justify-center relative overflow-hidden"
                        style={{
                          background: ds.id === "apple" || ds.id === "vercel" || ds.id === "minimal" 
                            ? "#FFFFFF" 
                            : ds.id === "neo-brutalist" ? "#FFB020" 
                            : "rgba(255,255,255,0.04)",
                          borderBottom: "1px solid rgba(255,255,255,0.05)"
                        }}
                      >
                        {/* Placeholder abstract shapes based on id for a visual vibe */}
                        {ds.id === "neo-brutalist" && (
                          <div className="w-16 h-16 border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rotate-3" />
                        )}
                        {ds.id === "glassmorphism" && (
                          <div className="w-20 h-12 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md shadow-lg" />
                        )}
                        {ds.id === "linear" && (
                          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#5E5CE6] to-[#A399FF] blur-sm opacity-50" />
                        )}
                        {ds.id === "apple" && (
                          <div className="w-16 h-10 rounded-full bg-gray-100 shadow-inner flex items-center px-1"><div className="w-8 h-8 rounded-full bg-white shadow" /></div>
                        )}
                        {(ds.id !== "neo-brutalist" && ds.id !== "glassmorphism" && ds.id !== "linear" && ds.id !== "apple") && (
                          <div className="text-3xl opacity-50 grayscale group-hover:grayscale-0 transition-all duration-300 transform group-hover:scale-110">
                            {ds.swatch}
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4 flex flex-col flex-grow">
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="font-bold text-sm"
                            style={{ color: isActive ? "var(--app-amber)" : "var(--app-text-primary)" }}
                          >
                            {ds.label}
                          </span>
                          {isActive && <span className="text-xs" style={{ color: "var(--app-amber)" }}>✓</span>}
                        </div>
                        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
                          {ds.desc}
                        </p>
                        <div className="mt-auto">
                          <div 
                            className="text-[10px] px-2 py-1.5 rounded bg-black/20 border border-white/5 leading-relaxed"
                            style={{ color: "rgba(255,255,255,0.4)" }}
                          >
                            <span className="opacity-60 block mb-0.5">Lineage:</span>
                            {ds.lineage}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Design reference input */}
              <input
                type="text"
                maxLength={200}
                placeholder="Punya referensi sendiri? Tempel link atau deskripsikan gaya yang kamu suka (opsional)"
                value={value.designReferenceNote ?? ""}
                onChange={(e) => update({ designReferenceNote: e.target.value || undefined })}
                className="w-full rounded-xl text-sm transition-all focus:outline-none mb-6"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  color: "var(--color-text-primary)",
                  padding: "13px 16px",
                  fontFamily: "var(--font-inter), system-ui, sans-serif",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,176,32,0.4)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,176,32,0.04)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />

              <Divider />

              {/* ── F: AI Tool ── */}
              <SectionTitle subtitle="Dokumentasi akan dioptimasi untuk tool ini">
                AI Tool Target
              </SectionTitle>
              <div className="flex flex-wrap gap-2 mb-6">
                {AGENT_TOOLS.map((tool) => {
                  const isActive = value.agentTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => update({ agentTool: tool.id })}
                      className={`generate-chip inline-flex items-center gap-2 ${isActive ? "is-selected" : ""}`}
                    >
                      <TechLogo name={TECH_DISPLAY_NAMES[tool.id] ?? tool.label} size={14} />
                      <span>{tool.label}</span>
                      {tool.badge && !isActive && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-bold font-mono"
                          style={{
                            background: "rgba(255,176,32,0.1)",
                            color: "var(--app-amber)",
                          }}
                        >
                          {tool.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {value.agentTool === "cursor" && (
                <p
                  className="text-xs mb-6 animate-fade-slide-up"
                  style={{
                    color: "rgba(255,176,32,0.5)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                  }}
                >
                  Output akan dioptimasi untuk{" "}
                  <span style={{ color: "var(--app-amber)" }}>.cursorrules</span>
                </p>
              )}
              {value.agentTool === "claude-code" && (
                <p
                  className="text-xs mb-6 animate-fade-slide-up"
                  style={{
                    color: "rgba(255,176,32,0.5)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                  }}
                >
                  Output akan dioptimasi untuk{" "}
                  <span style={{ color: "var(--app-amber)" }}>CLAUDE.md</span>
                </p>
              )}

              <Divider />

              {/* ── G: Deployment ── */}
              <SectionTitle subtitle="Rencana deployment aplikasi">
                Deployment
              </SectionTitle>
              <div className="flex flex-wrap gap-2 mb-6">
                {DEPLOYMENT_OPTIONS.map((dep) => {
                  const isActive = value.deployment === dep.id;
                  return (
                    <button
                      key={dep.id}
                      type="button"
                      onClick={() => update({ deployment: isActive ? undefined : dep.id })}
                      className={`generate-chip inline-flex items-center gap-2 ${isActive ? "is-selected" : ""}`}
                    >
                      <TechLogo name={TECH_DISPLAY_NAMES[dep.id] ?? dep.label} size={14} />
                      {dep.label}
                    </button>
                  );
                })}
              </div>

              {/* ── H: Tools Ekosistem (collapsible) ── */}
              <button type="button"
                onClick={() => setShowTools(!showTools)}
                className="flex items-center gap-2 text-sm transition-colors mb-4 w-full text-left"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                <div
                  className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: showTools ? "rgba(255,176,32,0.1)" : "rgba(255,255,255,0.05)",
                    border: showTools ? "0.5px solid rgba(255,176,32,0.2)" : "0.5px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span
                    className="text-[10px] transition-transform duration-200"
                    style={{
                      transform: showTools ? "rotate(90deg)" : "none",
                      display: "inline-block",
                      color: showTools ? "var(--app-amber)" : "var(--app-text-tertiary)",
                    }}
                  >
                    ▶
                  </span>
                </div>
                <span>
                  {showTools ? "Sembunyikan" : "🛠 Tools & Ekosistem Dev (opsional)"}
                  <span className="ml-2 text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                    (VCS, Figma, PM tool...)
                  </span>
                </span>
              </button>

              {showTools && (
                <div
                  className="rounded-2xl overflow-hidden animate-fade-slide-up"
                  style={{ border: "0.5px solid rgba(255,255,255,0.08)" }}
                >
                  {/* Version Control */}
                  <div
                    className="px-5 py-4"
                    style={{ borderBottom: "0.5px solid rgba(255,255,255,0.06)", background: "var(--color-bg-elevated)" }}
                  >
                    <p className="text-xs font-semibold mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Version Control
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {VC_OPTIONS.map((vc) => {
                        const isActive = value.versionControl === vc.id;
                        return (
                          <button
                            key={vc.id}
                            type="button"
                            onClick={() => update({ versionControl: isActive ? undefined : vc.id })}
                            className={`generate-chip ${isActive ? "is-selected" : ""}`}
                          >
                            {vc.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Design Handoff */}
                  <div
                    className="px-5 py-4"
                    style={{ borderBottom: "0.5px solid rgba(255,255,255,0.06)", background: "var(--color-bg-elevated)" }}
                  >
                    <p className="text-xs font-semibold mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Design Handoff Tool
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {DESIGN_HANDOFF_OPTIONS.map((dh) => {
                        const isActive = value.designHandoffTool === dh.id;
                        return (
                          <button
                            key={dh.id}
                            type="button"
                            onClick={() => update({ designHandoffTool: isActive ? undefined : dh.id })}
                            className={`generate-chip inline-flex items-center gap-2 ${isActive ? "is-selected" : ""}`}
                          >
                            <TechLogo name={TECH_DISPLAY_NAMES[dh.id] ?? dh.label} size={14} />
                            {dh.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* PM Tool */}
                  <div className="px-5 py-4" style={{ background: "var(--color-bg-elevated)" }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Project Management
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {PM_OPTIONS.map((pm) => {
                        const isActive = value.projectManagementTool === pm.id;
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => update({ projectManagementTool: isActive ? undefined : pm.id })}
                            className={`generate-chip inline-flex items-center gap-2 ${isActive ? "is-selected" : ""}`}
                          >
                            <TechLogo name={TECH_DISPLAY_NAMES[pm.id] ?? pm.label} size={14} />
                            {pm.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mobile summary */}
          <div className="mt-8 lg:hidden">
            <StackSummaryCard value={value} onNext={onNext} canProceed={true} />
          </div>

          {/* Mobile navigation */}
          <div className="flex gap-3 mt-6 lg:hidden">
            <button type="button"
              onClick={onBack}
              className="px-6 py-4 rounded-2xl text-base font-semibold transition-all"
              style={{
                background: "var(--color-bg-elevated)",
                color: "rgba(255,255,255,0.5)",
                border: "0.5px solid rgba(255,255,255,0.08)",
              }}
            >
              ← Kembali
            </button>
            <button
              type="button"
              onClick={onNext}
              className="flex-1 py-4 rounded-xl font-mono font-bold text-[14px] transition-all"
              style={{
                background: "var(--app-amber)",
                color: "#0D1321",
                boxShadow: "0 4px 20px rgba(255,176,32,0.2)",
              }}
            >
              Lanjut →
            </button>
          </div>
        </div>

        {/* ── RIGHT: Sticky Summary ── */}
        <div className="hidden lg:block w-[380px] flex-shrink-0">
          <div className="sticky top-24 space-y-4">
            <StackSummaryCard value={value} onNext={onNext} canProceed={true} />

            {/* Back button */}
            <button type="button"
              onClick={onBack}
              className="w-full py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "var(--color-bg-elevated)",
                color: "rgba(255,255,255,0.4)",
                border: "0.5px solid rgba(255,255,255,0.07)",
              }}
            >
              ← Kembali ke Cerita Produk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

