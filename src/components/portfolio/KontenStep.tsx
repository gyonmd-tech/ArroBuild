"use client";

import { useState, useRef } from "react";
import type { KontenData, Proyek, Layanan, ProyekTipe } from "./types";
import { SKILL_TEMPLATES } from "./types";

interface Props {
  profesi: string;
  value: KontenData;
  onChange: (v: KontenData) => void;
  onNext: () => void;
  onBack: () => void;
}

const PROYEK_TIPES: ProyekTipe[] = ["Web App", "Mobile", "Design", "Writing", "Other"];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    background: "var(--color-bg-elevated)",
    border: focused ? "0.5px solid rgba(255,176,32,0.5)" : "0.5px solid var(--color-border-default)",
    boxShadow: focused ? "0 0 0 3px rgba(255,176,32,0.06)" : "none",
    color: "var(--color-text-primary)",
    padding: "10px 12px",
    borderRadius: 10,
    width: "100%",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    outline: "none",
    transition: "all 0.15s",
  };
}

// ── Skill chip input ───────────────────────────────────────────────────────────

function SkillInput({
  skills,
  profesi,
  onChange,
}: {
  skills: string[];
  profesi: string;
  onChange: (s: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState("");
  const [focused, setFocused] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const templates = SKILL_TEMPLATES[profesi] ?? [];

  const add = (skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed || skills.includes(trimmed)) return;
    onChange([...skills, trimmed]);
  };

  const remove = (skill: string) => onChange(skills.filter((s) => s !== skill));

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const parts = inputVal.split(",").map((s) => s.trim()).filter(Boolean);
      parts.forEach(add);
      setInputVal("");
    } else if (e.key === "Backspace" && !inputVal && skills.length > 0) {
      remove(skills[skills.length - 1]);
    }
  };

  return (
    <div>
      {/* Chip container */}
      <div
        className="flex flex-wrap gap-1.5 min-h-[44px] items-center px-3 py-2 rounded-xl cursor-text"
        style={{
          background: "var(--color-bg-elevated)",
          border: focused ? "0.5px solid rgba(255,176,32,0.5)" : "0.5px solid var(--color-border-default)",
          boxShadow: focused ? "0 0 0 3px rgba(255,176,32,0.06)" : "none",
          transition: "all 0.15s",
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {skills.map((skill) => (
          <span
            key={skill}
            className="flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded-lg"
            style={{
              background: "rgba(255,176,32,0.1)",
              color: "var(--app-amber)",
              border: "0.5px solid rgba(255,176,32,0.3)",
            }}
          >
            {skill}
            <button type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(skill);
              }}
              className="ml-0.5 opacity-60 hover:opacity-100"
              style={{ color: "var(--app-amber)", lineHeight: 1 }}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (inputVal.trim()) { add(inputVal); setInputVal(""); } }}
          placeholder={skills.length === 0 ? "Ketik skill lalu tekan Enter atau koma..." : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none font-mono text-xs"
          style={{ color: "var(--color-text-primary)" }}
        />
      </div>
      <p className="font-mono text-[10px] mt-1" style={{ color: "var(--color-text-tertiary)" }}>
        Tekan <kbd className="px-1 py-0.5 rounded" style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>Enter</kbd> atau <kbd className="px-1 py-0.5 rounded" style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>,</kbd> untuk tambah skill
      </p>

      {/* Template shortcuts */}
      {templates.length > 0 && (
        <div className="mt-2">
          <button type="button"
            onClick={() => setShowTemplate((v) => !v)}
            className="font-mono text-[11px] flex items-center gap-1.5 transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <span style={{ transform: showTemplate ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.2s" }}>▶</span>
            Tambah dari template {profesi}
          </button>
          {showTemplate && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {templates.map((t) => (
                <button type="button"
                  key={t}
                  onClick={() => add(t)}
                  disabled={skills.includes(t)}
                  className="font-mono text-[11px] px-2.5 py-1 rounded-lg transition-all"
                  style={{
                    background: skills.includes(t) ? "rgba(255,176,32,0.05)" : "var(--color-bg-surface)",
                    border: skills.includes(t) ? "0.5px solid rgba(255,176,32,0.2)" : "0.5px solid var(--color-border-default)",
                    color: skills.includes(t) ? "rgba(255,176,32,0.4)" : "var(--color-text-secondary)",
                    cursor: skills.includes(t) ? "default" : "pointer",
                    opacity: skills.includes(t) ? 0.6 : 1,
                  }}
                >
                  {skills.includes(t) ? "✓ " : "+ "}{t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Proyek card ────────────────────────────────────────────────────────────────

function ProyekCard({
  proyek,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  proyek: Proyek;
  index: number;
  onChange: (p: Proyek) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [focused, setFocused] = useState("");
  const [expanded, setExpanded] = useState(index < 2);

  const set = (key: keyof Proyek, val: string) => onChange({ ...proyek, [key]: val });

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "0.5px solid var(--color-border-default)", background: "var(--color-bg-elevated)" }}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: expanded ? "0.5px solid var(--color-border-default)" : "none" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,176,32,0.1)", color: "var(--app-amber)" }}
          >
            {index + 1}
          </span>
          <span
            className="font-mono text-sm font-semibold"
            style={{ color: proyek.nama ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}
          >
            {proyek.nama || `Proyek ${index + 1}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="font-mono text-[11px] px-2 py-1 rounded transition-all"
              style={{ color: "#EF4444", border: "0.5px solid rgba(239,68,68,0.2)" }}
            >
              Hapus
            </button>
          )}
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* Nama proyek */}
          <div>
            <label className="font-mono text-xs font-semibold mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
              Nama proyek *
            </label>
            <input
              type="text"
              placeholder="Misal: Landing page kafe lokal"
              value={proyek.nama}
              onChange={(e) => set("nama", e.target.value)}
              style={inputStyle(focused === "nama")}
              onFocus={() => setFocused("nama")}
              onBlur={() => setFocused("")}
            />
          </div>

          {/* Deskripsi */}
          <div>
            <label className="font-mono text-xs font-semibold mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
              Deskripsi singkat *
            </label>
            <input
              type="text"
              placeholder="Apa yang dibuat, apa hasilnya atau impaknya"
              value={proyek.deskripsi}
              onChange={(e) => set("deskripsi", e.target.value)}
              style={inputStyle(focused === "deskripsi")}
              onFocus={() => setFocused("deskripsi")}
              onBlur={() => setFocused("")}
            />
          </div>

          {/* Tipe */}
          <div>
            <label className="font-mono text-xs font-semibold mb-1.5 block" style={{ color: "var(--color-text-secondary)" }}>
              Tipe proyek
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PROYEK_TIPES.map((t) => (
                <button type="button"
                  key={t}
                  onClick={() => onChange({ ...proyek, tipe: proyek.tipe === t ? undefined : t })}
                  className="font-mono text-[11px] px-2.5 py-1 rounded-lg transition-all"
                  style={{
                    background: proyek.tipe === t ? "rgba(255,176,32,0.1)" : "var(--color-bg-surface)",
                    border: proyek.tipe === t ? "0.5px solid rgba(255,176,32,0.4)" : "0.5px solid var(--color-border-default)",
                    color: proyek.tipe === t ? "var(--app-amber)" : "var(--color-text-secondary)",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Tech & Links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[11px] mb-1 block" style={{ color: "var(--color-text-tertiary)" }}>
                Tech yang dipakai
              </label>
              <input
                type="text"
                placeholder="React, Tailwind, Supabase"
                value={proyek.tech || ""}
                onChange={(e) => set("tech", e.target.value)}
                style={inputStyle(focused === `tech-${proyek.id}`)}
                onFocus={() => setFocused(`tech-${proyek.id}`)}
                onBlur={() => setFocused("")}
              />
            </div>
            <div>
              <label className="font-mono text-[11px] mb-1 block" style={{ color: "var(--color-text-tertiary)" }}>
                Link demo / URL
              </label>
              <input
                type="text"
                placeholder="https://..."
                value={proyek.linkDemo || ""}
                onChange={(e) => set("linkDemo", e.target.value)}
                style={inputStyle(focused === `demo-${proyek.id}`)}
                onFocus={() => setFocused(`demo-${proyek.id}`)}
                onBlur={() => setFocused("")}
              />
            </div>
            <div>
              <label className="font-mono text-[11px] mb-1 block" style={{ color: "var(--color-text-tertiary)" }}>
                Link GitHub
              </label>
              <input
                type="text"
                placeholder="github.com/user/repo"
                value={proyek.linkGithub || ""}
                onChange={(e) => set("linkGithub", e.target.value)}
                style={inputStyle(focused === `github-${proyek.id}`)}
                onFocus={() => setFocused(`github-${proyek.id}`)}
                onBlur={() => setFocused("")}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Step ─────────────────────────────────────────────────────────────────

export default function KontenStep({ profesi, value, onChange, onNext, onBack }: Props) {
  const [showLayanan, setShowLayanan] = useState(value.layanan.length > 0);
  const [focusedLayanan, setFocusedLayanan] = useState("");

  const updateSkills = (skills: string[]) => onChange({ ...value, skills });

  const updateProyek = (id: string, p: Proyek) =>
    onChange({ ...value, proyek: value.proyek.map((x) => (x.id === id ? p : x)) });

  const addProyek = () => {
    if (value.proyek.length >= 6) return;
    onChange({ ...value, proyek: [...value.proyek, { id: uid(), nama: "", deskripsi: "" }] });
  };

  const removeProyek = (id: string) =>
    onChange({ ...value, proyek: value.proyek.filter((p) => p.id !== id) });

  const addLayanan = () => {
    if (value.layanan.length >= 4) return;
    onChange({ ...value, layanan: [...value.layanan, { id: uid(), nama: "" }] });
  };

  const updateLayanan = (id: string, l: Layanan) =>
    onChange({ ...value, layanan: value.layanan.map((x) => (x.id === id ? l : x)) });

  const removeLayanan = (id: string) =>
    onChange({ ...value, layanan: value.layanan.filter((l) => l.id !== id) });

  const filledProyek = value.proyek.filter((p) => p.nama.trim() && p.deskripsi.trim());
  const canNext = filledProyek.length >= 1;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h2
          className="mb-2 font-unbounded text-xl font-bold sm:text-[22px]"
          style={{ color: "var(--color-text-primary)" }}
        >
          Skills & proyek
        </h2>
        <p
          className="font-mono text-[13.5px] leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Isi proyek dan skill yang ingin ditampilkan di portfolio.
        </p>
      </div>

      <div className="flex flex-col gap-8 mb-8">
        {/* Skills */}
        <div>
          <p className="font-mono font-semibold text-sm mb-2" style={{ color: "var(--color-text-primary)" }}>
            Skills & Tools
          </p>
          <SkillInput skills={value.skills} profesi={profesi} onChange={updateSkills} />
          {value.skills.length === 0 && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg mt-2"
              style={{ background: "rgba(245,158,11,0.06)", border: "0.5px solid rgba(245,158,11,0.2)" }}
            >
              <span style={{ color: "#F59E0B", fontSize: 12, flexShrink: 0 }}>⚠</span>
              <p className="font-mono text-[11px]" style={{ color: "rgba(245,158,11,0.8)" }}>
                Skills membantu AI menampilkan tech stack yang tepat
              </p>
            </div>
          )}
        </div>

        {/* Proyek */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
              Proyek <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400, fontSize: 11 }}>(min. 1, maks. 6)</span>
            </p>
            <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {value.proyek.length}/6
            </span>
          </div>

          {/* Note for beginners */}
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-3"
            style={{ background: "rgba(59,130,246,0.05)", border: "0.5px solid rgba(59,130,246,0.15)" }}
          >
            <span style={{ color: "#3B82F6", fontSize: 12, flexShrink: 0, marginTop: 1 }}>ⓘ</span>
            <p className="font-mono text-[11px]" style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              Belum punya proyek nyata? Tulis proyek fiktif yang realistis — misalnya{" "}
              <em style={{ color: "var(--color-text-primary)" }}>&quot;Landing page untuk kafe lokal&quot;</em> atau{" "}
              <em style={{ color: "var(--color-text-primary)" }}>&quot;App manajemen tugas sederhana&quot;</em>. Ini tetap valid untuk belajar.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {value.proyek.map((p, i) => (
              <ProyekCard
                key={p.id}
                proyek={p}
                index={i}
                onChange={(updated) => updateProyek(p.id, updated)}
                onRemove={() => removeProyek(p.id)}
                canRemove={value.proyek.length > 1}
              />
            ))}
          </div>

          {value.proyek.length < 6 && (
            <button type="button"
              onClick={addProyek}
              className="mt-3 w-full py-2.5 rounded-xl font-mono text-sm transition-all"
              style={{
                background: "transparent",
                border: "0.5px dashed var(--color-border-strong)",
                color: "var(--color-text-tertiary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,176,32,0.3)";
                e.currentTarget.style.color = "var(--app-amber)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-strong)";
                e.currentTarget.style.color = "var(--color-text-tertiary)";
              }}
            >
              + Tambah Proyek
            </button>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              setShowLayanan((v) => !v);
              if (!showLayanan && value.layanan.length === 0) addLayanan();
            }}
            className="flex items-center gap-2 font-mono text-xs transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <span
              style={{
                transform: showLayanan ? "rotate(90deg)" : "none",
                display: "inline-block",
                transition: "transform 0.2s",
              }}
            >
              ▶
            </span>
            {showLayanan
              ? "Sembunyikan layanan"
              : "Tambah layanan / services (untuk freelance)"}
          </button>

          {showLayanan && (
            <div className="mt-3 flex flex-col gap-2">
              {value.layanan.map((l) => (
                <div
                  key={l.id}
                  className="flex items-start gap-2 px-4 py-3 rounded-xl"
                  style={{ background: "var(--color-bg-elevated)", border: "0.5px solid var(--color-border-default)" }}
                >
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Nama layanan *"
                      value={l.nama}
                      onChange={(e) => updateLayanan(l.id, { ...l, nama: e.target.value })}
                      style={{ ...inputStyle(focusedLayanan === `nama-${l.id}`), gridColumn: "span 1" }}
                      onFocus={() => setFocusedLayanan(`nama-${l.id}`)}
                      onBlur={() => setFocusedLayanan("")}
                    />
                    <input
                      type="text"
                      placeholder="Deskripsi singkat"
                      value={l.deskripsi || ""}
                      onChange={(e) => updateLayanan(l.id, { ...l, deskripsi: e.target.value })}
                      style={{ ...inputStyle(focusedLayanan === `desc-${l.id}`), gridColumn: "span 1" }}
                      onFocus={() => setFocusedLayanan(`desc-${l.id}`)}
                      onBlur={() => setFocusedLayanan("")}
                    />
                    <input
                      type="text"
                      placeholder="Harga mulai dari (opsional)"
                      value={l.hargaMulai || ""}
                      onChange={(e) => updateLayanan(l.id, { ...l, hargaMulai: e.target.value })}
                      style={{ ...inputStyle(focusedLayanan === `harga-${l.id}`), gridColumn: "span 1" }}
                      onFocus={() => setFocusedLayanan(`harga-${l.id}`)}
                      onBlur={() => setFocusedLayanan("")}
                    />
                  </div>
                  <button type="button"
                    onClick={() => removeLayanan(l.id)}
                    className="flex-shrink-0 mt-1 opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: "#EF4444" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {value.layanan.length < 4 && (
                <button type="button"
                  onClick={addLayanan}
                  className="py-2 rounded-xl font-mono text-xs transition-all"
                  style={{ border: "0.5px dashed var(--color-border-strong)", color: "var(--color-text-tertiary)" }}
                >
                  + Tambah layanan
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between gap-3">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Kembali
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!canNext}
        >
          {canNext ? "Lanjut →" : "Isi minimal 1 proyek dulu"}
        </button>
      </div>
    </div>
  );
}
