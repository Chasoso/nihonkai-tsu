import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
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
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME || "";

const ddbClient = DAILY_LIMIT_TABLE_NAME || METRICS_TABLE_NAME ? new DynamoDBClient({}) : null;
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });

const rateLimitStore = new Map();
const METRIC_TYPES = new Set(["copy", "x_click"]);

const DEFAULT_FISH_CANDIDATES = [
  { id: "maiwashi", label: "マイワシ", score: 0.82 },
  { id: "saba", label: "サバ", score: 0.61 },
  { id: "aji", label: "アジ", score: 0.47 }
];

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

function fallbackPostOptions(fishType) {
  const safeFishType = String(fishType || "").trim() || "魚料理";
  return [
    { type: "short", text: `今日の一皿は${safeFishType}。#変わる海を味わう` },
    { type: "standard", text: fallbackText(safeFishType) },
    {
      type: "pr",
      text: `石川の海の旬、今日は${safeFishType}を味わいました。旅先の食の発見としてもおすすめです。\n#変わる海を味わう`
    }
  ];
}

function fallbackFishCandidates() {
  return [...DEFAULT_FISH_CANDIDATES, { id: "other", label: "それ以外", score: 0 }];
}

function parseTask(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "legacy_generate_post_text";
  if (raw === "generate_post_text" || raw === "estimate_fish_candidates" || raw === "track_metric") {
    return raw;
  }
  return "legacy_generate_post_text";
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

function normalizeScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
}

function sanitizeFishCandidateId(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w-]/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "unknown";
}

function sanitizeGeneratedText(input, maxLen = 160) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\r\n/g, "\n");
  return normalized.length > maxLen ? normalized.slice(0, maxLen).trim() : normalized;
}

function extractJsonCandidate(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const directTry = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  if (directTry) return directTry;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeFishCandidates(rawCandidates) {
  const list = Array.isArray(rawCandidates) ? rawCandidates : [];
  const unique = [];
  const seen = new Set();

  for (const item of list) {
    const id = sanitizeFishCandidateId(item?.id || item?.label);
    if (!id || id === "other" || seen.has(id)) continue;
    const label = String(item?.label || "").trim() || id;
    const score = normalizeScore(item?.score);
    unique.push({ id, label, score });
    seen.add(id);
  }

  unique.sort((a, b) => b.score - a.score);
  const top = unique.slice(0, 3);

  for (const fallback of DEFAULT_FISH_CANDIDATES) {
    if (top.length >= 3) break;
    if (seen.has(fallback.id)) continue;
    top.push(fallback);
    seen.add(fallback.id);
  }

  while (top.length < 3) {
    top.push({ id: `candidate_${top.length + 1}`, label: `候補${top.length + 1}`, score: 0.1 });
  }

  return [...top, { id: "other", label: "それ以外", score: 0 }];
}

function parseFishCandidatesFromText(rawText) {
  const parsed = extractJsonCandidate(rawText);
  if (!parsed) return null;
  const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : Array.isArray(parsed) ? parsed : null;
  if (!rawCandidates) return null;
  return normalizeFishCandidates(rawCandidates);
}

function normalizePostOptions(rawOptions, fishType) {
  const safeFishType = String(fishType || "").trim() || "魚料理";
  const fallback = fallbackPostOptions(safeFishType);
  const input = Array.isArray(rawOptions) ? rawOptions : [];

  const byType = new Map();
  for (const item of input) {
    const type = String(item?.type || "").trim().toLowerCase();
    if (!["short", "standard", "pr"].includes(type)) continue;
    const text = sanitizeGeneratedText(item?.text, type === "short" ? 120 : 180);
    if (!text) continue;
    byType.set(type, text);
  }

  return fallback.map((item) => ({
    type: item.type,
    text: byType.get(item.type) || item.text
  }));
}

function parsePostOptionsFromText(rawText, fishType) {
  const parsed = extractJsonCandidate(rawText);
  if (!parsed) return null;

  if (Array.isArray(parsed?.options)) {
    return normalizePostOptions(parsed.options, fishType);
  }

  if (typeof parsed?.short === "string" || typeof parsed?.standard === "string" || typeof parsed?.pr === "string") {
    return normalizePostOptions(
      [
        { type: "short", text: parsed.short },
        { type: "standard", text: parsed.standard },
        { type: "pr", text: parsed.pr }
      ],
      fishType
    );
  }

  return null;
}

function optionsFromSingleText(text, fishType) {
  const base = sanitizeGeneratedText(text, 180);
  if (!base) return fallbackPostOptions(fishType);
  return normalizePostOptions(
    [
      { type: "short", text: base.slice(0, 70).trim() },
      { type: "standard", text: base },
      { type: "pr", text: `${base}\n石川の海の旬を、次の一皿で。` }
    ],
    fishType
  );
}

function buildLegacyPrompt(fishType, tone) {
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

function buildThreeOptionPrompt(fishType, tone) {
  return [
    "あなたは石川県の魚の魅力を伝える案内人です。",
    "入力画像は料理写真です。",
    `魚種は「${fishType}」として扱ってください。`,
    `トーン: ${tone || "friendly"}`,
    "X投稿向けの本文を3案作ってください。",
    "形式は必ずJSONのみ。説明文禁止。",
    'JSON形式: {"options":[{"type":"short","text":"..."},{"type":"standard","text":"..."},{"type":"pr","text":"..."}]}',
    "short: 45〜80文字",
    "standard: 90〜140文字",
    "pr: 110〜170文字。観光客向けの訴求を入れる",
    "画像から断定できない店名・場所・食べ方は書かない。",
    "ハッシュタグは各案2個まで。"
  ].join("\n");
}

function buildFishCandidatePrompt() {
  const list = DEFAULT_FISH_CANDIDATES.map((item) => `${item.id}:${item.label}`).join(", ");
  return [
    "あなたは魚料理写真から魚種候補を推定するアシスタントです。",
    `候補は次のID/ラベルを優先して使ってください: ${list}`,
    "画像だけから判断し、断定は避けてください。",
    "上位3候補をJSONで返してください。",
    "形式は必ずJSONのみ。説明文禁止。",
    'JSON形式: {"candidates":[{"id":"maiwashi","label":"マイワシ","score":0.82},{"id":"saba","label":"サバ","score":0.61},{"id":"aji","label":"アジ","score":0.47}]}',
    "scoreは0〜1の小数。高い順に並べる。"
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

function resolveProvider() {
  if (AI_PROVIDER === "openai") return "openai";
  if (AI_PROVIDER === "bedrock") return "bedrock";
  return "unsupported";
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

async function generateByProvider({ provider, prompt, imageBase64, mimeType }) {
  if (provider === "openai") {
    return generateViaOpenAi({ prompt, imageBase64, mimeType });
  }
  return generateViaBedrock({ prompt, imageBase64, mimeType });
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

async function saveMetricEvent({
  metricType,
  fishId,
  timestampIso,
  dateJst,
  fishLabel,
  selectedVariant,
  sessionId
}) {
  if (!ddbClient || !METRICS_TABLE_NAME) {
    return { stored: false };
  }

  const item = {
    fish_id: { S: fishId },
    timestamp: { S: timestampIso },
    metric_type: { S: metricType },
    date_jst: { S: dateJst }
  };

  if (fishLabel) {
    item.fish_label = { S: fishLabel };
  }
  if (selectedVariant) {
    item.selected_variant = { S: selectedVariant };
  }
  if (sessionId) {
    item.session_id = { S: sessionId };
  }

  await ddbClient.send(
    new PutItemCommand({
      TableName: METRICS_TABLE_NAME,
      Item: item
    })
  );

  return { stored: true };
}

async function guardAiInvocation({ clientKey, requestId, fishType, fallbackBodyFactory }) {
  if (!checkRateLimit(clientKey)) {
    return { blocked: true, response: json(429, fallbackBodyFactory("rate_limited")) };
  }

  try {
    const dayKey = getJstDayKey();
    const dailyResult = await incrementDailyCounterOrReject(dayKey);
    if (!dailyResult.allowed) {
      return { blocked: true, response: json(429, fallbackBodyFactory("daily_limit_exceeded")) };
    }
  } catch (dailyError) {
    logError("daily_limit_check_failed", dailyError, { requestId, dailyTable: DAILY_LIMIT_TABLE_NAME });
    return { blocked: true, response: json(200, fallbackBodyFactory("daily_limit_check_failed")) };
  }

  return { blocked: false, response: null, fishType };
}

function buildLegacyFallbackBody(fishType, reason) {
  return {
    generatedText: fallbackText(fishType),
    fallbackUsed: true,
    errorMessage: reason
  };
}

function buildOptionFallbackBody(fishType, reason) {
  const options = fallbackPostOptions(fishType);
  return {
    options,
    generatedText: options.find((item) => item.type === "standard")?.text || options[0].text,
    fallbackUsed: true,
    errorMessage: reason
  };
}

function buildCandidateFallbackBody(reason) {
  return {
    candidates: fallbackFishCandidates(),
    fallbackUsed: true,
    errorMessage: reason
  };
}

async function handleLegacyGeneratePostText({ requestId, clientKey, body }) {
  const imageBase64 = String(body.imageBase64 || "");
  const mimeType = String(body.mimeType || "image/jpeg");
  const fishType = String(body.fishType || "").trim() || "魚料理";
  const tone = String(body.tone || "friendly");

  if (POST_TEXT_MODE === "test") {
    return json(200, {
      generatedText: TEST_MODE_FIXED_TEXT,
      fallbackUsed: false,
      errorMessage: null,
      mode: "test"
    });
  }

  const guard = await guardAiInvocation({
    clientKey,
    requestId,
    fishType,
    fallbackBodyFactory: (reason) => buildLegacyFallbackBody(fishType, reason)
  });
  if (guard.blocked) return guard.response;

  if (!imageBase64) {
    return json(200, buildLegacyFallbackBody(fishType, "image_missing"));
  }

  const provider = resolveProvider();
  if (provider === "unsupported") {
    return json(200, buildLegacyFallbackBody(fishType, "provider_not_supported"));
  }

  const prompt = buildLegacyPrompt(fishType, tone);
  let generatedText = "";
  try {
    generatedText = await generateByProvider({ provider, prompt, imageBase64, mimeType });
  } catch (providerError) {
    const message = providerError instanceof Error ? providerError.message : "provider_error";
    logError("provider_generation_failed", providerError, { requestId, provider });
    return json(200, buildLegacyFallbackBody(fishType, message));
  }

  generatedText = sanitizeGeneratedText(generatedText, 160);
  if (!generatedText) {
    return json(200, buildLegacyFallbackBody(fishType, "empty_generation"));
  }

  return json(200, {
    generatedText,
    fallbackUsed: false,
    errorMessage: null,
    mode: `live_${provider}`
  });
}

async function handleGeneratePostTextTask({ requestId, clientKey, body }) {
  const imageBase64 = String(body.imageBase64 || "");
  const mimeType = String(body.mimeType || "image/jpeg");
  const fishType = String(body.fishType || "").trim() || "魚料理";
  const tone = String(body.tone || "friendly");

  if (POST_TEXT_MODE === "test") {
    const options = optionsFromSingleText(TEST_MODE_FIXED_TEXT, fishType);
    return json(200, {
      options,
      generatedText: options.find((item) => item.type === "standard")?.text || TEST_MODE_FIXED_TEXT,
      fallbackUsed: false,
      errorMessage: null,
      mode: "test"
    });
  }

  const guard = await guardAiInvocation({
    clientKey,
    requestId,
    fishType,
    fallbackBodyFactory: (reason) => buildOptionFallbackBody(fishType, reason)
  });
  if (guard.blocked) return guard.response;

  if (!imageBase64) {
    return json(200, buildOptionFallbackBody(fishType, "image_missing"));
  }

  const provider = resolveProvider();
  if (provider === "unsupported") {
    return json(200, buildOptionFallbackBody(fishType, "provider_not_supported"));
  }

  const prompt = buildThreeOptionPrompt(fishType, tone);
  let rawText = "";
  try {
    rawText = await generateByProvider({ provider, prompt, imageBase64, mimeType });
  } catch (providerError) {
    const message = providerError instanceof Error ? providerError.message : "provider_error";
    logError("provider_generation_failed", providerError, { requestId, provider });
    return json(200, buildOptionFallbackBody(fishType, message));
  }

  if (!sanitizeGeneratedText(rawText, 180)) {
    return json(200, buildOptionFallbackBody(fishType, "empty_generation"));
  }

  const parsed = parsePostOptionsFromText(rawText, fishType);
  const options = parsed || optionsFromSingleText(rawText, fishType);
  const standard = options.find((item) => item.type === "standard")?.text || options[0].text;

  return json(200, {
    options,
    generatedText: standard,
    fallbackUsed: false,
    errorMessage: null,
    mode: `live_${provider}`
  });
}

async function handleEstimateFishCandidatesTask({ requestId, clientKey, body }) {
  const imageBase64 = String(body.imageBase64 || "");
  const mimeType = String(body.mimeType || "image/jpeg");

  if (POST_TEXT_MODE === "test") {
    return json(200, {
      candidates: fallbackFishCandidates(),
      fallbackUsed: false,
      errorMessage: null,
      mode: "test"
    });
  }

  const guard = await guardAiInvocation({
    clientKey,
    requestId,
    fishType: "魚料理",
    fallbackBodyFactory: (reason) => buildCandidateFallbackBody(reason)
  });
  if (guard.blocked) return guard.response;

  if (!imageBase64) {
    return json(200, buildCandidateFallbackBody("image_missing"));
  }

  const provider = resolveProvider();
  if (provider === "unsupported") {
    return json(200, buildCandidateFallbackBody("provider_not_supported"));
  }

  const prompt = buildFishCandidatePrompt();
  let rawText = "";
  try {
    rawText = await generateByProvider({ provider, prompt, imageBase64, mimeType });
  } catch (providerError) {
    const message = providerError instanceof Error ? providerError.message : "provider_error";
    logError("provider_estimate_failed", providerError, { requestId, provider });
    return json(200, buildCandidateFallbackBody(message));
  }

  if (!sanitizeGeneratedText(rawText, 600)) {
    return json(200, buildCandidateFallbackBody("empty_generation"));
  }

  const parsed = parseFishCandidatesFromText(rawText);
  if (!parsed) {
    return json(200, buildCandidateFallbackBody("invalid_candidate_response"));
  }

  return json(200, {
    candidates: parsed,
    fallbackUsed: false,
    errorMessage: null,
    mode: `live_${provider}`
  });
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

async function handleTrackMetricTask({ requestId, body }) {
  const metricType = String(body.metric_type || "").trim();
  const fishId = String(body.fish_id || "").trim().toLowerCase();
  const fishLabel = String(body.fish_label || "").trim();
  const selectedVariant = String(body.selected_variant || "").trim().toLowerCase();
  const sessionId = String(body.session_id || "").trim();
  const timestamp = new Date().toISOString();
  const dateJst = getJstDayKey(new Date());

  if (!METRIC_TYPES.has(metricType) || !fishId) {
    return json(200, { status: "ignored" });
  }

  try {
    const saved = await saveMetricEvent({
      metricType,
      fishId,
      timestampIso: timestamp,
      dateJst,
      fishLabel,
      selectedVariant,
      sessionId
    });
    if (!saved.stored) {
      return json(200, { status: "ignored" });
    }
    return json(200, { status: "ok" });
  } catch (error) {
    logError("track_metric_failed", error, { requestId, metricType, fishId });
    return json(200, { status: "ignored" });
  }
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

  try {
    let body;
    try {
      body = typeof event?.body === "string" ? JSON.parse(event.body) : event?.body || {};
    } catch (parseError) {
      logError("invalid_request_body", parseError, { requestId });
      return json(200, {
        generatedText: fallbackText("魚料理"),
        fallbackUsed: true,
        errorMessage: "invalid_json"
      });
    }

    const task = parseTask(body.task);
    const imageBase64 = String(body.imageBase64 || "");
    const mimeType = String(body.mimeType || "image/jpeg");
    const fishType = String(body.fishType || "").trim() || "魚料理";

    logInfo("api_task_start", {
      requestId,
      task,
      postTextMode: POST_TEXT_MODE,
      aiProvider: AI_PROVIDER,
      hasImage: Boolean(imageBase64),
      mimeType,
      fishType,
      dailyLimitEnabled: Boolean(DAILY_LIMIT_TABLE_NAME && DAILY_LIMIT_MAX_PER_DAY > 0),
      metricsTableEnabled: Boolean(METRICS_TABLE_NAME),
      bedrockRegion: BEDROCK_REGION
    });

    if (task === "track_metric") {
      return await handleTrackMetricTask({ requestId, body });
    }
    if (task === "estimate_fish_candidates") {
      return await handleEstimateFishCandidatesTask({ requestId, clientKey, body });
    }
    if (task === "generate_post_text") {
      return await handleGeneratePostTextTask({ requestId, clientKey, body });
    }
    return await handleLegacyGeneratePostText({ requestId, clientKey, body });
  } catch (error) {
    logError("handler_unexpected_error", error, { requestId, aiProvider: AI_PROVIDER, postTextMode: POST_TEXT_MODE });
    return json(200, { generatedText: fallbackText("魚料理"), fallbackUsed: true, errorMessage: "server_error" });
  } finally {
    const elapsedMs = Date.now() - startedAt;
    logInfo("api_task_end", { requestId, elapsedMs, aiProvider: AI_PROVIDER, bedrockRegion: BEDROCK_REGION });
  }
};
