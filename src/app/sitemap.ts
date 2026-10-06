import type { MetadataRoute } from "next";
import { LEARNING_PATHS } from "@/lib/learn-content";
import { MINI_TOOLS } from "@/lib/config/mini-tools";
import { getSiteUrl } from "@/lib/site-url";

/** Wizard tools with their own page; the rest render through /tools/[toolId]. */
const CUSTOM_TOOL_PAGES = [
  "arrodesign",
  "copy-studio",
  "portfolio",
  "readme-generator",
  "stack-advisor",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();

  const page = (
    path: string,
    priority: number,
    changeFrequency: "weekly" | "monthly" | "yearly" = "monthly",
  ) => ({ url: `${baseUrl}${path}`, changeFrequency, priority });

  const toolIds = new Set([...CUSTOM_TOOL_PAGES, ...Object.keys(MINI_TOOLS)]);

  return [
    page("", 1, "weekly"),
    page("/generate", 0.9),
    page("/learn", 0.85, "weekly"),
    ...LEARNING_PATHS.map((path) => page(`/learn/${path.slug}`, 0.7)),
    ...LEARNING_PATHS.flatMap((path) =>
      path.lessons.map((lesson) => page(`/learn/${path.slug}/${lesson.slug}`, 0.6)),
    ),
    page("/tools", 0.8, "weekly"),
    ...[...toolIds].map((id) => page(`/tools/${id}`, 0.7)),
    page("/integrations", 0.5),
    page("/signup", 0.5),
    page("/privacy", 0.2, "yearly"),
    page("/terms", 0.2, "yearly"),
  ];
}
