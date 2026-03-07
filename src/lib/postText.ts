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
  fallbackUsed: boolean;
  errorMessage: string | null;
}

interface CacheEntry {
  value: GeneratePostTextResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getFallbackPostText(fishType: string): string {
  const safeFishType = fishType?.trim() || "魚料理";
  return `今日の一皿は${safeFishType}。\nこの海の旬を味わいました。\n#変わる海を味わう`;
}

function buildCacheKey(imageHash: string, fishType: string, tone: string): string {
  return `${imageHash}::${fishType.trim()}::${tone.trim()}`;
}

function sanitizeGeneratedText(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\r\n/g, "\n");
  return normalized.length > 160 ? normalized.slice(0, 160).trim() : normalized;
}

function buildFallbackResult(fishType: string, reason: string | null): GeneratePostTextResult {
  return {
    text: getFallbackPostText(fishType),
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
  if (!fishType.trim()) {
    return buildFallbackResult("魚料理", "fish_type_missing");
  }

  if (!enabled) {
    return buildFallbackResult(fishType, "ai_disabled");
  }

  if (!apiUrl.trim()) {
    return buildFallbackResult(fishType, "api_url_missing");
  }

  if (!image) {
    return buildFallbackResult(fishType, "image_missing");
  }

  const now = Date.now();
  const cacheKey = buildCacheKey(image.imageHash, fishType, tone);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: image.imageBase64,
        mimeType: image.mimeType,
        fishType,
        tone,
        target: "x",
        outputLanguage: "ja"
      })
    });

    if (!response.ok) {
      return buildFallbackResult(fishType, `http_${response.status}`);
    }

    const json = (await response.json()) as {
      generatedText?: string;
      fallbackUsed?: boolean;
      errorMessage?: string;
    };

    const generatedText = sanitizeGeneratedText(json.generatedText ?? "");
    if (!generatedText) {
      return buildFallbackResult(fishType, json.errorMessage ?? "empty_response");
    }

    const result: GeneratePostTextResult = {
      text: generatedText,
      fallbackUsed: Boolean(json.fallbackUsed),
      errorMessage: json.errorMessage ?? null
    };

    cache.set(cacheKey, {
      value: result,
      expiresAt: now + Math.max(1_000, cacheTtlMs)
    });
    return result;
  } catch {
    return buildFallbackResult(fishType, "network_error");
  }
}
