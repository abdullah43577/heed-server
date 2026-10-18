import type { z } from "zod";
import { AiUnavailableError } from "./errors";
import { getEnv } from "./get-env";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 4096;

// OpenRouter free ids churn month to month; when every one 404s, suspect this list first.
const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const OPENROUTER_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-26b-a4b-it:free",
  "openrouter/free",
];

type Provider = "groq" | "openrouter";

interface Attempt {
  name: string;
  provider: Provider;
  url: string;
  apiKey: string;
  model: string;
}

export type ReasoningEffort = "low" | "medium" | "high";

interface CompletionOptions {
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  signal?: AbortSignal;
}

export interface GenerateJsonOptions<T> extends CompletionOptions {
  schema: z.ZodType<T>;
}

export interface StreamTextOptions extends CompletionOptions {
  onChunk: (chunk: string) => void;
}

const buildAttempts = function (): Attempt[] {
  const groqKey = getEnv("GROQ_API_KEY")?.trim();
  const openRouterKey = getEnv("OPENROUTER_API_KEY")?.trim();
  const attempts: Attempt[] = [];

  if (groqKey) {
    for (const model of GROQ_MODELS) {
      attempts.push({ name: `groq:${model}`, provider: "groq", url: GROQ_URL, apiKey: groqKey, model });
    }
  }

  if (openRouterKey) {
    for (const model of OPENROUTER_MODELS) {
      attempts.push({ name: `openrouter:${model}`, provider: "openrouter", url: OPENROUTER_URL, apiKey: openRouterKey, model });
    }
  }

  return attempts;
};

const buildRequest = function (attempt: Attempt, options: CompletionOptions, extra: { stream: boolean; jsonMode: boolean }) {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  const body: Record<string, unknown> = {
    model: attempt.model,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.prompt },
    ],
    temperature: options.temperature ?? 0.2,
    stream: extra.stream,
  };

  if (attempt.provider === "groq") {
    // gpt-oss spends completion tokens on reasoning before it answers, so the
    // cap has to leave room for both or the answer arrives empty.
    body.reasoning_effort = options.reasoningEffort ?? "medium";
    body.include_reasoning = false;
    body.max_completion_tokens = maxTokens;
    // OpenRouter's free models do not reliably honour json_object; the schema
    // check catches whatever they send instead.
    if (extra.jsonMode) body.response_format = { type: "json_object" };
  } else {
    body.max_tokens = maxTokens;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${attempt.apiKey}`,
    "Content-Type": "application/json",
    ...(attempt.provider === "openrouter" && { "X-Title": "Heed" }),
  };

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  return { method: "POST", headers, body: JSON.stringify(body), signal };
};

// Ignores a `reasoning` field on purpose: falling back to it would return the model's scratch work.
const messageText = function (message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(part => (typeof part === "string" ? part : ((part as { text?: string })?.text ?? ""))).join("");
  }
  return "";
};

const extractJson = function (raw: string): string {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
};

const describe = function (error: unknown) {
  return error instanceof Error ? error.message : String(error);
};

const isCallerAbort = function (options: CompletionOptions) {
  return options.signal?.aborted === true;
};

const attemptJson = async function <T>(attempt: Attempt, options: GenerateJsonOptions<T>): Promise<T> {
  const response = await fetch(attempt.url, buildRequest(attempt, options, { stream: false, jsonMode: true }));
  if (!response.ok) throw new Error(`responded ${response.status}`);

  const data = (await response.json()) as { choices?: { message?: unknown }[] };
  const text = extractJson(messageText(data.choices?.[0]?.message));
  if (!text) throw new Error("returned an empty response");

  const parsed = options.schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`failed the schema: ${parsed.error.issues[0]?.message ?? "invalid shape"}`);

  return parsed.data;
};

export const generateJson = async function <T>(options: GenerateJsonOptions<T>): Promise<{ result: T; model: string }> {
  const attempts = buildAttempts();
  if (!attempts.length) throw new AiUnavailableError();

  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      return { result: await attemptJson(attempt, options), model: attempt.model };
    } catch (error) {
      if (isCallerAbort(options)) throw error;
      failures.push(`${attempt.name}: ${describe(error)}`);
    }
  }

  console.error("[ai] all providers failed:", failures.join(" | "));
  throw new AiUnavailableError();
};

class StreamInterruptedError extends Error {}

const attemptStream = async function (attempt: Attempt, options: StreamTextOptions): Promise<string> {
  const response = await fetch(attempt.url, buildRequest(attempt, options, { stream: true, jsonMode: false }));
  if (!response.ok || !response.body) throw new Error(`responded ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const fail = function (message: string): never {
    // Once a chunk has reached the client, falling back would splice a second
    // model's answer onto the first one's half.
    throw full ? new StreamInterruptedError(message) : new Error(message);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        // Lines starting with ":" are keep-alive comments OpenRouter sends while it queues.
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return full || fail("returned an empty response");

        const event = JSON.parse(payload) as {
          error?: { message?: string };
          choices?: { delta?: { content?: unknown } }[];
        };

        if (event.error) fail(`stream error: ${event.error.message ?? "unknown"}`);

        const chunk = messageText(event.choices?.[0]?.delta);
        if (chunk) {
          full += chunk;
          options.onChunk(chunk);
        }
      }
    }
  } catch (error) {
    if (error instanceof StreamInterruptedError || !full) throw error;
    throw new StreamInterruptedError(describe(error));
  } finally {
    reader.cancel().catch(() => {});
  }

  return full || fail("returned an empty response");
};

export const streamText = async function (options: StreamTextOptions): Promise<{ text: string; model: string }> {
  const attempts = buildAttempts();
  if (!attempts.length) throw new AiUnavailableError();

  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      return { text: await attemptStream(attempt, options), model: attempt.model };
    } catch (error) {
      if (isCallerAbort(options)) throw error;

      if (error instanceof StreamInterruptedError) {
        console.error(`[ai] ${attempt.name} failed mid-stream:`, error.message);
        throw new AiUnavailableError("The response was interrupted. Please try again.");
      }

      failures.push(`${attempt.name}: ${describe(error)}`);
    }
  }

  console.error("[ai] all providers failed:", failures.join(" | "));
  throw new AiUnavailableError();
};
