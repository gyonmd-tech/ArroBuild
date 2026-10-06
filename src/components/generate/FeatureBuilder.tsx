"use client";

import { useState, useRef } from "react";
import { Lightbulb } from "lucide-react";
import type { Feature, FeaturePriority, ProductType } from "./types";
import { nextFeatureId } from "./types";

interface Props {
  features: Feature[];
  onChange: (features: Feature[]) => void;
  productType: ProductType;
}

// ─── Quick-add chips per product type ────────────────────────────────────────

const FEATURE_CHIPS: Partial<Record<ProductType, string[]>> = {
  saas: [
    "Dashboard analytics",
    "User authentication",
    "Payment / billing",
    "Team collaboration",
    "API / integrations",
    "Export / download",
  ],
  marketplace: [
    "Listing produk / jasa",
    "Pencarian & filter",
    "Sistem rating & review",
    "Payment escrow",
    "Chat buyer-seller",
    "Notifikasi real-time",
  ],
  mobile: [
    "Push notification",
    "Offline mode",
    "Kamera / scanner",
    "GPS / lokasi",
    "Biometrik login",
    "Social sharing",
  ],
  api: [
    "Authentication (API key / OAuth)",
    "Rate limiting",
    "Webhook support",
    "SDK / client library",
    "API documentation",
    "Monitoring & logging",
  ],
  "ai-app": [
    "AI chat / prompt interface",
    "Riwayat percakapan",
    "Model selector",
    "File upload → AI processing",
    "Output export (PDF / MD)",
    "Usage tracking / kredit",
  ],
  ecommerce: [
    "Katalog produk",
    "Keranjang belanja",
    "Payment gateway",
    "Tracking pengiriman",
    "Wishlist / favorit",
    "Review produk",
  ],
  portfolio: [
    "Project showcase",
    "Blog / tulisan",
    "Skill matrix visual",
    "Contact form",
    "Testimonial",
    "Resume / CV download",
  ],
  internal: [
    "Dashboard & reporting",
    "Form input / data entry",
    "Approval workflow",
    "Role-based access",
    "Notifikasi & reminder",
    "Export data (CSV/PDF)",
  ],
  other: [
    "User authentication",
    "Search / filter",
    "CRUD content",
    "Notifications",
    "Analytics",
    "Export",
  ],
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function FeatureBuilder({ features, onChange, productType }: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const moveFeature = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= features.length) return;
    const copy = [...features];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item);
    onChange(copy);
  };

  const chips = FEATURE_CHIPS[productType] ?? FEATURE_CHIPS.other ?? [];
  const usedTitles = new Set(features.map((f) => f.title.toLowerCase()));

  // ── Handlers ──

  const addFeature = (title: string) => {
    if (!title.trim()) return;
    const f: Feature = {
      id: nextFeatureId(features),
      title: title.trim(),
      priority: "must-have",
    };
    onChange([...features, f]);
    setNewTitle("");
    // Focus back to input
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const removeFeature = (id: string) => {
    const updated = features
      .filter((f) => f.id !== id)
      .map((f, i) => ({
        ...f,
        id: `FEAT-${String(i + 1).padStart(3, "0")}`,
      }));
    onChange(updated);
  };

  const togglePriority = (id: string) => {
    onChange(
      features.map((f) =>
        f.id === id
          ? { ...f, priority: (f.priority === "must-have" ? "nice-to-have" : "must-have") as FeaturePriority }
          : f
      )
    );
  };

  const updateTitle = (id: string, title: string) => {
    onChange(features.map((f) => (f.id === id ? { ...f, title } : f)));
  };

  // ── Drag & drop for reordering ──

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const reordered = [...features];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    // Reassign IDs after reorder
    const renumbered = reordered.map((f, i) => ({
      ...f,
      id: `FEAT-${String(i + 1).padStart(3, "0")}`,
    }));
    onChange(renumbered);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFeature(newTitle);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{
            background: features.length > 0 ? "rgba(255,176,32,0.12)" : "rgba(255,255,255,0.06)",
            color: features.length > 0 ? "var(--app-amber)" : "var(--app-text-tertiary)",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: "10px",
          }}
        >
          {features.length > 0 ? "✓" : "③"}
        </span>
        <label
          className="font-mono text-[14px] font-bold"
          style={{ color: "var(--app-text-primary)", lineHeight: 1.4 }}
        >
          Fitur inti yang HARUS ada di versi pertama
          <span className="ml-2 text-xs font-normal font-mono" style={{ color: "var(--app-text-tertiary)" }}>
            ({features.length} fitur)
          </span>
        </label>
      </div>

      {/* Quick-add chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {chips.map((chip) => {
          const used = usedTitles.has(chip.toLowerCase());
          return (
            <button
              key={chip}
              type="button"
              onClick={() => !used && addFeature(chip)}
              disabled={used}
              className={`generate-chip ${used ? "is-selected" : ""}`}
              style={{ opacity: used ? 0.65 : 1, cursor: used ? "default" : "pointer" }}
            >
              {used && <span className="mr-1">✓</span>}
              {chip}
            </button>
          );
        })}
      </div>

      {/* Feature list */}
      {features.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden mb-3"
          style={{
            border: "0.5px solid var(--app-border-default)",
            background: "var(--app-bg-elevated)",
          }}
        >
          {features.map((f, idx) => (
            <div
              key={f.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              onDrop={() => handleDrop(idx)}
              className="flex items-center gap-3 px-4 py-3 transition-all group"
              style={{
                borderBottom: idx < features.length - 1 ? "0.5px solid rgba(255,255,255,0.06)" : "none",
                background: dragOverIdx === idx ? "rgba(255,176,32,0.04)" : "transparent",
                cursor: "grab",
              }}
            >
              {/* Reorder: keyboard-friendly */}
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  aria-label={`Pindah ${f.id} ke atas`}
                  disabled={idx === 0}
                  onClick={() => moveFeature(idx, -1)}
                  className="text-[10px] leading-none px-1 py-0.5 rounded"
                  style={{
                    opacity: idx === 0 ? 0.25 : 0.7,
                    color: "rgba(255,255,255,0.6)",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Pindah ${f.id} ke bawah`}
                  disabled={idx === features.length - 1}
                  onClick={() => moveFeature(idx, 1)}
                  className="text-[10px] leading-none px-1 py-0.5 rounded"
                  style={{
                    opacity: idx === features.length - 1 ? 0.25 : 0.7,
                    color: "rgba(255,255,255,0.6)",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                  }}
                >
                  ↓
                </button>
              </div>

              {/* Drag handle */}
              <span
                className="flex-shrink-0 text-xs select-none opacity-30 group-hover:opacity-60 transition-opacity"
                style={{ cursor: "grab", color: "rgba(255,255,255,0.4)" }}
                title="Drag untuk reorder"
              >
                ⋮⋮
              </span>

              {/* FEAT-ID badge */}
              <span
                className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded"
                style={{
                  background: "rgba(255,176,32,0.08)",
                  color: "var(--app-amber)",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  letterSpacing: "0.05em",
                }}
              >
                {f.id}
              </span>

              {/* Title (editable on click) */}
              {editingId === f.id ? (
                <input
                  autoFocus
                  type="text"
                  value={f.title}
                  onChange={(e) => updateTitle(f.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditingId(null);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 text-sm bg-transparent border-none focus:outline-none"
                  style={{
                    color: "var(--color-text-primary)",
                    borderBottom: "1px solid rgba(255,176,32,0.3)",
                    fontFamily: "var(--font-inter), system-ui, sans-serif",
                    padding: "2px 0",
                  }}
                />
              ) : (
                <span
                  className="flex-1 text-sm cursor-text"
                  style={{ color: "var(--color-text-primary)" }}
                  onClick={() => setEditingId(f.id)}
                  title="Klik untuk edit"
                >
                  {f.title}
                </span>
              )}

              {/* Priority toggle */}
              <button type="button"
                onClick={() => togglePriority(f.id)}
                className="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all"
                style={{
                  background: f.priority === "must-have" ? "rgba(255,176,32,0.1)" : "rgba(255,255,255,0.05)",
                  color: f.priority === "must-have" ? "var(--app-amber)" : "rgba(255,255,255,0.35)",
                  border: f.priority === "must-have" ? "0.5px solid rgba(255,176,32,0.2)" : "0.5px solid rgba(255,255,255,0.08)",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                }}
                title={f.priority === "must-have" ? "Klik untuk ubah ke Nice-to-have" : "Klik untuk ubah ke Wajib"}
              >
                {f.priority === "must-have" ? "Wajib" : "Nice-to-have"}
              </button>

              {/* Delete */}
              <button type="button"
                onClick={() => removeFeature(f.id)}
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs
                           opacity-0 group-hover:opacity-100 transition-all"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  color: "rgba(239,68,68,0.7)",
                }}
                title="Hapus fitur"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new feature input */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ketik fitur baru, tekan Enter untuk tambah..."
          className="flex-1 rounded-xl text-sm transition-all focus:outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: newTitle ? "1px solid rgba(255,176,32,0.3)" : "0.5px solid rgba(255,255,255,0.1)",
            color: "var(--color-text-primary)",
            padding: "12px 16px",
            fontFamily: "var(--font-inter), system-ui, sans-serif",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,176,32,0.5)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,176,32,0.06)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = newTitle ? "rgba(255,176,32,0.3)" : "rgba(255,255,255,0.1)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <button type="button"
          onClick={() => addFeature(newTitle)}
          disabled={!newTitle.trim()}
          className="px-5 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: newTitle.trim() ? "var(--app-amber)" : "var(--app-bg-hover)",
            color: newTitle.trim() ? "#0D1321" : "var(--app-text-tertiary)",
            cursor: newTitle.trim() ? "pointer" : "not-allowed",
            border: newTitle.trim() ? "none" : "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          + Tambah
        </button>
      </div>

      {/* Helper text */}
      {features.length === 0 && (
        <p className="mt-3 font-mono text-[12px] flex items-start gap-2" style={{ color: "var(--app-text-tertiary)" }}>
          <Lightbulb size={14} className="shrink-0 mt-0.5" style={{ color: "var(--app-amber)" }} />
          Klik chip di atas atau ketik sendiri. Setiap fitur otomatis mendapat ID (FEAT-001, dst) yang dipakai AI untuk referensi silang antar dokumen.
        </p>
      )}

      {features.length > 0 && features.length < 3 && (
        <p className="mt-2 text-xs" style={{ color: "rgba(255,199,0,0.5)" }}>
          💡 Tambah 1-2 fitur lagi untuk hasil AI yang lebih detail
        </p>
      )}
    </div>
  );
}

