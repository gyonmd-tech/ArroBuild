"use client";

import { useState, useRef } from "react";
import type { ProductType, ContextData, Feature } from "./types";
import FeatureBuilder from "./FeatureBuilder";
import LiveJsonPreview from "./LiveJsonPreview";

interface Props {
  productType: ProductType;
  value: ContextData;
  onChange: (v: ContextData) => void;
  features: Feature[];
  onFeaturesChange: (features: Feature[]) => void;
  onNext: () => void;
  onBack: () => void;
}

interface Question {
  key: keyof ContextData;
  label: string;
  placeholder: string;
  type?: "text" | "textarea";
  example?: string;
  chips?: string[];
  multiChip?: boolean;
  required?: boolean;
}

// ─── Question bank per ProductType ────────────────────────────────────────────

const QUESTIONS: Record<ProductType, Question[]> = {
  saas: [
    {
      key: "targetUser",
      label: "Siapa target user utama kamu?",
      placeholder: "Siapa yang akan paling sering pakai produk ini...",
      type: "text",
      required: true,
      example: "Developer Indonesia yang baru mulai belajar vibe coding",
      chips: ["Freelancer", "Tim kecil (2-10 orang)", "Startup tahap awal", "Developer individu", "Perusahaan menengah"],
      multiChip: true,
    },
    {
      key: "mainProblem",
      label: "Masalah utama yang ingin dipecahkan?",
      placeholder: "Pain point spesifik yang bikin mereka frustrasi hari-hari...",
      type: "textarea",
      required: true,
      example: "Developer kesulitan membuat dokumentasi proyek sebelum mulai coding — jadinya sering salah arah",
      chips: ["Proses manual yang makan waktu", "Data tersebar di banyak tools", "Biaya software mahal", "Sulit koordinasi tim jarak jauh", "Workflow berulang tanpa otomasi"],
      multiChip: true,
    },
    {
      key: "coreFeatures",
      label: "Fitur inti yang HARUS ada di versi pertama?",
      placeholder: "Fitur-fitur core yang kalau tidak ada, produknya tidak bisa jalan...",
      type: "textarea",
      example: "AI doc generator, project dashboard, template library, 1-click export ke .md",
      chips: ["Dashboard analytics", "User authentication", "Payment / billing", "Team collaboration", "API / integrations", "Export / download"],
      multiChip: true,
    },
    {
      key: "pricingModel",
      label: "Model bisnis yang direncanakan?",
      placeholder: "Bagaimana kamu akan memonetisasi produk ini...",
      type: "text",
      chips: ["Freemium", "Subscription bulanan", "Pay-per-use / credit", "One-time purchase", "Trial 14 hari → paid"],
    },
  ],
  marketplace: [
    {
      key: "buyerDesc",
      label: "Siapa buyer-nya?",
      placeholder: "Deskripsikan buyer: siapa, apa kebutuhan utamanya...",
      type: "text",
      required: true,
      example: "Startup & UMKM yang butuh desainer profesional",
      chips: ["Pembeli individu", "UMKM / bisnis kecil", "Perusahaan / enterprise", "Freelancer yang butuh jasa"],
      multiChip: true,
    },
    {
      key: "sellerDesc",
      label: "Siapa seller-nya?",
      placeholder: "Deskripsikan seller: siapa, apa yang mereka tawarkan...",
      type: "text",
      required: true,
      example: "Freelance designer lokal yang mau dapat klien",
      chips: ["Penjual UMKM", "Freelancer jasa", "Reseller / dropshipper", "Creator / content maker"],
      multiChip: true,
    },
    {
      key: "transactionType",
      label: "Apa yang ditransaksikan?",
      placeholder: "Produk fisik, digital, jasa, atau informasi...",
      type: "text",
      chips: ["Produk fisik", "Produk digital", "Jasa", "Informasi / konten"],
    },
    {
      key: "mainProblem",
      label: "Masalah utama yang dipecahkan?",
      placeholder: "Problem untuk buyer dan/atau seller yang belum terpecahkan...",
      type: "textarea",
      example: "Buyer: susah cari designer lokal terpercaya. Seller: tidak ada platform khusus untuk jangkau klien",
      chips: ["Sulit menemukan penjual/pembeli terpercaya", "Transaksi manual via chat", "Tidak ada sistem rating / escrow", "Susah bandingkan harga / kualitas"],
      multiChip: true,
    },
    {
      key: "pricingModel",
      label: "Monetisasi marketplace?",
      placeholder: "Komisi, subscription seller, listing berbayar...",
      type: "text",
      chips: ["Komisi per transaksi", "Subscription seller", "Listing berbayar", "Freemium + premium features"],
    },
  ],
  mobile: [
    {
      key: "platforms",
      label: "Platform target?",
      placeholder: "iOS saja, Android saja, atau keduanya...",
      type: "text",
      required: true,
      chips: ["iOS saja", "Android saja", "iOS & Android", "Cross-platform (Expo)"],
    },
    {
      key: "targetUser",
      label: "Siapa target user utama?",
      placeholder: "Siapa yang akan pakai app ini dan dalam konteks apa...",
      type: "text",
      required: true,
      example: "Mahasiswa yang butuh catatan kuliah terorganisir",
      chips: ["Mahasiswa / pelajar", "Profesional mobile-first", "Commuter / on-the-go", "Pengguna media sosial aktif", "Parent / keluarga"],
      multiChip: true,
    },
    {
      key: "mainProblem",
      label: "Apa value spesifik yang hanya bisa dilakukan di mobile?",
      placeholder: "Fitur atau experience yang tidak bisa dilakukan di web...",
      type: "textarea",
      required: true,
      example: "Scan langsung dari kamera, notifikasi real-time, offline mode",
      chips: ["Akses kamera / scan", "Notifikasi push real-time", "Offline mode / sync", "GPS / location-based", "Widget / quick action"],
      multiChip: true,
    },
    {
      key: "nativeFeatures",
      label: "Ada fitur native device yang dibutuhkan?",
      placeholder: "Kamera, GPS, notifikasi, sensor, NFC, biometrik...",
      type: "text",
      chips: ["Kamera", "GPS / lokasi", "Notifikasi push", "Sensor", "NFC", "Biometrik (FaceID/fingerprint)"],
      multiChip: true,
    },
  ],
  api: [
    {
      key: "targetDev",
      label: "Siapa developer yang akan pakai API ini?",
      placeholder: "Backend dev, frontend dev, data engineer, mobile dev...",
      type: "text",
      required: true,
      example: "Backend developer yang butuh ekstrak data dari dokumen scan",
      chips: ["Backend developer", "Frontend / fullstack developer", "Data engineer / ML engineer", "DevOps / SRE", "Mobile developer"],
      multiChip: true,
    },
    {
      key: "mainProblem",
      label: "Apa yang bisa dilakukan dengan API atau tool ini?",
      placeholder: "Core capability yang ditawarkan...",
      type: "textarea",
      required: true,
      example: "Ekstrak structured data dari invoice, receipt, atau KTP secara otomatis",
      chips: ["Data processing / transformation", "Authentication / authorization", "Payment processing", "AI / ML inference", "File processing / conversion", "Communication (email, SMS, push)"],
      multiChip: true,
    },
    {
      key: "inputOutput",
      label: "Input apa yang diterima, output apa yang dihasilkan?",
      placeholder: "Contoh: input PDF/gambar → output JSON dengan field yang diekstrak...",
      type: "text",
      chips: ["JSON ↔ JSON", "File upload → processed output", "Text → structured data", "Webhook / event-driven"],
    },
    {
      key: "deploymentTarget",
      label: "Deployment target?",
      placeholder: "Self-hosted, cloud service, npm package, CLI...",
      type: "text",
      chips: ["Self-hosted", "Cloud / SaaS", "npm package", "CLI tool"],
    },
  ],
  "ai-app": [
    {
      key: "aiUseCase",
      label: "AI digunakan untuk apa di produk ini?",
      placeholder: "Core use case AI — apa yang AI lakukan...",
      type: "textarea",
      required: true,
      example: "Generate dokumentasi teknis dari deskripsi produk dalam bahasa alami",
      chips: ["Generate konten (teks / gambar / kode)", "Analisis & klasifikasi data", "Chatbot / asisten percakapan", "Rekomendasi / personalisasi", "Ekstraksi informasi dari dokumen", "Otomasi workflow dengan AI"],
      multiChip: true,
    },
    {
      key: "targetUser",
      label: "Siapa target user dan bagaimana mereka berinteraksi dengan AI?",
      placeholder: "User persona dan pola interaksi dengan AI-nya...",
      type: "textarea",
      required: true,
      example: "Developer non-teknis yang berinteraksi via chat, tidak perlu tahu AI di baliknya",
      chips: ["Non-teknis, interaksi lewat chat", "Developer, integrasi via API", "Content creator, generate konten", "Analis data, insight otomatis", "Tim operasional, otomasi proses"],
      multiChip: true,
    },
    {
      key: "aiModel",
      label: "Model AI yang direncanakan?",
      placeholder: "GPT-4o, Claude, Gemini, Llama, atau custom model...",
      type: "text",
      chips: ["GPT-4o", "Claude Sonnet", "Gemini 2.5", "Open source / Custom"],
    },
    {
      key: "aiPrivacy",
      label: "Bagaimana privasi data user yang diproses AI?",
      placeholder: "Data dikirim ke API eksternal, on-device, atau self-hosted...",
      type: "text",
      chips: ["Data dikirim ke API cloud (OpenAI, dll)", "Self-hosted / on-premise model", "On-device inference", "Data di-anonymize sebelum diproses"],
    },
  ],
  ecommerce: [
    {
      key: "targetUser",
      label: "Siapa target pembeli?",
      placeholder: "Deskripsikan customer utama toko ini...",
      type: "text",
      required: true,
      example: "Ibu rumah tangga 25-40 tahun yang suka belanja produk lokal UMKM",
      chips: ["Konsumen langsung (B2C)", "Bisnis / wholesale (B2B)", "Reseller / dropshipper", "Niche community / hobbyist"],
      multiChip: true,
    },
    {
      key: "productType",
      label: "Apa yang dijual?",
      placeholder: "Produk fisik, digital, atau keduanya...",
      type: "text",
      required: true,
      chips: ["Produk fisik", "Produk digital", "Keduanya", "Subscription / member"],
    },
    {
      key: "mainProblem",
      label: "Masalah utama yang dipecahkan untuk pembeli?",
      placeholder: "Kenapa mereka pilih toko ini vs marketplace atau toko lain...",
      type: "textarea",
      chips: ["Produk sulit ditemukan di marketplace besar", "Pengalaman belanja generik / tidak personal", "Harga tidak transparan", "Kualitas produk tidak terjamin", "Pengiriman lambat / mahal"],
      multiChip: true,
    },
    {
      key: "salesChannel",
      label: "Channel penjualan?",
      placeholder: "Website sendiri, marketplace, social commerce, atau semua...",
      type: "text",
      chips: ["Website sendiri saja", "Website + marketplace (Tokopedia/Shopee)", "Social commerce (Instagram/TikTok)", "Omnichannel (online + offline)"],
    },
  ],
  portfolio: [
    {
      key: "stackHighlight",
      label: "Kamu seorang apa? Tech stack apa yang mau di-highlight?",
      placeholder: "Role dan stack utama yang ingin ditampilkan...",
      type: "text",
      required: true,
      example: "Full-stack developer spesialis AI tools, Next.js, TypeScript, Supabase",
      chips: ["Frontend developer", "Backend developer", "Full-stack developer", "Mobile developer", "UI/UX designer", "DevOps engineer"],
      multiChip: true,
    },
    {
      key: "audienceType",
      label: "Siapa yang akan melihat portfolio ini?",
      placeholder: "Recruiter startup, klien potensial, komunitas developer...",
      type: "text",
      required: true,
      chips: ["CTO / recruiter startup", "Klien freelance", "Komunitas developer", "Investor"],
    },
    {
      key: "coreFeatures",
      label: "Project atau skill apa yang paling ingin ditonjolkan?",
      placeholder: "List 2-4 project terbaik atau skill utama...",
      type: "textarea",
      chips: ["Project showcase dengan screenshot", "Blog / tulisan teknis", "Skill matrix / tech stack visual", "Testimonial / review klien", "Contact form / booking"],
      multiChip: true,
    },
    {
      key: "caseStudy",
      label: "Ada case study spesifik yang ingin diceritakan?",
      placeholder: "Project dengan impact nyata, angka, atau story menarik...",
      type: "text",
      chips: ["Project dengan revenue / growth metrics", "Open source project populer", "Project hackathon / kompetisi", "Client project dengan testimoni"],
    },
  ],
  internal: [
    {
      key: "teamSize",
      label: "Tim mana yang akan pakai, dan berapa orang?",
      placeholder: "Tim ops 8 orang, atau seluruh perusahaan 50 orang...",
      type: "text",
      required: true,
      example: "Tim operations & finance, ~12 orang",
      chips: ["Tim kecil (2-5 orang)", "Departemen (10-30 orang)", "Seluruh perusahaan (50+ orang)", "Multi-cabang / distributed"],
    },
    {
      key: "mainProblem",
      label: "Proses manual apa yang ingin diotomasi atau dipermudah?",
      placeholder: "Pain point workflow sekarang yang bikin lambat atau error-prone...",
      type: "textarea",
      required: true,
      example: "Manual entry data dari spreadsheet ke sistem, tidak ada audit trail, kolaborasi via email",
      chips: ["Data entry manual dari spreadsheet", "Approval workflow via email / chat", "Reporting manual (copas ke PPT / Excel)", "Tracking progress tanpa sistem", "Koordinasi antar departemen lambat"],
      multiChip: true,
    },
    {
      key: "coreFeatures",
      label: "Fitur inti yang dibutuhkan?",
      placeholder: "Fitur-fitur yang harus ada untuk tool internal ini...",
      type: "textarea",
      chips: ["Dashboard & reporting", "Form input / data entry", "Approval workflow", "Role-based access control", "Notifikasi & reminder", "Export data (CSV/PDF)"],
      multiChip: true,
    },
    {
      key: "integrations",
      label: "Integrasi dengan sistem yang sudah ada?",
      placeholder: "Google Workspace, Slack, Notion, sistem ERP...",
      type: "text",
      chips: ["Google Workspace", "Slack / Microsoft Teams", "Notion / Confluence", "Sistem ERP / accounting", "Tidak ada integrasi"],
      multiChip: true,
    },
  ],
  other: [
    {
      key: "targetUser",
      label: "Siapa target user utama kamu?",
      placeholder: "Siapa yang akan paling sering pakai produk ini...",
      type: "text",
      required: true,
      chips: ["Konsumen umum (B2C)", "Bisnis / perusahaan (B2B)", "Developer / teknis", "Komunitas / niche tertentu"],
      multiChip: true,
    },
    {
      key: "mainProblem",
      label: "Masalah utama yang ingin dipecahkan?",
      placeholder: "Pain point spesifik yang belum ada solusinya yang baik...",
      type: "textarea",
      required: true,
      chips: ["Proses yang terlalu manual", "Informasi sulit diakses", "Belum ada solusi yang tepat", "Solusi yang ada terlalu mahal"],
      multiChip: true,
    },
    {
      key: "coreFeatures",
      label: "Fitur atau kemampuan inti produk?",
      placeholder: "List fitur yang harus ada di versi pertama...",
      type: "textarea",
      chips: ["User registration / login", "Search / filter / browse", "Create / edit / delete content", "Notifications", "Analytics / tracking"],
      multiChip: true,
    },
  ],
};

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
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

const OPTIONAL_CHIPS: Partial<Record<keyof ContextData, string[]>> = {
  productName: ["Buildify", "NoteAI", "TaskFlow", "Belum ada nama"],
  referenceProducts: ["Linear", "Notion", "Stripe", "Vercel", "Figma"],
  antiFeatures: ["Tanpa chat AI", "Tanpa social login", "Tanpa dark mode", "Tanpa mobile app"],
  launchTimeline: ["Minggu ini", "Bulan ini", "3 bulan", "Tidak mendesak"],
};

const OPTIONAL_EXTRAS: { key: keyof ContextData; label: string; placeholder: string }[] = [
  { key: "productName", label: "Nama produk (jika sudah ada)", placeholder: "Contoh: Buildify, NoteAI, TaskFlow" },
  { key: "referenceProducts", label: "Referensi produk sejenis yang disukai", placeholder: "Contoh: Linear untuk tracking, Notion untuk docs" },
  { key: "antiFeatures", label: "Hal yang TIDAK ingin ada di produk ini", placeholder: "Feature yang sengaja dihindari atau out of scope" },
  { key: "launchTimeline", label: "Target peluncuran", placeholder: "Minggu ini / Bulan ini / 3 bulan / Tidak mendesak" },
];

// ─── Chip helpers ─────────────────────────────────────────────────────────────

function toggleChipInValue(currentVal: string, chip: string): string {
  const parts = currentVal.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.includes(chip)) return parts.filter((p) => p !== chip).join(", ");
  return [...parts, chip].join(", ");
}

function isChipActive(currentVal: string, chip: string): boolean {
  return currentVal.split(",").map((s) => s.trim()).includes(chip);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function QualityIndicator({ value, featureCount }: { value: ContextData; featureCount: number }) {
  const textFilled = Object.values(value).filter((v) => v && typeof v === "string" && String(v).trim().length > 2).length;
  const filled = textFilled + (featureCount > 0 ? 1 : 0);
  const score = Math.min(filled, 5);
  const levels = [
    { label: "Poor", color: "#EF4444", tip: "Isi minimal 1-2 field untuk memulai" },
    { label: "Fair", color: "#F59E0B", tip: "Coba tambah info tentang target user atau masalah utama" },
    { label: "Good", color: "#22C55E", tip: "Bagus! Tambah sedikit lagi untuk hasil yang lebih spesifik" },
    { label: "Great", color: "#22C55E", tip: "AI sudah punya konteks yang cukup baik" },
    { label: "Excellent", color: "#FFB020", tip: "Konteks sangat lengkap — output AI akan sangat spesifik" },
  ];
  const level = levels[Math.max(0, score - 1)] ?? levels[0];

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--color-bg-elevated)",
        border: "0.5px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Kualitas Konteks
          </span>
          <span
            className="text-sm font-bold"
            style={{ color: score > 0 ? level.color : "rgba(255,255,255,0.2)" }}
          >
            {score > 0 ? level.label : "—"}
          </span>
        </div>
        {/* 5-segment bar */}
        <div className="flex gap-1 mb-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-full transition-all duration-500"
              style={{
                background: i <= score ? level.color : "rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>
        {score > 0 && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            {level.tip}
          </p>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  q,
  index,
  value,
  onUpdate,
  visible,
  delay,
}: {
  q: Question;
  index: number;
  value: ContextData;
  onUpdate: (key: keyof ContextData, val: string) => void;
  visible: boolean;
  delay: number;
}) {
  const currentVal = (value[q.key] as string) ?? "";
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const nums = ["①", "②", "③", "④", "⑤"];

  if (!visible) return null;

  return (
    <div
      className="animate-fade-slide-up"
      style={{ animationDelay: `${delay}s` }}
    >
      {/* Question label */}
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{
            background: currentVal
              ? "rgba(255,176,32,0.12)"
              : "rgba(255,255,255,0.06)",
            color: currentVal ? "var(--color-lime)" : "rgba(255,255,255,0.3)",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: "10px",
          }}
        >
          {currentVal ? "✓" : nums[index] ?? (index + 1)}
        </span>
        <label
          className="font-mono text-[14px] font-bold"
          style={{ color: "var(--app-text-primary)", lineHeight: 1.4 }}
        >
          {q.label}
          {q.required && (
            <span className="ml-1 text-xs" style={{ color: "rgba(255,176,32,0.5)" }}>
              *
            </span>
          )}
        </label>
      </div>

      {/* Chips */}
      {q.chips && (
        <div className="flex flex-wrap gap-2 mb-3">
          {q.chips.map((chip) => {
            const active = q.multiChip ? isChipActive(currentVal, chip) : currentVal === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  onUpdate(
                    q.key,
                    q.multiChip ? toggleChipInValue(currentVal, chip) : active ? "" : chip
                  );
                }}
                className={`generate-chip ${active ? "is-selected" : ""}`}
              >
                {active && q.multiChip && <span className="mr-1">✓ </span>}
                {chip}
              </button>
            );
          })}
        </div>
      )}

      {/* Input */}
      {q.type === "textarea" ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={3}
          placeholder={q.placeholder}
          value={currentVal}
          onChange={(e) => onUpdate(q.key, e.target.value)}
          className="w-full rounded-xl text-sm resize-none transition-all focus:outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: currentVal
              ? "1px solid rgba(255,176,32,0.3)"
              : "0.5px solid rgba(255,255,255,0.1)",
            color: "var(--color-text-primary)",
            padding: "14px 16px",
            lineHeight: 1.7,
            fontFamily: "var(--font-inter), system-ui, sans-serif",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,176,32,0.5)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,176,32,0.06)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = currentVal
              ? "rgba(255,176,32,0.3)"
              : "rgba(255,255,255,0.1)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          placeholder={q.placeholder}
          value={currentVal}
          onChange={(e) => onUpdate(q.key, e.target.value)}
          className="w-full rounded-xl text-sm transition-all focus:outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: currentVal
              ? "1px solid rgba(255,176,32,0.3)"
              : "0.5px solid rgba(255,255,255,0.1)",
            color: "var(--color-text-primary)",
            padding: "14px 16px",
            fontFamily: "var(--font-inter), system-ui, sans-serif",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,176,32,0.5)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,176,32,0.06)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = currentVal
              ? "rgba(255,176,32,0.3)"
              : "rgba(255,255,255,0.1)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      )}

      {/* Example hint */}
      {q.example && !currentVal && (
        <div className="mt-2.5">
          <p className="font-mono text-[12px] italic mb-2" style={{ color: "var(--app-text-tertiary)" }}>
            Contoh: &ldquo;{q.example}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => onUpdate(q.key, q.example!)}
            className="font-mono text-[12px] px-2.5 py-1 rounded-md transition-colors"
            style={{
              color: "var(--app-sky)",
              border: "1px solid rgba(56,189,248,0.3)",
              background: "transparent",
            }}
          >
            Pakai contoh ini
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ContextStep({ productType, value, onChange, features, onFeaturesChange, onNext, onBack }: Props) {
  const questions = QUESTIONS[productType] ?? QUESTIONS.other;
  const [showOptional, setShowOptional] = useState(false);
  const [visibleCount, setVisibleCount] = useState(2);

  const update = (key: keyof ContextData, val: string) => {
    onChange({ ...value, [key]: val });
  };

  // Progressive reveal: show next when current pair has at least one answer.
  // Derived during render (monotonically increasing) instead of in an effect.
  const answered = questions.filter((q) => {
    const v = value[q.key];
    return v && String(v).trim().length > 0;
  }).length;
  const revealCount = Math.min(Math.max(2, answered + 1), questions.length);
  if (revealCount > visibleCount) {
    setVisibleCount(revealCount);
  }

  const hasAnyAnswer = questions.some((q) => {
    const v = value[q.key];
    return v && String(v).trim().length > 0;
  });

  return (
    <div className="generate-app max-w-[1100px] mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col lg:flex-row gap-8 lg:gap-10">
      <div className="flex-1 min-w-0 max-w-[640px]">
        {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase"
            style={{
              background: "rgba(255,176,32,0.08)",
              color: "var(--color-lime)",
              border: "0.5px solid rgba(255,176,32,0.2)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-lime)" }} />
            Step 2 of 4
          </div>
          <button type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            <span>{PRODUCT_TYPE_LABELS[productType]}</span>
            <span
              className="hover:underline"
              style={{ color: "rgba(255,176,32,0.6)", textDecorationColor: "rgba(255,176,32,0.3)" }}
            >
              [ubah]
            </span>
          </button>
        </div>

        <h1
          className="font-unbounded font-bold mb-3"
          style={{
            fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
            letterSpacing: "-0.03em",
            color: "var(--color-text-primary)",
            lineHeight: 1.15,
          }}
        >
          Ceritakan proyekmu
        </h1>
        <p className="text-base" style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          Makin detail, output AI makin relevan dan spesifik.{" "}
          <span style={{ color: "rgba(255,255,255,0.3)" }}>
            Klik chip untuk jawaban cepat, atau ketik langsung.
          </span>
        </p>
      </div>

      {/* Questions */}
      <div className="flex flex-col gap-7 mb-8">
        {questions.map((q, idx) => {
          // Replace coreFeatures textarea with FeatureBuilder
          if (q.key === "coreFeatures") {
            if (idx >= visibleCount) return null;
            return (
              <div
                key={q.key}
                className="animate-fade-slide-up"
                style={{ animationDelay: idx === visibleCount - 1 ? "0.05s" : "0s" }}
              >
                <FeatureBuilder
                  features={features}
                  onChange={onFeaturesChange}
                  productType={productType}
                />
              </div>
            );
          }
          return (
            <QuestionCard
              key={q.key}
              q={q}
              index={idx}
              value={value}
              onUpdate={update}
              visible={idx < visibleCount}
              delay={idx === visibleCount - 1 ? 0.05 : 0}
            />
          );
        })}
      </div>

      {/* Optional extras */}
      <div className="mb-8">
        <button type="button"
          onClick={() => setShowOptional(!showOptional)}
          className="flex items-center gap-2 text-sm transition-colors mb-4 w-full text-left"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          <div
            className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: showOptional ? "rgba(255,176,32,0.1)" : "rgba(255,255,255,0.05)",
              border: showOptional ? "0.5px solid rgba(255,176,32,0.2)" : "0.5px solid rgba(255,255,255,0.08)",
            }}
          >
            <span
              className="text-[10px] transition-transform duration-200"
              style={{
                transform: showOptional ? "rotate(90deg)" : "none",
                display: "inline-block",
                color: showOptional ? "var(--color-lime)" : "rgba(255,255,255,0.3)",
              }}
            >
              ▶
            </span>
          </div>
          <span>
            {showOptional ? "Sembunyikan" : "Tambah konteks opsional"}
            <span className="ml-2 text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
              (nama produk, referensi, timeline...)
            </span>
          </span>
        </button>

        {showOptional && (
          <div
            className="rounded-2xl overflow-hidden animate-fade-slide-up"
            style={{ border: "0.5px solid rgba(255,255,255,0.08)" }}
          >
            {OPTIONAL_EXTRAS.map((extra, i) => (
              <div
                key={extra.key}
                className="px-5 py-4"
                style={{
                  borderBottom:
                    i < OPTIONAL_EXTRAS.length - 1
                      ? "0.5px solid rgba(255,255,255,0.06)"
                      : "none",
                  background: "var(--color-bg-elevated)",
                }}
              >
                <label
                  className="block text-xs font-semibold mb-2"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  {extra.label}
                </label>
                <input
                  type="text"
                  placeholder={extra.placeholder}
                  value={(value[extra.key] as string) ?? ""}
                  onChange={(e) => update(extra.key, e.target.value)}
                  className="w-full rounded-lg text-sm transition-all focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    color: "var(--color-text-primary)",
                    padding: "10px 14px",
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
                {(OPTIONAL_CHIPS[extra.key] ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(OPTIONAL_CHIPS[extra.key] ?? []).map((chip) => {
                      const current = (value[extra.key] as string) ?? "";
                      const active = isChipActive(current, chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() =>
                            update(extra.key, toggleChipInValue(current, chip))
                          }
                          className="text-[11px] px-2.5 py-1 rounded-full transition-all"
                          style={{
                            background: active
                              ? "rgba(255,176,32,0.15)"
                              : "rgba(255,255,255,0.04)",
                            border: active
                              ? "0.5px solid rgba(255,176,32,0.4)"
                              : "0.5px solid rgba(255,255,255,0.1)",
                            color: active
                              ? "var(--color-lime)"
                              : "rgba(255,255,255,0.45)",
                          }}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quality indicator */}
      <div className="mb-8">
        <QualityIndicator value={value} featureCount={features.length} />
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button type="button"
          onClick={onBack}
          className="px-6 py-4 rounded-2xl text-sm font-medium transition-all"
          style={{
            background: "var(--color-bg-elevated)",
            color: "rgba(255,255,255,0.5)",
            border: "0.5px solid rgba(255,255,255,0.08)",
          }}
        >
          ← Kembali
        </button>
        <button type="button"
          onClick={onNext}
          disabled={!hasAnyAnswer}
          className="flex-1 py-4 rounded-2xl font-semibold text-base transition-all duration-200"
          style={{
            background: hasAnyAnswer ? "var(--app-amber)" : "var(--app-bg-elevated)",
            color: hasAnyAnswer ? "#0D1321" : "var(--app-text-tertiary)",
            cursor: hasAnyAnswer ? "pointer" : "not-allowed",
            border: hasAnyAnswer ? "none" : "0.5px solid var(--app-border-default)",
          }}
        >
          {hasAnyAnswer ? "Lanjut ke Stack & Preferences →" : "Ceritakan sedikit saja dulu"}
        </button>
      </div>
      </div>
      
      <div className="lg:hidden mb-6">
        <details className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--app-border-default)" }}>
          <summary className="font-mono text-[12px] font-semibold px-4 py-3 cursor-pointer" style={{ color: "var(--app-sky)", background: "var(--app-bg-elevated)" }}>
            Lihat progress knowledge model
          </summary>
          <div className="p-3">
            <LiveJsonPreview data={value} features={features} />
          </div>
        </details>
      </div>

      <div className="hidden lg:block w-[420px] flex-shrink-0 sticky top-20 self-start">
        <LiveJsonPreview data={value} features={features} />
      </div>
    </div>
  );
}
