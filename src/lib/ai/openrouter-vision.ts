import OpenAI from "openai";

/** OpenRouter model id for Qwen3-VL (vision). */
export const OPENROUTER_VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL?.trim() ||
  "qwen/qwen3-vl-235b-a22b-instruct";

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

let _client: OpenAI | null = null;

function getOpenRouter(): OpenAI {
  if (!_client) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key?.trim()) throw new Error("OPENROUTER_API_KEY is not set");
    _client = new OpenAI({
      apiKey: key,
      baseURL: "https://openrouter.ai/api/v1",
      // Non-streaming call inside a 120s route: bound the whole request.
      timeout: 100_000,
      maxRetries: 1,
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://arrobuild.com",
        "X-Title": "ArroBuild",
      },
    });
  }
  return _client;
}

export type VisionImagePart = {
  /** data:image/...;base64,... or https URL */
  url: string;
};

/**
 * Multimodal completion via OpenRouter (Qwen3-VL by default).
 * Used by Copy Studio screenshot mode and (later) ArroDesign.
 */
export async function generateVision(params: {
  prompt: string;
  images: VisionImagePart[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  if (params.images.length === 0) {
    throw new Error("generateVision requires at least one image");
  }

  const client = getOpenRouter();
  const model = params.model ?? OPENROUTER_VISION_MODEL;

  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: params.prompt },
    ...params.images.map(
      (img): OpenAI.Chat.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: { url: img.url },
      })
    ),
  ];

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content }],
    temperature: params.temperature ?? 0.4,
    max_tokens: params.maxOutputTokens ?? 4000,
  });

  const text = res.choices[0]?.message?.content;
  if (!text?.trim()) {
    throw new Error("Vision model returned empty content");
  }
  return text;
}
