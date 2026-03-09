export type PostTextOptionType = "short" | "standard" | "pr";

export interface PostTextOption {
  type: PostTextOptionType;
  text: string;
}

export interface AiInputImagePayload {
  imageBase64: string;
  mimeType: string;
  imageHash: string;
  width: number;
  height: number;
}

export interface GeneratePostTextParams {
  apiUrl: string;
  image: AiInputImagePayload | null;
  fishType: string;
  tone: string;
  enabled: boolean;
  cacheTtlMs: number;
}

export interface GeneratePostTextResult {
  text: string;
  options: PostTextOption[];
  fallbackUsed: boolean;
  errorMessage: string | null;
}

interface CacheEntry {
  value: GeneratePostTextResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const OPTION_ORDER: PostTextOptionType[] = ["short", "standard", "pr"];

export function getFallbackPostText(fishType: string): string {
  const safeFishType = fishType.trim() || "fish";
  return `Today's dish: ${safeFishType}\nEnjoyed local seasonal seafood.\n#nihonkaitsu`;
}

function buildFallbackOptions(fishType: string): PostTextOption[] {
  const safeFishType = fishType.trim() || "fish";
  return [
    { type: "short", text: `Today's dish: ${safeFishType}. #nihonkaitsu` },
    { type: "standard", text: getFallbackPostText(safeFishType) },
    {
      type: "pr",
      text: `I enjoyed ${safeFishType} from local seasonal waters today.\nDiscover seafood while you travel.\n#nihonkaitsu`
    }
  ];
}

function buildCacheKey(imageHash: string, fishType: string, tone: string): string {
  return `${imageHash}::${fishType.trim()}::${tone.trim()}`;
}

function sanitizeGeneratedText(input: string, maxLen = 180): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\r\n/g, "\n");
  return normalized.length > maxLen ? normalized.slice(0, maxLen).trim() : normalized;
}

function normalizeOptions(raw: unknown, fishType: string): PostTextOption[] {
  const fallback = buildFallbackOptions(fishType);
  if (!Array.isArray(raw)) return fallback;

  const byType = new Map<PostTextOptionType, string>();
  raw.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const type = (item as { type?: unknown }).type;
    const text = (item as { text?: unknown }).text;
    if ((type !== "short" && type !== "standard" && type !== "pr") || typeof text !== "string") return;
    const sanitized = sanitizeGeneratedText(text, type === "short" ? 120 : 220);
    if (!sanitized) return;
    byType.set(type, sanitized);
  });

  return OPTION_ORDER.map((type) => ({
    type,
    text: byType.get(type) ?? fallback.find((opt) => opt.type === type)!.text
  }));
}

function buildFallbackResult(fishType: string, reason: string | null): GeneratePostTextResult {
  const options = buildFallbackOptions(fishType);
  const standard = options.find((opt) => opt.type === "standard")?.text ?? options[0].text;
  return {
    text: standard,
    options,
    fallbackUsed: true,
    errorMessage: reason
  };
}

export async function generatePostText({
  apiUrl,
  image,
  fishType,
  tone,
  enabled,
  cacheTtlMs
}: GeneratePostTextParams): Promise<GeneratePostTextResult> {
  const safeFishType = fishType.trim() || "fish";
  if (!fishType.trim()) {
    return buildFallbackResult(safeFishType, "fish_type_missing");
  }
  if (!enabled) {
    return buildFallbackResult(safeFishType, "ai_disabled");
  }
  if (!apiUrl.trim()) {
    return buildFallbackResult(safeFishType, "api_url_missing");
  }
  if (!image) {
    return buildFallbackResult(safeFishType, "image_missing");
  }

  const now = Date.now();
  const cacheKey = buildCacheKey(image.imageHash, safeFishType, tone);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "generate_post_text",
        imageBase64: image.imageBase64,
        mimeType: image.mimeType,
        fishType: safeFishType,
        tone,
        target: "x",
        outputLanguage: "ja"
      })
    });

    if (!response.ok) {
      return buildFallbackResult(safeFishType, `http_${response.status}`);
    }

    const json = (await response.json()) as {
      options?: unknown;
      generatedText?: string;
      fallbackUsed?: boolean;
      errorMessage?: string;
    };

    const options = normalizeOptions(json.options, safeFishType);
    const standard = options.find((opt) => opt.type === "standard")?.text ?? sanitizeGeneratedText(json.generatedText ?? "");
    if (!standard) {
      return buildFallbackResult(safeFishType, json.errorMessage ?? "empty_response");
    }

    const result: GeneratePostTextResult = {
      text: standard,
      options,
      fallbackUsed: Boolean(json.fallbackUsed),
      errorMessage: json.errorMessage ?? null
    };

    cache.set(cacheKey, {
      value: result,
      expiresAt: now + Math.max(1_000, cacheTtlMs)
    });
    return result;
  } catch {
    return buildFallbackResult(safeFishType, "network_error");
  }
}
