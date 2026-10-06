"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const FAQ_ITEMS = [
  {
    q: "Apa bedanya ArroBuild dengan ChatGPT biasa?",
    a: "ChatGPT menghasilkan teks generik berdasarkan prompt tunggal. ArroBuild membuat dokumen yang saling terhubung lewat sistem FEAT-ID — setiap fitur yang kamu tulis di PRD otomatis direferensi di Architecture, Design System, dan Agent Rules. Hasilnya bukan sekadar teks, tapi konteks yang bisa langsung dibaca AI coding tool kamu.",
  },
  {
    q: "Apakah file yang dihasilkan bisa langsung dipakai di Cursor/Claude Code?",
    a: "Ya, melalui file ZIP berisi dokumen Markdown dan agent rules. Kamu tetap perlu mengekstrak file, menempatkannya di repo, lalu mengikuti aturan konteks tool yang dipakai. Sinkronisasi akun atau editor otomatis belum tersedia.",
  },
  {
    q: "Apakah data proyek saya aman?",
    a: "Project tersimpan di akunmu dan input yang diperlukan dikirim ke provider AI saat generation. ArroBuild tidak memakai konten project untuk melatih model sendiri. Hindari memasukkan secret, password, atau data pribadi sensitif ke dalam brief.",
  },
  {
    q: "Bisa coba sebelum bayar?",
    a: "Bisa. Kamu bisa explore Mini Tools, Learn Hub, hingga mengisi seluruh form spesifikasi proyek (Step 0-4) sepenuhnya gratis. Paywall (kredit) baru akan diminta di akhir saat kamu siap melakukan generate dokumen AI.",
  },
  {
    q: "Metode pembayaran apa yang didukung?",
    a: "Pembayaran diproses melalui Midtrans. Metode yang tersedia mengikuti opsi yang ditampilkan pada halaman Snap Checkout saat transaksi dibuat.",
  },
  {
    q: "Bagaimana kalau dokumen yang dihasilkan tidak sesuai ekspektasi?",
    a: "Kamu dapat merevisi section tertentu. Core mendapat satu revisi gratis per bulan, sedangkan Prime mendapat revisi tanpa batas jumlah; revisi berbayar lain menggunakan kredit. Regenerate per file tersedia untuk Prime.",
  },
];

export default function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section
      id="faq"
      style={{
        background: "var(--lp-bg-base)",
        padding: "160px 24px",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          style={{
            fontFamily: "var(--font-unbounded)",
            fontWeight: 800,
            fontSize: "clamp(24px, 4vw, 40px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "var(--lp-text-primary)",
            margin: "0 0 64px",
          }}
        >
          Pertanyaan umum.
        </motion.h2>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {FAQ_ITEMS.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.05 }}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <button type="button"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "32px 0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 24,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 18,
                    fontWeight: 700,
                    color: openIdx === i ? "var(--lp-text-primary)" : "var(--lp-text-secondary)",
                    lineHeight: 1.5,
                    transition: "color 0.2s",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {item.q}
                </span>
                <span
                  style={{
                    color: openIdx === i ? "var(--lp-text-primary)" : "var(--lp-text-tertiary)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    transition: "color 0.2s, transform 0.2s",
                    transform: openIdx === i ? "rotate(45deg)" : "rotate(0deg)",
                    fontSize: 24,
                    fontWeight: 300,
                  }}
                >
                  +
                </span>
              </button>

              <AnimatePresence initial={false}>
                {openIdx === i && (
                  <motion.div
                    key="answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        paddingBottom: 32,
                      }}
                    >
                      <p
                        style={{
                          fontFamily: "var(--font-jetbrains-mono)",
                          fontSize: 15,
                          color: "var(--lp-text-tertiary)",
                          margin: 0,
                          lineHeight: 1.8,
                          maxWidth: 600,
                        }}
                      >
                        {item.a}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
