"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GeneratedFiles, FileKey } from "./types";
import { FILE_META, ALL_FILE_KEYS } from "./types";
import { DocIcon } from "@/lib/ui/app-icons";
import { useToast } from "@/components/ui/Toast";
import { trackEvent } from "@/lib/analytics";
import { OPEN_LEARN_IN_NEW_TAB } from "@/lib/learn-links";

interface DocPreviewProps {
  projectId: string | null;
  files: GeneratedFiles;
  onRestart: () => void;
}

const ALL_POSSIBLE_KEYS: FileKey[] = [...ALL_FILE_KEYS];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    trackEvent("copy_to_clipboard");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button"
      id="copy-file-btn"
      onClick={handleCopy}
      className="btn btn-secondary btn-sm flex items-center gap-1.5"
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="var(--app-amber)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ color: "var(--app-amber)" }}>Copied!</span>
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const markdownStyles = `
  .md-content h1 { font-family: var(--font-unbounded, 'Unbounded'), sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 1.5rem 0 0.75rem; letter-spacing: -0.03em; line-height: 1.25; }
  .md-content h2 { font-family: var(--font-jetbrains-mono, monospace); font-size: 0.95rem; font-weight: 600; color: var(--color-text-primary); margin: 1.4rem 0 0.5rem; border-bottom: 0.5px solid var(--color-border-default); padding-bottom: 6px; }
  .md-content h3 { font-family: var(--font-jetbrains-mono, monospace); font-size: 0.88rem; font-weight: 600; color: var(--color-text-secondary); margin: 1.1rem 0 0.4rem; }
  .md-content h4 { font-family: var(--font-jetbrains-mono, monospace); font-size: 0.84rem; font-weight: 600; color: var(--color-text-tertiary); margin: 0.9rem 0 0.35rem; }
  .md-content p { font-family: var(--font-jetbrains-mono, monospace); font-size: 13px; line-height: 1.8; color: var(--color-text-secondary); margin: 0.55rem 0; }
  .md-content code { font-family: var(--font-jetbrains-mono, monospace); font-size: 12px; padding: 2px 6px; border-radius: 4px; background: rgba(255,176,32,0.08); color: var(--app-amber); border: 0.5px solid rgba(255,176,32,0.22); white-space: pre-wrap; word-break: break-all; }
  .md-content pre { background: #2A2A2A; border: 0.5px solid var(--color-border-default); border-radius: 10px; padding: 1rem 1.1rem; margin: 0.85rem 0; overflow-x: auto; }
  .md-content pre code { background: none; border: none; padding: 0; font-size: 12px; color: var(--color-text-primary); white-space: pre; word-break: normal; }
  .md-content ul, .md-content ol { margin: 0.5rem 0 0.5rem 1.5rem; }
  .md-content li { font-family: var(--font-jetbrains-mono, monospace); font-size: 13px; line-height: 1.75; color: var(--color-text-secondary); margin: 0.25rem 0; }
  .md-content li::marker { color: var(--app-amber); }
  .md-content blockquote { border-left: 2.5px solid var(--app-amber); padding: 0.55rem 1rem; margin: 0.75rem 0; background: rgba(255,176,32,0.05); border-radius: 0 8px 8px 0; }
  .md-content blockquote p { color: var(--color-text-secondary); margin: 0; }
  .md-content hr { border: none; border-top: 0.5px solid var(--color-border-default); margin: 1.25rem 0; }
  .md-content table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 12px; font-family: var(--font-jetbrains-mono, monospace); }
  .md-content thead tr { background: var(--color-bg-hover); }
  .md-content th { padding: 8px 12px; text-align: left; font-weight: 600; color: var(--color-text-primary); border: 0.5px solid var(--color-border-default); }
  .md-content td { padding: 8px 12px; color: var(--color-text-secondary); border: 0.5px solid var(--color-border-default); }
  .md-content tr:nth-child(even) { background: rgba(255,255,255,0.03); }
  .md-content a { color: var(--app-amber); text-decoration: none; }
  .md-content a:hover { text-decoration: underline; }
  .md-content strong { color: var(--color-text-primary); font-weight: 600; }
  .md-content em { color: var(--color-text-secondary); font-style: italic; }
  .md-content input[type="checkbox"] { accent-color: var(--app-amber); margin-right: 6px; }
`;

export default function DocPreview({ projectId, files, onRestart }: DocPreviewProps) {
  const { toast } = useToast();
  const availableKeys = ALL_POSSIBLE_KEYS.filter((k) => files[k]);
  const [activeKey, setActiveKey] = useState<FileKey>(availableKeys[0] ?? "prd");
  const [showRaw, setShowRaw] = useState(false);

  const activeContent = files[activeKey] ?? "";
  const meta = FILE_META[activeKey];

  const triggerDownload = useCallback(async () => {
    if (!projectId) {
      toast("Project ID tidak ditemukan, coba ulangi generation.", "error");
      return;
    }

    try {
      const res = await fetch(`/api/export?projectId=${projectId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Export gagal");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arrobuild-docs-${projectId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      trackEvent("zip_downloaded");
      toast("✓ File berhasil didownload!", "success");
    } catch (err) {
      console.error("Export error:", err);
      const blob = new Blob([activeContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeKey}.md`;
      a.click();
      URL.revokeObjectURL(url);
      trackEvent("download_fallback", { fileKey: activeKey });
      toast("Export gagal, mendownload file aktif saja.", "error");
    }
  }, [projectId, activeContent, activeKey, toast]);

  function handleDownloadClick() {
    void triggerDownload();
  }

  return (
    <div className="generate-app max-w-[900px] mx-auto px-5 sm:px-6 py-8 sm:py-12">
      {/* Success + actions */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-xl mb-6 overflow-hidden"
        style={{
          background: "var(--app-bg-elevated)",
          border: "0.5px solid var(--app-border-default)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div
          className="px-5 sm:px-6 py-5 sm:py-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5"
          style={{ borderLeft: "3px solid var(--app-amber)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.1 }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] font-bold tracking-widest uppercase"
                style={{
                  background: "rgba(255,176,32,0.12)",
                  color: "var(--app-amber)",
                  border: "0.5px solid rgba(255,176,32,0.25)",
                }}
              >
                <CheckCircle2 size={12} strokeWidth={2.5} />
                Docs siap!
              </motion.span>
            </div>
            <h1
              className="font-unbounded font-bold text-xl sm:text-2xl mb-1.5"
              style={{ color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}
            >
              {availableKeys.length} dokumen berhasil digenerate
            </h1>
            <p className="font-mono text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Siap dipakai di AI agent kamu.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
            {projectId && (
              <a
                id="preview-workspace-btn"
                href={`/project/${projectId}`}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono font-bold text-sm transition-all"
                style={{ background: "var(--app-amber)", color: "#0D1321" }}
              >
                Buka di workspace
              </a>
            )}
            <button type="button"
              id="preview-download-btn"
              onClick={handleDownloadClick}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono font-bold text-sm transition-all"
              style={{
                background: projectId ? "var(--app-bg-surface)" : "var(--app-amber)",
                color: projectId ? "var(--app-text-primary)" : "#0D1321",
                border: projectId ? "0.5px solid var(--app-border-strong)" : "none",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download ZIP
            </button>
            <button type="button"
              id="preview-restart-btn"
              onClick={onRestart}
              className="px-4 py-2.5 rounded-lg font-mono text-sm transition-all"
              style={{
                background: "var(--color-bg-surface)",
                color: "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-default)",
              }}
            >
              Generate lagi
            </button>
          </div>
        </div>
      </motion.section>

      {/* Quick Start */}
      <section
        className="rounded-xl px-5 py-4 mb-6"
        style={{
          background: "var(--app-bg-surface)",
          border: "0.5px solid var(--app-border-default)",
        }}
      >
        <p
          className="font-mono text-[10px] font-bold tracking-widest uppercase mb-3"
          style={{ color: "var(--app-text-tertiary)" }}
        >
          Quick Start
        </p>
        <ol className="flex flex-col gap-2">
          {[
            "Extract ZIP ke root folder proyekmu",
            "Buka AI agent-mu, paste file rules (.cursorrules / CLAUDE.md)",
            "Mulai coding — AI sudah punya konteks proyekmu!",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="font-mono text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: "rgba(56,189,248,0.12)",
                  color: "var(--app-sky)",
                  border: "0.5px solid rgba(56,189,248,0.25)",
                }}
              >
                {i + 1}
              </span>
              <span
                className="font-mono text-sm"
                style={{ color: "var(--app-text-secondary)", lineHeight: 1.65 }}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>
        <div
          className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 mt-4 pt-4"
          style={{ borderTop: "0.5px solid var(--app-border-default)" }}
        >
          <Link
            href="/learn"
            {...OPEN_LEARN_IN_NEW_TAB}
            className="font-mono text-xs flex items-center gap-1.5 transition-colors hover:opacity-80"
            style={{ color: "var(--app-sky)" }}
          >
            → Cara pakai context.md di Claude Code
          </Link>
          <Link
            href="/learn"
            {...OPEN_LEARN_IN_NEW_TAB}
            className="font-mono text-xs flex items-center gap-1.5 transition-colors hover:opacity-80"
            style={{ color: "var(--app-sky)" }}
          >
            → Setup .cursorrules yang benar
          </Link>
        </div>
      </section>

      {/* Tabs */}
      <div
        className="flex gap-1 mb-4 p-1 rounded-xl overflow-x-auto"
        style={{
          background: "var(--color-bg-surface)",
          border: "0.5px solid var(--color-border-default)",
        }}
      >
        {availableKeys.map((key) => {
          const m = FILE_META[key];
          const isActive = activeKey === key;
          return (
            <button type="button"
              key={key}
              id={`preview-tab-${key}`}
              onClick={() => {
                trackEvent("tab_switched", { toTab: key });
                setActiveKey(key);
                setShowRaw(false);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150"
              style={{
                color: isActive ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                background: isActive ? "var(--color-bg-elevated)" : "transparent",
                border: isActive ? "0.5px solid var(--color-border-strong)" : "0.5px solid transparent",
                boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
              }}
            >
              <DocIcon doc={key} size={14} style={{ color: isActive ? "var(--app-amber)" : "var(--app-text-tertiary)" }} />
              <span className="font-mono text-xs sm:text-sm">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Preview card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--color-bg-elevated)",
          border: "0.5px solid var(--color-border-default)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        }}
      >
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 sm:px-6 py-4"
          style={{
            borderBottom: "0.5px solid var(--color-border-default)",
            background: "var(--color-bg-surface)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <DocIcon doc={activeKey} size={20} className="shrink-0" style={{ color: "var(--app-amber)" }} />
            <div className="min-w-0">
              <p className="text-h3 truncate">{meta.label}</p>
              <p className="text-caption font-mono">{activeKey}.md</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button"
              id={`toggle-raw-${activeKey}`}
              onClick={() => {
                trackEvent("raw_toggle", { enabled: !showRaw });
                setShowRaw((v) => !v);
              }}
              className="btn btn-secondary btn-sm"
            >
              {showRaw ? "Rendered" : "Raw"}
            </button>
            <CopyButton text={activeContent} />
          </div>
        </div>

        <div
          className="px-5 sm:px-6 py-5 sm:py-6 overflow-auto"
          style={{
            maxHeight: "min(62vh, 720px)",
            background: "var(--color-bg-elevated)",
          }}
        >
          {activeContent ? (
            showRaw ? (
              <pre
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {activeContent}
              </pre>
            ) : (
              <>
                <style>{markdownStyles}</style>
                <div className="md-content max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeContent}
                  </ReactMarkdown>
                </div>
              </>
            )
          ) : (
            <p className="text-secondary">No content available for this file.</p>
          )}
        </div>
      </div>

      {activeContent && (
        <p
          className="font-mono text-[11px] mt-3 text-center sm:text-left"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {activeContent.split(/\s+/).filter(Boolean).length} words ·{" "}
          {activeContent.length.toLocaleString()} characters
        </p>
      )}
    </div>
  );
}

