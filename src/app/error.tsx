"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { StatusPage } from "@/components/layout/StatusPage";

export default function ErrorPage({
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
    <StatusPage
      code="ERROR"
      title="Ada yang tidak beres"
      description="Halaman ini gagal dimuat. Coba lagi; kalau masih gagal, hubungi support."
      action={
        <button
          type="button"
          onClick={reset}
          style={{
            background: "var(--color-lime)",
            color: "#1A1A1A",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontFamily: "inherit",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Coba lagi
        </button>
      }
    />
  );
}
