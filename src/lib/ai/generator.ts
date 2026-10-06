import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "./prompts/shared";

// ─── Provider Clients (lazy-init) ───────────────────────────────────────────

let _gemini: GoogleGenAI | null = null;
let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;
let _deepseek: OpenAI | null = null;

/**
 * Providers are always streamed. OpenAI/Anthropic SDK timeouts bound the wait
 * for the first byte; Gemini's bounds the whole call, so it stays below the
 * longest route maxDuration (180s). SDK retries are off because the
 * orchestrator and generateWithFallback already retry and fall back per model.
 */
const FIRST_BYTE_TIMEOUT_MS = 60_000;
const GEMINI_CALL_TIMEOUT_MS = 150_000;

function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    _gemini = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: GEMINI_CALL_TIMEOUT_MS } });
  }
  return _gemini;
}

function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    _openai = new OpenAI({ apiKey: key, timeout: FIRST_BYTE_TIMEOUT_MS, maxRetries: 0 });
  }
  return _openai;
}

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey: key, timeout: FIRST_BYTE_TIMEOUT_MS, maxRetries: 0 });
  }
  return _anthropic;
}

function getDeepSeek(): OpenAI {
  if (!_deepseek) {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
    _deepseek = new OpenAI({
      apiKey: key,
      baseURL: "https://api.deepseek.com",
      timeout: FIRST_BYTE_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return _deepseek;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  model?: string;
  provider?: AIProvider;
}

export interface GenerationResult {
  content: string;
  finishReason: string | null;
}

const DEFAULT_CONFIG: GenerationConfig = {
  maxOutputTokens: 8192,
  temperature: 0.7,
  model: "gemini-3.1-flash-lite",
  provider: "gemini",
};

function resolveProvider(model: string): AIProvider {
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("gpt")) return "openai";
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("deepseek")) return "deepseek";
  return "gemini";
}

function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini");
}

/** Gemini 2.5 thinking tokens consume output budget — disable for doc generation. */
function buildGeminiGenerationConfig(
  maxTokens: number,
  temperature: number
): Record<string, unknown> {
  return {
    maxOutputTokens: maxTokens,
    temperature,
    thinkingConfig: { thinkingBudget: 0 },
  };
}

// ─── Streaming Generators ───────────────────────────────────────────────────

async function streamGemini(
  prompt: string,
  model: string,
  maxTokens: number,
  temperature: number,
  onChunk: (text: string) => void
): Promise<string | null> {
  const ai = getGemini();
  const config = buildGeminiGenerationConfig(maxTokens, temperature);
  const stream = await ai.models.generateContentStream({
    model,
    contents: prompt,
    config,
  });

  let finishReason: string | null = null;
  for await (const chunk of stream) {
    if (chunk.text) onChunk(chunk.text);
    const reason = chunk.candidates?.[0]?.finishReason;
    if (reason) finishReason = reason;
  }
  return finishReason;
}

async function streamOpenAI(
  client: OpenAI,
  prompt: string,
  model: string,
  maxTokens: number,
  temperature: number,
  onChunk: (text: string) => void
): Promise<string | null> {
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature,
    stream: true,
  });

  let finishReason: string | null = null;
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) onChunk(text);
    if (chunk.choices[0]?.finish_reason) {
      finishReason = chunk.choices[0].finish_reason;
    }
  }
  return finishReason;
}

async function streamAnthropic(
  prompt: string,
  model: string,
  maxTokens: number,
  temperature: number,
  onChunk: (text: string) => void
): Promise<string | null> {
  const client = getAnthropic();
  const stream = client.messages.stream({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature,
  });

  let finishReason: string | null = null;
  stream.on("finalMessage", (message) => {
    if (message.stop_reason) finishReason = message.stop_reason;
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      onChunk(event.delta.text);
    }
  }
  return finishReason;
}

async function runStream(
  prompt: string,
  config: GenerationConfig,
  onChunk: (text: string) => void
): Promise<string | null> {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const model = merged.model!;
  const provider = merged.provider ?? resolveProvider(model);
  const maxTokens = merged.maxOutputTokens!;
  const temperature = merged.temperature!;

  switch (provider) {
    case "gemini":
      return streamGemini(prompt, model, maxTokens, temperature, onChunk);
    case "openai":
      return streamOpenAI(
        getOpenAI(),
        prompt,
        model,
        maxTokens,
        temperature,
        onChunk
      );
    case "deepseek":
      return streamOpenAI(
        getDeepSeek(),
        prompt,
        model,
        maxTokens,
        temperature,
        onChunk
      );
    case "anthropic":
      return streamAnthropic(prompt, model, maxTokens, temperature, onChunk);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/** Stream chunks and return finishReason when complete. */
async function* streamWithFinishReason(
  prompt: string,
  config: GenerationConfig
): AsyncGenerator<string, string | null, undefined> {
  const queue: string[] = [];
  let resolveWait: (() => void) | null = null;
  let done = false;
  let streamError: unknown = null;
  let finishReason: string | null = null;

  const notify = () => {
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  };

  const streamPromise = runStream(prompt, config, (text) => {
    queue.push(text);
    notify();
  })
    .then((reason) => {
      finishReason = reason;
      done = true;
      notify();
    })
    .catch((err) => {
      streamError = err;
      done = true;
      notify();
    });

  while (!done || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
      if (streamError) throw streamError;
      continue;
    }
    yield queue.shift()!;
  }

  await streamPromise;
  if (streamError) throw streamError;
  return finishReason;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function* generateStream(
  prompt: string,
  config: GenerationConfig = {}
): AsyncGenerator<string> {
  for await (const chunk of streamWithFinishReason(prompt, config)) {
    yield chunk;
  }
}

/**
 * Generate with finish-reason tracking. Used by orchestrator for truncation detection.
 */
export async function generateWithMeta(
  prompt: string,
  config: GenerationConfig = {},
  onChunk?: (chunk: string) => void
): Promise<GenerationResult> {
  let content = "";
  const finishReason = await runStream(prompt, config, (text) => {
    content += text;
    onChunk?.(text);
  });
  return { content, finishReason };
}

export async function generate(
  prompt: string,
  config: GenerationConfig = {}
): Promise<string> {
  const result = await generateWithMeta(prompt, config);
  return result.content;
}

export { isGeminiModel, resolveProvider, streamWithFinishReason };
