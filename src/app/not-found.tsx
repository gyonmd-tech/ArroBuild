import type { Metadata } from "next";
import { StatusPage } from "@/components/layout/StatusPage";

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan — ArroBuild",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="Halaman tidak ditemukan"
      description="Link ini mungkin sudah dipindah atau salah ketik."
    />
  );
}
