"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last-resort boundary when the root layout itself fails; must render <html>. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#1A1A1A",
          color: "#F2F2EB",
          fontFamily: "ui-monospace, monospace",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem" }}>ArroBuild sedang bermasalah</h1>
          <p style={{ color: "rgba(255,255,255,0.68)" }}>Coba muat ulang sebentar lagi.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              background: "#FFB020",
              color: "#1A1A1A",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
