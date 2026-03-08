import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || "120");
const DEFAULT_RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || "60000");
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || "8");
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const POST_TEXT_MODE = String(process.env.POST_TEXT_MODE || "live").toLowerCase();
const TEST_MODE_FIXED_TEXT =
  process.env.TEST_MODE_FIXED_TEXT || "テストモード: 今日は魚料理を楽しみました。#変わる海を味わう";
const DAILY_LIMIT_TABLE_NAME = process.env.DAILY_LIMIT_TABLE_NAME || "";
const DAILY_LIMIT_MAX_PER_DAY = Number(process.env.DAILY_LIMIT_MAX_PER_DAY || "0");

const ddbClient = DAILY_LIMIT_TABLE_NAME ? new DynamoDBClient({}) : null;

const rateLimitStore = new Map();

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
        Key: {
          pk: { S: dayKey }
        },
        UpdateExpression: "SET #cnt = if_not_exists(#cnt, :zero) + :inc, #ttl = :ttl",
        ConditionExpression: "attribute_not_exists(#cnt) OR #cnt < :limit",
        ExpressionAttributeNames: {
          "#cnt": "count",
          "#ttl": "expiresAt"
        },
        ExpressionAttributeValues: {
          ":zero": { N: "0" },
          ":inc": { N: "1" },
          ":limit": { N: String(DAILY_LIMIT_MAX_PER_DAY) },
          ":ttl": { N: String(getEpochSecondsAfterDays(3)) }
        },
        ReturnValues: "UPDATED_NEW"
      })
    );
    return {
      allowed: true,
      count: Number(result?.Attributes?.count?.N ?? "0")
    };
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      return { allowed: false, count: null };
    }
    throw error;
  }
}

function extractOutputText(jsonResponse) {
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

function buildPrompt(fishType, tone) {
  return [
    "あなたは石川県の魚の魅力を伝える案内人です。",
    "入力画像は料理写真です。",
    `魚種は「${fishType}」です。魚種はこの値を優先して使ってください。`,
    `文体トーン: ${tone || "friendly"}`,
    "日本語で、X向け投稿文を1案だけ作成してください。",
    "100〜140文字程度。",
    "親しみやすく、観光客にも読みやすい表現。",
    "誇張しない。",
    "画像から断定できない店名・場所・食べ方は書かない。",
    "ハッシュタグは最大2個。",
    "出力は本文のみ。説明文は不要。"
  ].join("\n");
}

export const handler = async (event) => {
  if (event?.requestContext?.http?.method === "OPTIONS" || event?.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  const startedAt = Date.now();
  const clientKey =
    event?.requestContext?.http?.sourceIp ||
    event?.requestContext?.identity?.sourceIp ||
    event?.headers?.["x-forwarded-for"] ||
    "unknown";

  try {
    const body = typeof event?.body === "string" ? JSON.parse(event.body) : event?.body || {};
    const imageBase64 = String(body.imageBase64 || "");
    const mimeType = String(body.mimeType || "image/jpeg");
    const fishType = String(body.fishType || "").trim() || "魚料理";
    const tone = String(body.tone || "friendly");

    if (!checkRateLimit(clientKey)) {
      return json(429, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: "rate_limited"
      });
    }

    const dayKey = getJstDayKey();
    const dailyResult = await incrementDailyCounterOrReject(dayKey);
    if (!dailyResult.allowed) {
      return json(429, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: "daily_limit_exceeded"
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(200, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: "server_key_missing"
      });
    }

    if (POST_TEXT_MODE === "test") {
      return json(200, {
        generatedText: TEST_MODE_FIXED_TEXT,
        fallbackUsed: false,
        errorMessage: null,
        mode: "test"
      });
    }

    if (!imageBase64) {
      return json(200, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: "image_missing"
      });
    }

    const prompt = buildPrompt(fishType, tone);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt
              },
              {
                type: "input_image",
                image_url: `data:${mimeType};base64,${imageBase64}`,
                detail: "low"
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      return json(200, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: `openai_http_${response.status}`
      });
    }

    const openAiJson = await response.json();
    const generatedText = extractOutputText(openAiJson);
    if (!generatedText) {
      return json(200, {
        generatedText: fallbackText(fishType),
        fallbackUsed: true,
        errorMessage: "empty_generation"
      });
    }

    return json(200, {
      generatedText,
      fallbackUsed: false,
      errorMessage: null,
      mode: "live"
    });
  } catch {
    return json(200, {
      generatedText: fallbackText("魚料理"),
      fallbackUsed: true,
      errorMessage: "server_error"
    });
  } finally {
    const elapsedMs = Date.now() - startedAt;
    console.log(
      JSON.stringify({
        event: "generate_post_text",
        elapsedMs
      })
    );
  }
};
