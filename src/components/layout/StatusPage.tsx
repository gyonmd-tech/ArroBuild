import Link from "next/link";
import type { ReactNode } from "react";

/** Shared shell for 404 and error pages, styled like the legal pages. */
export function StatusPage({
  code,
  title,
  description,
  action,
}: {
  code: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "160px 24px 80px",
        fontFamily: "var(--font-jetbrains-mono), monospace",
        color: "var(--color-text-secondary)",
        lineHeight: 1.75,
        fontSize: 14,
        textAlign: "center",
      }}
    >
      <p style={{ color: "var(--color-lime)", fontSize: 12, letterSpacing: "0.2em" }}>{code}</p>
      <h1
        style={{
          fontFamily: "var(--font-unbounded), sans-serif",
          color: "var(--color-text-primary)",
          fontSize: "1.75rem",
          margin: "12px 0 16px",
        }}
      >
        {title}
      </h1>
      <p>{description}</p>
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          flexWrap: "wrap",
          marginTop: 32,
        }}
      >
        {action}
        <Link href="/" style={{ color: "var(--color-lime)", padding: "10px 4px" }}>
          ← Beranda
        </Link>
      </div>
    </main>
  );
}
