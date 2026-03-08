import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const AI_PROVIDER = String(process.env.AI_PROVIDER || "bedrock").toLowerCase();
const POST_TEXT_MODE = String(process.env.POST_TEXT_MODE || "live").toLowerCase();
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const TEST_MODE_FIXED_TEXT =
  process.env.TEST_MODE_FIXED_TEXT || "テストモードです。今日は魚の旬を楽しみました。#変わる海を味わう";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || "120");

const BEDROCK_REGION = process.env.BEDROCK_REGION || "us-east-1";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
const BEDROCK_MAX_OUTPUT_TOKENS = Number(process.env.BEDROCK_MAX_OUTPUT_TOKENS || "120");

const DEFAULT_RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || "60000");
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || "8");

const DAILY_LIMIT_TABLE_NAME = process.env.DAILY_LIMIT_TABLE_NAME || "";
const DAILY_LIMIT_MAX_PER_DAY = Number(process.env.DAILY_LIMIT_MAX_PER_DAY || "0");

const ddbClient = DAILY_LIMIT_TABLE_NAME ? new DynamoDBClient({}) : null;
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });

const rateLimitStore = new Map();

function logInfo(event, extra = {}) {
  console.log(JSON.stringify({ level: "info", event, ...extra }));
}

function logError(event, error, extra = {}) {
  const e = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      level: "error",
      event,
      errorName: e.name,
      errorMessage: e.message,
      stack: e.stack?.split("\n").slice(0, 3).join(" | "),
      ...extra
    })
  );
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function fallbackText(fishType) {
  const safeFishType = String(fishType || "").trim() || "魚料理";
  return `今日の一皿は${safeFishType}。\nこの海の旬を味わいました。\n#変わる海を味わう`;
}

function checkRateLimit(clientKey) {
  const now = Date.now();
  const cutoff = now - DEFAULT_RATE_LIMIT_WINDOW_MS;
  const history = rateLimitStore.get(clientKey) || [];
  const recent = history.filter((ts) => ts >= cutoff);
  if (recent.length >= DEFAULT_RATE_LIMIT_MAX_REQUESTS) {
    rateLimitStore.set(clientKey, recent);
    return false;
  }
  recent.push(now);
  rateLimitStore.set(clientKey, recent);
  return true;
}

function getJstDayKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function getEpochSecondsAfterDays(days) {
  return Math.floor((Date.now() + days * 24 * 60 * 60 * 1000) / 1000);
}

async function incrementDailyCounterOrReject(dayKey) {
  if (!ddbClient || !DAILY_LIMIT_TABLE_NAME || DAILY_LIMIT_MAX_PER_DAY <= 0) {
    return { allowed: true, count: null };
  }

  try {
    const result = await ddbClient.send(
      new UpdateItemCommand({
        TableName: DAILY_LIMIT_TABLE_NAME,
        Key: { pk: { S: dayKey } },
        UpdateExpression: "SET #cnt = if_not_exists(#cnt, :zero) + :inc, #ttl = :ttl",
        ConditionExpression: "attribute_not_exists(#cnt) OR #cnt < :limit",
        ExpressionAttributeNames: { "#cnt": "count", "#ttl": "expiresAt" },
        ExpressionAttributeValues: {
          ":zero": { N: "0" },
          ":inc": { N: "1" },
          ":limit": { N: String(DAILY_LIMIT_MAX_PER_DAY) },
          ":ttl": { N: String(getEpochSecondsAfterDays(3)) }
        },
        ReturnValues: "UPDATED_NEW"
      })
    );
    return { allowed: true, count: Number(result?.Attributes?.count?.N ?? "0") };
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      return { allowed: false, count: null };
    }
    throw error;
  }
}

function buildPrompt(fishType, tone) {
  return [
    "あなたは石川県の魚の魅力を伝える案内人です。",
    "入力画像は料理写真です。",
    `魚種は「${fishType}」として扱ってください。`,
    `トーン: ${tone || "friendly"}`,
    "日本語で、X向け短文を1案のみ出力してください。",
    "100〜140文字程度にしてください。",
    "親しみやすく、観光客向けに読める表現にしてください。",
    "誇張表現は避けてください。",
    "画像から断定できない店名・場所・食べ方などは書かないでください。",
    "ハッシュタグは最大2個まで。",
    "出力は本文のみ。説明文は不要です。"
  ].join("\n");
}

function extractOpenAiText(jsonResponse) {
  if (typeof jsonResponse?.output_text === "string" && jsonResponse.output_text.trim()) {
    return jsonResponse.output_text.trim();
  }
  if (!Array.isArray(jsonResponse?.output)) return "";
  for (const item of jsonResponse.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return "";
}

function extractBedrockText(response) {
  const content = response?.output?.message?.content;
  if (!Array.isArray(content)) return "";
  for (const part of content) {
    if (typeof part?.text === "string" && part.text.trim()) {
      return part.text.trim();
    }
  }
  return "";
}

function toBedrockImageFormat(mimeType) {
  const lower = String(mimeType || "").toLowerCase();
  if (lower.includes("png")) return "png";
  return "jpeg";
}

async function generateViaOpenAi({ prompt, imageBase64, mimeType }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("openai_key_missing");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}`, detail: "low" }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`openai_http_${response.status}`);
  }

  const openAiJson = await response.json();
  return extractOpenAiText(openAiJson);
}

async function generateViaBedrock({ prompt, imageBase64, mimeType }) {
  const imageBytes = Buffer.from(imageBase64, "base64");
  const imageFormat = toBedrockImageFormat(mimeType);

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [
            { text: prompt },
            {
              image: {
                format: imageFormat,
                source: { bytes: imageBytes }
              }
            }
          ]
        }
      ],
      inferenceConfig: {
        maxTokens: BEDROCK_MAX_OUTPUT_TOKENS,
        temperature: 0.4,
        topP: 0.9
      }
    })
  );

  return extractBedrockText(response);
}

export const handler = async (event) => {
  if (event?.requestContext?.http?.method === "OPTIONS" || event?.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  const startedAt = Date.now();
  const requestId = event?.requestContext?.requestId || "unknown";
  const clientKey =
    event?.requestContext?.http?.sourceIp ||
    event?.requestContext?.identity?.sourceIp ||
    event?.headers?.["x-forwarded-for"] ||
    "unknown";

  let fishTypeForFallback = "魚料理";

  try {
    let body;
    try {
      body = typeof event?.body === "string" ? JSON.parse(event.body) : event?.body || {};
    } catch (parseError) {
      logError("invalid_request_body", parseError, { requestId });
      return json(200, {
        generatedText: fallbackText(fishTypeForFallback),
        fallbackUsed: true,
        errorMessage: "invalid_json"
      });
    }

    const imageBase64 = String(body.imageBase64 || "");
    const mimeType = String(body.mimeType || "image/jpeg");
    const fishType = String(body.fishType || "").trim() || "魚料理";
    const tone = String(body.tone || "friendly");
    fishTypeForFallback = fishType;

    logInfo("generate_post_text_start", {
      requestId,
      postTextMode: POST_TEXT_MODE,
      aiProvider: AI_PROVIDER,
      hasImage: Boolean(imageBase64),
      mimeType,
      fishType,
      dailyLimitEnabled: Boolean(DAILY_LIMIT_TABLE_NAME && DAILY_LIMIT_MAX_PER_DAY > 0),
      bedrockRegion: BEDROCK_REGION
    });

    if (POST_TEXT_MODE === "test") {
      return json(200, {
        generatedText: TEST_MODE_FIXED_TEXT,
        fallbackUsed: false,
        errorMessage: null,
        mode: "test"
      });
    }

    if (!checkRateLimit(clientKey)) {
      return json(429, { generatedText: fallbackText(fishType), fallbackUsed: true, errorMessage: "rate_limited" });
    }

    let dailyResult;
    try {
      const dayKey = getJstDayKey();
      dailyResult = await incrementDailyCounterOrReject(dayKey);
    } catch (dailyError) {
      logError("daily_limit_check_failed", dailyError, { requestId, dailyTable: DAILY_LIMIT_TABLE_NAME });
      return json(200, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: "daily_limit_check_failed"
      });
    }

    if (!dailyResult.allowed) {
      return json(429, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: "daily_limit_exceeded"
      });
    }

    if (!imageBase64) {
      return json(200, { generatedText: fallbackText(fishType), fallbackUsed: true, errorMessage: "image_missing" });
    }

    const prompt = buildPrompt(fishType, tone);
    const provider = AI_PROVIDER === "openai" ? "openai" : AI_PROVIDER === "bedrock" ? "bedrock" : "unsupported";

    if (provider === "unsupported") {
      return json(200, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: "provider_not_supported"
      });
    }

    let generatedText = "";
    try {
      if (provider === "openai") {
        generatedText = await generateViaOpenAi({ prompt, imageBase64, mimeType });
      } else {
        generatedText = await generateViaBedrock({ prompt, imageBase64, mimeType });
      }
    } catch (providerError) {
      const message = providerError instanceof Error ? providerError.message : "provider_error";
      logError("provider_generation_failed", providerError, { requestId, provider });
      return json(200, { generatedText: fallbackText(fishType), fallbackUsed: true, errorMessage: message });
    }

    if (!generatedText) {
      return json(200, { generatedText: fallbackText(fishType), fallbackUsed: true, errorMessage: "empty_generation" });
    }

    return json(200, {
      generatedText,
      fallbackUsed: false,
      errorMessage: null,
      mode: `live_${provider}`
    });
  } catch (error) {
    logError("handler_unexpected_error", error, { requestId, aiProvider: AI_PROVIDER, postTextMode: POST_TEXT_MODE });
    return json(200, { generatedText: fallbackText(fishTypeForFallback), fallbackUsed: true, errorMessage: "server_error" });
  } finally {
    const elapsedMs = Date.now() - startedAt;
    logInfo("generate_post_text_end", { requestId, elapsedMs, aiProvider: AI_PROVIDER, bedrockRegion: BEDROCK_REGION });
  }
};
