"use client";

import { useState } from "react";
import { Settings, Zap, Layers, ShieldCheck, Boxes, type LucideIcon } from "lucide-react";
import type {
  FileKey,
  ProjectStage,
  UserPlanStatus,
  ModelClass,
  PerDocumentModelClass,
} from "./types";
import {
  ALL_FILE_KEYS,
  FILE_META,
  STAGE_PRESETS,
  MODEL_CLASSES,
  TIER_MODEL_CLASSES,
  DOC_DEFAULT_MODEL_CLASS,
  TIER_CREDIT_POOL,
  TIER_LABELS,
  PLAN_STATUS_LABELS,
  MODEL_CLASS_PIPELINE,
  calcDocCredits,
  calcTotalCredits,
  resolvePreviewTier,
  isSubscribed,
  canAccessDocument,
  documentsForTier,
  sanitizeSelectedDocs,
} from "./types";
import { DOCUMENT_DEFINITIONS, getMaxDocumentsForTier } from "@/lib/config/documents";
import { DocIcon, ModelClassIcon } from "@/lib/ui/app-icons";

interface Props {
  value: FileKey[];
  stage: ProjectStage | null;
  plan: UserPlanStatus;
  perDocModelClass: PerDocumentModelClass;
  onDocsChange: (v: FileKey[]) => void;
  onModelClassChange: (doc: FileKey, mc: ModelClass) => void;
  onNext: () => void;
  onBack: () => void;
}

const SMART_PRESETS: {
  id: string;
  label: string;
  Icon: LucideIcon;
  docs: FileKey[];
  desc: string;
}[] = [
  {
    id: "base",
    label: "Quick Start",
    Icon: Zap,
    docs: ["prd", "architecture", "plan-task"],
    desc: "Ide baru, mau mulai cepat",
  },
  {
    id: "foundation",
    label: "Full Foundation",
    Icon: Layers,
    docs: ["prd", "architecture", "plan-task", "design-system", "agent-rules"],
    desc: "Sebelum mulai coding serius",
  },
  {
    id: "production",
    label: "Production Ready",
    Icon: ShieldCheck,
    docs: [
      "prd",
      "architecture",
      "plan-task",
      "design-system",
      "agent-rules",
      "security-launch",
    ],
    desc: "Mau launch ke publik",
  },
  {
    id: "complete",
    label: "Complete Suite",
    Icon: Boxes,
    docs: [...ALL_FILE_KEYS],
    desc: "Dokumentasi paling lengkap",
  },
];

export default function DocumentPickerStep({
  value,
  stage,
  plan,
  perDocModelClass,
  onDocsChange,
  onModelClassChange,
  onNext,
  onBack,
}: Props) {
  const [advancedMode, setAdvancedMode] = useState(false);
  const tier = resolvePreviewTier(plan);
  const maxDocs = getMaxDocumentsForTier(tier);
  const atDocLimit = value.length >= maxDocs;

  const setDocs = (docs: FileKey[]) => onDocsChange(sanitizeSelectedDocs(docs, tier));

  const toggle = (key: FileKey) => {
    if (!canAccessDocument(key, tier)) return;
    if (value.includes(key)) {
      if (key === "prd") return;
      setDocs(value.filter((k) => k !== key));
    } else {
      if (atDocLimit) return;
      setDocs([...value, key]);
    }
  };

  const stagePreset = stage ? STAGE_PRESETS[stage] : null;
  const activePreset = SMART_PRESETS.find(
    (p) => JSON.stringify([...p.docs].sort()) === JSON.stringify([...value].sort())
  );

  const availableClasses = TIER_MODEL_CLASSES[tier];
  const singleClassTier = availableClasses.length === 1;
  const totalCredits = calcTotalCredits(value, tier, perDocModelClass);
  const creditPool = TIER_CREDIT_POOL[tier];

  const setDocClass = (doc: FileKey, mc: ModelClass) => {
    if (!availableClasses.includes(mc)) return;
    onModelClassChange(doc, mc);
  };

  const coreDocs = ALL_FILE_KEYS.filter((k) => DOCUMENT_DEFINITIONS[k].kind === "core");
  const optionalDocs = ALL_FILE_KEYS.filter((k) => DOCUMENT_DEFINITIONS[k].kind === "optional");
  const accessibleDocs = documentsForTier(tier);

  return (
    <div className="generate-app w-full max-w-[1100px] mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1
            className="font-unbounded font-extrabold text-[clamp(24px,3vw,28px)] mb-3"
            style={{ color: "var(--app-text-primary)", letterSpacing: "-0.02em" }}
          >
            Pilih dokumen & kelas model AI
          </h1>
          <p className="font-mono text-[14px]" style={{ color: "var(--app-text-secondary)", lineHeight: 1.7 }}>
            Pilih dokumen yang ingin digenerate.
            {advancedMode
              ? " Atur kelas model per dokumen di panel kanan."
              : " Kelas model otomatis sesuai paket — aktifkan mode lanjutan untuk kontrol detail."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdvancedMode((v) => !v)}
          className="inline-flex items-center gap-2 font-mono text-[12px] font-semibold px-3 py-2 rounded-lg shrink-0 transition-colors"
          style={{
            color: advancedMode ? "var(--app-amber)" : "var(--app-text-secondary)",
            background: advancedMode ? "rgba(255,176,32,0.1)" : "var(--app-bg-elevated)",
            border: advancedMode ? "1px solid rgba(255,176,32,0.35)" : "0.5px solid var(--app-border-default)",
          }}
        >
          <Settings size={14} strokeWidth={1.75} />
          {advancedMode ? "Mode lanjutan aktif" : "Atur model per dokumen"}
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* LEFT — Document picker */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: "0.5px solid var(--app-border-default)",
            background: "var(--app-bg-elevated)",
          }}
        >
          {/* Smart presets */}
          <div
            className="px-4 py-3"
            style={{ borderBottom: "0.5px solid var(--app-border-default)" }}
          >
            <p
              className="font-mono text-xs font-bold tracking-widest uppercase mb-3"
              style={{ color: "var(--app-text-tertiary)" }}
            >
              Smart Preset
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SMART_PRESETS.map((preset) => {
                const isActive = activePreset?.id === preset.id;
                const isRecommended =
                  stagePreset &&
                  JSON.stringify([...preset.docs].sort()) ===
                    JSON.stringify([...stagePreset].sort());
                const PresetIcon = preset.Icon;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDocs([...preset.docs])}
                    className={`generate-chip inline-flex items-center gap-2 ${isActive ? "is-selected" : ""}`}
                    title={preset.desc}
                  >
                    <PresetIcon size={14} strokeWidth={1.75} />
                    <span className="font-semibold">{preset.label}</span>
                    {isRecommended && (
                      <span
                        className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded"
                        style={{
                          background: "rgba(56,189,248,0.12)",
                          color: "var(--app-sky)",
                        }}
                      >
                        Rekomendasi
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Document list — core */}
          <div className="p-2">
            <p
              className="font-mono text-xs font-bold tracking-widest uppercase px-3 py-2"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Dokumen Inti
            </p>
            {coreDocs.map((key) => renderDocRow(key))}

            {/* Extended docs */}
            <p
              className="font-mono text-xs font-bold tracking-widest uppercase px-3 py-2 mt-2"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Dokumen Lanjutan
            </p>
            {optionalDocs.map((key) => renderDocRow(key))}

            <div
              className="flex items-center justify-between px-3 py-2 mt-2 rounded-lg"
              style={{
                borderTop: "0.5px solid var(--color-border-default)",
                marginTop: 8,
              }}
            >
              <div>
                <span
                  className="font-mono font-semibold text-sm"
                  style={{ color: "var(--app-text-secondary)" }}
                >
                  {value.length} / {maxDocs} dokumen dipilih
                </span>
                {atDocLimit && (
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,199,0,0.75)" }}>
                    Batas maksimum paket {TIER_LABELS[tier]} — hapus satu untuk menambah lainnya
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setDocs([...accessibleDocs])}
                  className="font-mono text-xs px-2.5 py-1.5 rounded transition-all"
                  style={{
                    color: "var(--color-text-tertiary)",
                    border: "0.5px solid var(--color-border-default)",
                  }}
                >
                  Semua
                </button>
                <button type="button"
                  onClick={() => setDocs(["prd"])}
                  className="font-mono text-xs px-2.5 py-1.5 rounded transition-all"
                  style={{
                    color: "var(--color-text-tertiary)",
                    border: "0.5px solid var(--color-border-default)",
                  }}
                >
                  PRD saja
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Per-document model class + credit estimate */}
        <div className="flex flex-col gap-4">
          {advancedMode && (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              border: "0.5px solid var(--app-border-default)",
              background: "var(--app-bg-elevated)",
            }}
          >
            <div
              className="px-4 py-3"
              style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
            >
              <p
                className="font-mono text-xs font-bold tracking-widest uppercase mb-2"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Model AI per Dokumen
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                Atur <strong>kelas model</strong> untuk tiap dokumen. Kelas menentukan model AI
                yang dipakai dan biaya kredit.
              </p>
            </div>

            <div className="p-3">
              {/* Tier + availability banner */}
              <div
                className="rounded-lg px-3 py-2.5 mb-4"
                style={{
                  background: "rgba(255,176,32,0.05)",
                  border: "0.5px solid rgba(255,176,32,0.15)",
                }}
              >
                <p className="text-xs font-semibold" style={{ color: "var(--app-amber)" }}>
                  Paket {isSubscribed(plan) ? TIER_LABELS[tier] : "Preview Base"}
                </p>
                <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {singleClassTier
                    ? "Hanya kelas Hemat — Gemini Flash & DeepSeek. Upgrade ke Core untuk Menengah/Flagship."
                    : `Kelas tersedia: ${availableClasses
                        .map((id) => MODEL_CLASSES.find((c) => c.id === id)?.label ?? id)
                        .join(" · ")}`}
                </p>
              </div>

              {/* Class reference cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {MODEL_CLASSES.map((mc) => {
                  const isAvailable = availableClasses.includes(mc.id);
                  return (
                    <div
                      key={mc.id}
                      className="rounded-lg px-3 py-2.5"
                      style={{
                        background: isAvailable
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(255,255,255,0.01)",
                        border: isAvailable
                          ? "0.5px solid rgba(255,255,255,0.1)"
                          : "0.5px solid rgba(255,255,255,0.05)",
                        opacity: isAvailable ? 1 : 0.55,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-xs font-semibold inline-flex items-center gap-1.5"
                          style={{ color: isAvailable ? "var(--color-text-primary)" : "rgba(255,255,255,0.35)" }}
                        >
                          <ModelClassIcon modelClass={mc.id} size={12} />
                          {mc.label}
                          {!isAvailable && (
                            <span className="ml-1.5 text-[10px]" style={{ color: "#F59E0B" }}>
                              🔒
                            </span>
                          )}
                        </span>
                        <span
                          className="text-[10px] font-bold"
                          style={{
                            color: "rgba(255,255,255,0.35)",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                          }}
                        >
                          {mc.creditsPer1kTokens}× kredit
                        </span>
                      </div>
                      <p
                        className="text-[10px] mt-1 leading-snug"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
                        {MODEL_CLASS_PIPELINE[mc.id]}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Per-doc rows */}
              {value.length === 0 ? (
                <p
                  className="text-sm text-center py-6"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  Pilih dokumen di kiri untuk mengatur model
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {value.map((doc) => {
                    const meta = FILE_META[doc];
                    const currentClass =
                      perDocModelClass[doc] ?? DOC_DEFAULT_MODEL_CLASS[doc][tier];
                    const classInfo = MODEL_CLASSES.find((c) => c.id === currentClass);
                    const credits = calcDocCredits(doc, tier, currentClass);
                    const defaultClass = DOC_DEFAULT_MODEL_CLASS[doc][tier];

                    return (
                      <div
                        key={doc}
                        className="rounded-lg px-3 py-3"
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "0.5px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <span
                              className="text-sm font-medium inline-flex items-center gap-1.5"
                              style={{ color: "var(--color-text-primary)" }}
                            >
                              <DocIcon doc={doc} size={14} />
                              {meta.label}
                            </span>
                            {defaultClass === currentClass && (
                              <span
                                className="ml-2 text-[10px] font-bold uppercase tracking-wide"
                                style={{ color: "rgba(255,176,32,0.6)" }}
                              >
                                default
                              </span>
                            )}
                          </div>
                          <span
                            className="text-[11px] font-bold flex-shrink-0"
                            style={{
                              color: "rgba(255,255,255,0.4)",
                              fontFamily: "var(--font-jetbrains-mono), monospace",
                            }}
                          >
                            {credits} kr
                          </span>
                        </div>

                        {singleClassTier ? (
                          <div
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                            style={{
                              background: "rgba(34,197,94,0.12)",
                              border: "0.5px solid rgba(34,197,94,0.3)",
                              color: "#22C55E",
                            }}
                          >
                            <span className="font-bold">⚡ Hemat</span>
                            <span style={{ color: "rgba(255,255,255,0.45)" }}>
                              {MODEL_CLASS_PIPELINE.hemat}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {MODEL_CLASSES.map((mc) => {
                              const isSelected = currentClass === mc.id;
                              const isAvailable = availableClasses.includes(mc.id);
                              const isDefault = defaultClass === mc.id;

                              return (
                                <button
                                  type="button"
                                  key={mc.id}
                                  onClick={() => setDocClass(doc, mc.id)}
                                  disabled={!isAvailable}
                                  className="flex flex-col items-start px-2.5 py-2 rounded-lg transition-all min-w-[88px]"
                                  style={{
                                    background: isSelected
                                      ? mc.id === "hemat"
                                        ? "rgba(34,197,94,0.15)"
                                        : mc.id === "menengah"
                                        ? "rgba(59,130,246,0.15)"
                                        : mc.id === "flagship"
                                        ? "rgba(168,85,247,0.15)"
                                        : "rgba(255,199,0,0.15)"
                                      : "rgba(255,255,255,0.02)",
                                    border: isSelected
                                      ? `1px solid ${
                                          mc.id === "hemat"
                                            ? "rgba(34,197,94,0.4)"
                                            : mc.id === "menengah"
                                            ? "rgba(59,130,246,0.4)"
                                            : mc.id === "flagship"
                                            ? "rgba(168,85,247,0.4)"
                                            : "rgba(255,199,0,0.4)"
                                        }`
                                      : "0.5px solid rgba(255,255,255,0.08)",
                                    color: isSelected
                                      ? mc.id === "hemat"
                                        ? "#22C55E"
                                        : mc.id === "menengah"
                                        ? "#60A5FA"
                                        : mc.id === "flagship"
                                        ? "#A855F7"
                                        : "#FFC700"
                                      : isAvailable
                                      ? "rgba(255,255,255,0.55)"
                                      : "rgba(255,255,255,0.2)",
                                    cursor: isAvailable ? "pointer" : "not-allowed",
                                    opacity: isAvailable ? 1 : 0.45,
                                  }}
                                  title={
                                    isAvailable
                                      ? MODEL_CLASS_PIPELINE[mc.id]
                                      : `Upgrade untuk akses ${mc.label}`
                                  }
                                >
                                  <span className="text-[11px] font-bold inline-flex items-center gap-1">
                                    <ModelClassIcon modelClass={mc.id} size={11} />
                                    {mc.label}
                                    {!isAvailable && <span className="ml-1">🔒</span>}
                                    {isDefault && isAvailable && !isSelected && (
                                      <span className="ml-1 text-[9px] opacity-60">· rec</span>
                                    )}
                                  </span>
                                  <span
                                    className="text-[9px] mt-0.5 text-left leading-tight"
                                    style={{ color: "rgba(255,255,255,0.35)" }}
                                  >
                                    {mc.exampleModels}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <p
                          className="text-[10px] mt-2"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          Model: {MODEL_CLASS_PIPELINE[currentClass]}
                          {classInfo ? ` · ${classInfo.desc}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Credit estimate card */}
          <div
            className="rounded-xl p-4"
            style={{
              border: "0.5px solid var(--color-border-default)",
              background: "var(--color-bg-elevated)",
            }}
          >
            <p
              className="font-mono text-xs font-bold tracking-widest uppercase mb-4"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Estimasi Kredit
            </p>
            <div className="flex flex-col gap-2">
              {/* Per-doc breakdown */}
              {value.map((doc) => {
                const meta = FILE_META[doc];
                const mc = perDocModelClass[doc] ?? DOC_DEFAULT_MODEL_CLASS[doc][tier];
                const classInfo = MODEL_CLASSES.find((c) => c.id === mc);
                const credits = calcDocCredits(doc, tier, mc);
                return (
                  <div key={doc} className="flex items-center justify-between">
                    <span
                      className="text-xs inline-flex items-center gap-1.5"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      <DocIcon doc={doc} size={12} />
                      {meta.label}
                      <span
                        className="ml-1.5 text-[10px]"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        {classInfo?.label}
                      </span>
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                      }}
                    >
                      {credits}
                    </span>
                  </div>
                );
              })}

              {/* Total */}
              <div
                className="flex items-center justify-between pt-3 mt-1"
                style={{ borderTop: "0.5px solid var(--color-border-default)" }}
              >
                <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Total kredit
                </span>
                <span
                  className="font-unbounded text-[32px] font-extrabold"
                  style={{
                    color: "var(--app-amber)",
                    fontFamily: "var(--font-unbounded), sans-serif",
                    lineHeight: 1,
                  }}
                >
                  {totalCredits}
                </span>
              </div>

              {/* Pool info */}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Pool {isSubscribed(plan) ? TIER_LABELS[plan] : PLAN_STATUS_LABELS.none}/bulan
                </span>
                <span
                  className="text-xs"
                  style={{
                    color: "rgba(255,255,255,0.3)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                  }}
                >
                  {creditPool.toLocaleString()} kredit
                </span>
              </div>

              {/* Usage bar */}
              <div className="mt-1">
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min((totalCredits / creditPool) * 100, 100)}%`,
                      background:
                        totalCredits / creditPool > 0.8
                          ? "#EF4444"
                          : totalCredits / creditPool > 0.5
                          ? "#F59E0B"
                          : "var(--app-amber)",
                    }}
                  />
                </div>
                <p
                  className="text-[10px] mt-1 text-right"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {((totalCredits / creditPool) * 100).toFixed(1)}% dari pool bulanan
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-4 mt-4">
        <button type="button"
          onClick={onBack}
          className="px-6 py-4 rounded-xl font-inter font-semibold text-base transition-all"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-secondary)",
            border: "0.5px solid var(--color-border-default)",
          }}
        >
          ← Kembali
        </button>
        <button type="button"
          onClick={onNext}
          disabled={value.length === 0}
          className="flex-1 py-4 rounded-xl font-inter font-bold text-base transition-all"
          style={{
            background: value.length > 0 ? "var(--app-amber)" : "var(--color-bg-elevated)",
            color: value.length > 0 ? "#0A0A0A" : "var(--color-text-disabled)",
            border: value.length > 0 ? "none" : "0.5px solid var(--color-border-default)",
            cursor: value.length > 0 ? "pointer" : "not-allowed",
          }}
        >
          {value.length === 0
            ? "Pilih dokumen yang mau digenerate"
            : `Review & Generate (${value.length} dok · ${totalCredits} kredit) →`}
        </button>
      </div>
    </div>
  );

  // ── Render helper ──

  function renderDocRow(key: FileKey) {
    const meta = FILE_META[key];
    const locked = !canAccessDocument(key, tier);
    const isSelected = !locked && value.includes(key);
    const isRequired = key === "prd";
    const blockedByLimit = !isSelected && atDocLimit && !locked;
    const minTier = DOCUMENT_DEFINITIONS[key].minTier;

    return (
      <button type="button"
        key={key}
        onClick={() => toggle(key)}
        disabled={locked || blockedByLimit}
        className="flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all w-full mb-0.5"
        style={{
          background: isSelected ? "rgba(255,176,32,0.05)" : "transparent",
          border: isSelected
            ? "0.5px solid rgba(255,176,32,0.2)"
            : "0.5px solid transparent",
          opacity: locked ? 0.55 : blockedByLimit ? 0.4 : 1,
          cursor: locked || blockedByLimit ? "not-allowed" : "pointer",
        }}
      >
        <div
          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
          style={{
            background: isSelected ? "var(--app-amber)" : "transparent",
            border: isSelected ? "none" : "0.5px solid var(--color-border-strong)",
          }}
        >
          {isSelected && (
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6l3 3 5-5"
                stroke="#0A0A0A"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="font-inter font-semibold text-sm flex items-center gap-1.5"
              style={{
                color: isSelected
                  ? "var(--app-text-primary)"
                  : "var(--app-text-secondary)",
              }}
            >
              <DocIcon doc={key} size={14} />
              {meta.label}
            </span>
            {!advancedMode && isSelected && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide inline-flex items-center gap-1"
                style={{
                  background: "rgba(255,176,32,0.1)",
                  color: "var(--app-amber)",
                  border: "1px solid rgba(255,176,32,0.25)",
                }}
              >
                <ModelClassIcon
                  modelClass={perDocModelClass[key] ?? DOC_DEFAULT_MODEL_CLASS[key][tier]}
                  size={10}
                />
                {MODEL_CLASSES.find(
                  (c) => c.id === (perDocModelClass[key] ?? DOC_DEFAULT_MODEL_CLASS[key][tier])
                )?.label}
              </span>
            )}
            {isRequired && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                style={{
                  background: "rgba(255,176,32,0.1)",
                  color: "var(--app-amber)",
                }}
              >
                wajib
              </span>
            )}
            {locked && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                style={{
                  background: "rgba(255,199,0,0.1)",
                  color: "#F59E0B",
                }}
              >
                🔒 {TIER_LABELS[minTier]}
              </span>
            )}
          </div>
          <p
            className="font-inter text-xs mt-1"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {locked ? `Upgrade ke ${TIER_LABELS[minTier]} untuk akses` : meta.description}
          </p>
        </div>
      </button>
    );
  }
}
