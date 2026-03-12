import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const AI_PROVIDER = String(process.env.AI_PROVIDER || "bedrock").toLowerCase();
const POST_TEXT_MODE = String(process.env.POST_TEXT_MODE || "live").toLowerCase();
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const TEST_MODE_FIXED_TEXT =
  process.env.TEST_MODE_FIXED_TEXT || "テストモードです。今日は魚料理をおいしく味わいました。#変わる海を味わう";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || "512");

const BEDROCK_REGION = process.env.BEDROCK_REGION || "us-east-1";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
const BEDROCK_MAX_OUTPUT_TOKENS = Number(process.env.BEDROCK_MAX_OUTPUT_TOKENS || "512");

const DEFAULT_RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || "60000");
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || "8");

const DAILY_LIMIT_TABLE_NAME = process.env.DAILY_LIMIT_TABLE_NAME || "";
const DAILY_LIMIT_MAX_PER_DAY = Number(process.env.DAILY_LIMIT_MAX_PER_DAY || "0");
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME || "";
const METRICS_DAILY_TABLE_NAME = process.env.METRICS_DAILY_TABLE_NAME || "";
const METRICS_FISH_DAILY_TABLE_NAME = process.env.METRICS_FISH_DAILY_TABLE_NAME || "";

const ddbClient =
  DAILY_LIMIT_TABLE_NAME || METRICS_TABLE_NAME || METRICS_DAILY_TABLE_NAME || METRICS_FISH_DAILY_TABLE_NAME
    ? new DynamoDBClient({})
    : null;
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

const rateLimitStore = new Map();
const METRIC_TYPES = new Set(["copy", "x_click"]);

const FISH_MASTER = (() => {
  try {
    const raw = readFileSync(join(MODULE_DIR, "fish-master.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        fish_id: String(item?.fish_id || "").trim(),
        label: String(item?.label || "").trim()
      }))
      .filter((item) => item.fish_id && item.label);
  } catch {
    return [];
  }
})();
const FISH_MASTER_BY_ID = new Map(FISH_MASTER.map((item) => [item.fish_id.toLowerCase(), item]));
const FISH_MASTER_ID_BY_LABEL = new Map(FISH_MASTER.map((item) => [item.label, item.fish_id.toLowerCase()]));
const DEFAULT_FISH_CANDIDATES = FISH_MASTER.slice(0, 3).map((item, index) => ({
  fish_id: item.fish_id.toLowerCase(),
  score: normalizeScore(0.82 - index * 0.18)
}));

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
  return [...DEFAULT_FISH_CANDIDATES, { fish_id: "other", score: 0 }];
}

function parseTask(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "legacy_generate_post_text";
  if (
    raw === "generate_post_text" ||
    raw === "estimate_fish_candidates" ||
    raw === "track_metric" ||
    raw === "get_metrics_summary" ||
    raw === "get_dashboard_metrics"
  ) {
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

function getJstDayKeyWithOffset(offsetDays, baseDate = new Date()) {
  return getJstDayKey(new Date(baseDate.getTime() + offsetDays * 24 * 60 * 60 * 1000));
}

function getJstDayRangeIso(dateJst) {
  const normalized = String(dateJst || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const today = getJstDayKey(new Date());
    return getJstDayRangeIso(today);
  }
  const start = new Date(`${normalized}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function normalizeDateJst(value, fallback) {
  const normalized = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return fallback;
}

function enumerateDateJstRange(dateFrom, dateTo) {
  const start = new Date(`${dateFrom}T00:00:00+09:00`);
  const end = new Date(`${dateTo}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
    return [];
  }

  const dates = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
    dates.push(getJstDayKey(cursor));
  }
  return dates;
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
  return String(value || "").trim().toLowerCase();
}

function sanitizeGeneratedText(input, maxLen = 160) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\r\n/g, "\n");
  return normalized.length > maxLen ? normalized.slice(0, maxLen).trim() : normalized;
}

function stripMarkdownCodeFence(input) {
  const text = String(input || "").trim();
  if (!text) return "";
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonCandidate(rawText) {
  const text = stripMarkdownCodeFence(rawText);
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
    const rawId =
      typeof item === "object" && item !== null
        ? item?.fish_id || item?.id || FISH_MASTER_ID_BY_LABEL.get(String(item?.label || "").trim())
        : item;
    const id = sanitizeFishCandidateId(rawId);
    if (!id || id === "other" || seen.has(id) || !FISH_MASTER_BY_ID.has(id)) continue;
    const score = normalizeScore(item?.score);
    unique.push({ fish_id: id, score });
    seen.add(id);
  }

  unique.sort((a, b) => b.score - a.score);
  const top = unique.slice(0, 3);

  for (const fallback of DEFAULT_FISH_CANDIDATES) {
    if (top.length >= 3) break;
    if (seen.has(fallback.fish_id)) continue;
    top.push(fallback);
    seen.add(fallback.fish_id);
  }

  while (top.length < 3) {
    const fallback = FISH_MASTER[top.length];
    if (!fallback) break;
    const fallbackId = fallback.fish_id.toLowerCase();
    if (seen.has(fallbackId)) break;
    top.push({ fish_id: fallbackId, score: 0.1 });
    seen.add(fallbackId);
  }

  return [...top.slice(0, 3), { fish_id: "other", score: 0 }];
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

function looksLikeJsonPayload(rawText) {
  const text = stripMarkdownCodeFence(rawText);
  if (!text) return false;
  return text.startsWith("{") || text.startsWith("[") || text.includes('"options"');
}

function summarizeOptionPayload(rawText) {
  const original = String(rawText || "").trim();
  const text = stripMarkdownCodeFence(rawText);
  return {
    rawLength: original.length,
    preview: sanitizeGeneratedText(original, 200),
    strippedLength: text.length,
    hadCodeFence: original.startsWith("```"),
    looksLikeJson: looksLikeJsonPayload(text),
    startsWithBrace: text.startsWith("{"),
    startsWithBracket: text.startsWith("["),
    hasOptionsKey: text.includes('"options"'),
    endsWithBrace: text.endsWith("}"),
    endsWithBracket: text.endsWith("]")
  };
}

function isMalformedOptionPayload(rawText, parsedOptions) {
  return !parsedOptions && looksLikeJsonPayload(rawText);
}

function optionsFromSingleText(text, fishType) {
  const base = sanitizeGeneratedText(text, 180);
  if (!base) return fallbackPostOptions(fishType);
  return normalizePostOptions(
    [
      { type: "short", text: base.slice(0, 70).trim() },
      { type: "standard", text: base },
      { type: "pr", text: `${base}\n石川の海の旬を伝える一皿です。` }
    ],
    fishType
  );
}

function buildLegacyPrompt(fishType, tone) {
  return [
    "あなたは魚料理の写真を見て、SNS向けの短い投稿文を作る編集者です。",
    "入力画像と魚種を踏まえて、日本語で自然な文章を1本だけ作成してください。",
    `魚種は「${fishType}」です。`,
    `トーン: ${tone || "friendly"}`,
    "日本語で、読みやすい投稿文を1本だけ出力してください。",
    "100〜140文字程度にしてください。",
    "食べた印象や旬らしさが伝わる表現を入れてください。",
    "誇張表現は避けてください。",
    "画像から断定できない調理法や産地は書かないでください。",
    "ハッシュタグは最大2つまでです。",
    "出力は本文のみです。説明やJSONは不要です。"
  ].join("\n");
}

function buildThreeOptionPrompt(fishType, tone) {
  return [
    "あなたは魚料理の写真を見て、X向け投稿文を3案作る編集者です。",
    "入力画像と魚種を踏まえて、日本語で3種類の投稿文を作成してください。",
    `魚種は「${fishType}」です。`,
    `トーン: ${tone || "friendly"}`,
    "X投稿向けの本文を3種類返してください。",
    "出力は必ずJSONのみ、説明文は禁止です。",
    "Markdownのコードフェンスは絶対に付けないでください。",
    "先頭文字は {、末尾文字は } にしてください。",
    "JSONは1行のminified JSONで返してください。",
    'JSON形式: {"options":[{"type":"short","text":"..."},{"type":"standard","text":"..."},{"type":"pr","text":"..."}]}',
    "short: 45〜70文字",
    "standard: 90〜140文字",
    "pr: 110〜170文字で、地域PR要素を少し入れる",
    "画像から断定できない調理法や産地は書かないでください。",
    "ハッシュタグは各案2つまでです。"
  ].join("\n");
}

function buildFishCandidatePrompt() {
  const list = FISH_MASTER.map((item) => `- ${item.fish_id}: ${item.label}`).join("\n");
  return [
    "You classify the fish in the uploaded photo.",
    "You MUST choose only from the fish master list below.",
    "Do not invent new fish names or ids.",
    "Return strict JSON only.",
    'Return format: {"candidates":[{"fish_id":"brand_5400","score":0.78},{"fish_id":"brand_36600","score":0.55},{"fish_id":"brand_23500","score":0.41},{"fish_id":"other","score":0.0}]}',
    "Rules:",
    "- choose exactly 3 fish_id values from the fish master",
    "- sort by confidence descending",
    "- use fish_id only in output",
    "- the 4th candidate must be other with score 0.0",
    `Fish master:\n${list}`
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

function getMetricCountField(metricType) {
  return metricType === "x_click" ? "x_click_count" : "copy_count";
}

async function incrementDailyMetrics(dateJst, metricType, timestampIso) {
  if (!ddbClient || !METRICS_DAILY_TABLE_NAME) {
    return { stored: false };
  }

  const metricCountField = getMetricCountField(metricType);

  await ddbClient.send(
    new UpdateItemCommand({
      TableName: METRICS_DAILY_TABLE_NAME,
      Key: {
        date_jst: { S: dateJst }
      },
      UpdateExpression:
        "SET total_count = if_not_exists(total_count, :zero) + :inc, #metricCount = if_not_exists(#metricCount, :zero) + :inc, updated_at = :updatedAt",
      ExpressionAttributeNames: {
        "#metricCount": metricCountField
      },
      ExpressionAttributeValues: {
        ":zero": { N: "0" },
        ":inc": { N: "1" },
        ":updatedAt": { S: timestampIso }
      }
    })
  );

  return { stored: true };
}

async function incrementFishDailyMetrics(dateJst, fishId, fishLabel, metricType, timestampIso) {
  if (!ddbClient || !METRICS_FISH_DAILY_TABLE_NAME) {
    return { stored: false };
  }

  const metricCountField = getMetricCountField(metricType);
  const ExpressionAttributeValues = {
    ":zero": { N: "0" },
    ":inc": { N: "1" },
    ":updatedAt": { S: timestampIso }
  };
  let UpdateExpression =
    "SET total_count = if_not_exists(total_count, :zero) + :inc, #metricCount = if_not_exists(#metricCount, :zero) + :inc, updated_at = :updatedAt";

  if (fishLabel) {
    UpdateExpression += ", fish_label = :fishLabel";
    ExpressionAttributeValues[":fishLabel"] = { S: fishLabel };
  }

  await ddbClient.send(
    new UpdateItemCommand({
      TableName: METRICS_FISH_DAILY_TABLE_NAME,
      Key: {
        date_jst: { S: dateJst },
        fish_id: { S: fishId }
      },
      UpdateExpression,
      ExpressionAttributeNames: {
        "#metricCount": metricCountField
      },
      ExpressionAttributeValues
    })
  );

  return { stored: true };
}

async function queryAllCount(input) {
  if (!ddbClient || !METRICS_TABLE_NAME) return 0;
  let total = 0;
  let ExclusiveStartKey;
  do {
    const response = await ddbClient.send(
      new QueryCommand({
        ...input,
        TableName: METRICS_TABLE_NAME,
        Select: "COUNT",
        ExclusiveStartKey
      })
    );
    total += Number(response.Count || 0);
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return total;
}

async function queryAllItems(input) {
  if (!ddbClient || !METRICS_TABLE_NAME) return [];
  const items = [];
  let ExclusiveStartKey;
  do {
    const response = await ddbClient.send(
      new QueryCommand({
        ...input,
        TableName: METRICS_TABLE_NAME,
        ExclusiveStartKey
      })
    );
    if (Array.isArray(response.Items)) {
      items.push(...response.Items);
    }
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function queryTableItems(tableName, input) {
  if (!ddbClient || !tableName) return [];
  const items = [];
  let ExclusiveStartKey;
  do {
    const response = await ddbClient.send(
      new QueryCommand({
        ...input,
        TableName: tableName,
        ExclusiveStartKey
      })
    );
    if (Array.isArray(response.Items)) {
      items.push(...response.Items);
    }
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getDailyMetricRows(dateFrom, dateTo) {
  if (!ddbClient || !METRICS_DAILY_TABLE_NAME) return [];
  const rows = [];
  for (const dateJst of enumerateDateJstRange(dateFrom, dateTo)) {
    const items = await queryTableItems(METRICS_DAILY_TABLE_NAME, {
      KeyConditionExpression: "date_jst = :dateJst",
      ExpressionAttributeValues: {
        ":dateJst": { S: dateJst }
      }
    });
    rows.push(...items);
  }
  return rows;
}

async function getFishDailyMetricRows(dateFrom, dateTo) {
  if (!ddbClient || !METRICS_FISH_DAILY_TABLE_NAME) return [];
  const rows = [];
  for (const dateJst of enumerateDateJstRange(dateFrom, dateTo)) {
    const items = await queryTableItems(METRICS_FISH_DAILY_TABLE_NAME, {
      KeyConditionExpression: "date_jst = :dateJst",
      ExpressionAttributeValues: {
        ":dateJst": { S: dateJst }
      }
    });
    rows.push(...items);
  }
  return rows;
}

async function getFishCountsFromRawMetrics(dateFrom, dateTo) {
  if (!ddbClient || !METRICS_TABLE_NAME) return [];

  const aggregate = new Map();
  for (const dateJst of enumerateDateJstRange(dateFrom, dateTo)) {
    const items = await queryAllItems({
      IndexName: "GSI1",
      KeyConditionExpression: "date_jst = :dateJst",
      ExpressionAttributeValues: {
        ":dateJst": { S: dateJst }
      },
      ProjectionExpression: "fish_id, fish_label"
    });

    for (const item of items) {
      const fishId = String(item?.fish_id?.S || "").trim().toLowerCase();
      if (!fishId) continue;
      const fishLabel = String(item?.fish_label?.S || "").trim() || fishId;
      const current = aggregate.get(fishId) || {
        fish_id: fishId,
        fish_label: fishLabel,
        count: 0
      };
      current.count += 1;
      if (fishLabel) current.fish_label = fishLabel;
      aggregate.set(fishId, current);
    }
  }

  return Array.from(aggregate.values());
}

function parseCountAttribute(value) {
  const count = Number(value?.N || 0);
  return Number.isFinite(count) ? count : 0;
}

async function getTotalTodayCount(dateJst) {
  return await queryAllCount({
    IndexName: "GSI1",
    KeyConditionExpression: "date_jst = :dateJst",
    ExpressionAttributeValues: {
      ":dateJst": { S: dateJst }
    }
  });
}

async function getFishTodayCount(fishId, dateJst) {
  if (!fishId) return null;
  const { startIso, endIso } = getJstDayRangeIso(dateJst);
  return await queryAllCount({
    KeyConditionExpression: "fish_id = :fishId AND #ts BETWEEN :startIso AND :endIso",
    ExpressionAttributeNames: {
      "#ts": "timestamp"
    },
    ExpressionAttributeValues: {
      ":fishId": { S: fishId },
      ":startIso": { S: startIso },
      ":endIso": { S: endIso }
    }
  });
}

async function getTopFishThisWeek(baseDate = new Date()) {
  const aggregate = new Map();
  for (let i = 0; i < 7; i += 1) {
    const dateJst = getJstDayKeyWithOffset(-i, baseDate);
    const items = await queryAllItems({
      IndexName: "GSI1",
      KeyConditionExpression: "date_jst = :dateJst",
      ExpressionAttributeValues: {
        ":dateJst": { S: dateJst }
      },
      ProjectionExpression: "fish_id, fish_label"
    });

    for (const item of items) {
      const fishId = item?.fish_id?.S;
      if (!fishId) continue;
      const fishLabel = item?.fish_label?.S || fishId;
      const current = aggregate.get(fishId) || { fish_id: fishId, fish_label: fishLabel, count: 0 };
      current.count += 1;
      if (!current.fish_label && fishLabel) {
        current.fish_label = fishLabel;
      }
      aggregate.set(fishId, current);
    }
  }

  let top = null;
  for (const value of aggregate.values()) {
    if (!top || value.count > top.count) {
      top = value;
    }
  }
  return top;
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
  const fishType = String(body.fishType || "").trim() || "???";
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
  const fishType = String(body.fishType || "").trim() || "???";
  const tone = String(body.tone || "friendly");
  const target = String(body.target || "").trim().toLowerCase() || "unknown";
  const outputLanguage = String(body.outputLanguage || "").trim().toLowerCase() || "unknown";

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
  if (isMalformedOptionPayload(rawText, parsed)) {
    logError("invalid_option_response", new Error("invalid_option_response"), {
      requestId,
      provider,
      fishType,
      tone,
      target,
      outputLanguage,
      ...summarizeOptionPayload(rawText)
    });
    return json(200, buildOptionFallbackBody(fishType, "invalid_option_response"));
  }

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
    await incrementDailyMetrics(dateJst, metricType, timestamp);
    await incrementFishDailyMetrics(dateJst, fishId, fishLabel, metricType, timestamp);
    return json(200, { status: "ok" });
  } catch (error) {
    logError("track_metric_failed", error, { requestId, metricType, fishId });
    return json(200, { status: "ignored" });
  }
}

async function handleGetMetricsSummaryTask({ requestId, body }) {
  const fishId = String(body.fish_id || "").trim().toLowerCase();
  const now = new Date();
  const dateJst = getJstDayKey(now);

  if (!ddbClient || !METRICS_TABLE_NAME) {
    return json(200, {
      total_today: 0,
      current_order: 0,
      top_fish_this_week: null,
      fish_count_today: fishId ? 0 : null
    });
  }

  try {
    const totalToday = await getTotalTodayCount(dateJst);
    const fishCountToday = fishId ? await getFishTodayCount(fishId, dateJst) : null;
    const topFishThisWeek = await getTopFishThisWeek(now);

    return json(200, {
      total_today: totalToday,
      current_order: totalToday,
      top_fish_this_week: topFishThisWeek,
      fish_count_today: fishCountToday
    });
  } catch (error) {
    logError("get_metrics_summary_failed", error, { requestId, fishId, dateJst });
    return json(200, {
      total_today: 0,
      current_order: 0,
      top_fish_this_week: null,
      fish_count_today: fishId ? 0 : null
    });
  }
}

async function handleGetDashboardMetricsTask({ requestId, body }) {
  const now = new Date();
  const todayJst = getJstDayKey(now);
  const defaultDateTo = todayJst;
  const defaultDateFrom = getJstDayKeyWithOffset(-6, now);
  const dateFrom = normalizeDateJst(body.date_from, defaultDateFrom);
  const dateTo = normalizeDateJst(body.date_to, defaultDateTo);
  const range = enumerateDateJstRange(dateFrom, dateTo);
  const weekDateFrom = getJstDayKeyWithOffset(-6, now);

  if (!ddbClient || !METRICS_DAILY_TABLE_NAME || range.length === 0) {
    return json(200, {
      total: 0,
      today: 0,
      this_week: 0,
      daily_counts: [],
      fish_counts: [],
      top_fish: null
    });
  }

  try {
    const [dailyRows, weekRows, fishRows] = await Promise.all([
      getDailyMetricRows(dateFrom, dateTo),
      getDailyMetricRows(weekDateFrom, todayJst),
      METRICS_FISH_DAILY_TABLE_NAME ? getFishDailyMetricRows(dateFrom, dateTo) : Promise.resolve([])
    ]);

    const dailyCountsMap = new Map();
    for (const row of dailyRows) {
      const dateJst = row?.date_jst?.S;
      if (!dateJst) continue;
      dailyCountsMap.set(dateJst, parseCountAttribute(row?.total_count));
    }

    const daily_counts = range.map((dateJst) => ({
      date_jst: dateJst,
      count: dailyCountsMap.get(dateJst) || 0
    }));

    const total = daily_counts.reduce((sum, item) => sum + item.count, 0);
    const today = dailyCountsMap.get(todayJst) || 0;
    const this_week = weekRows.reduce((sum, row) => sum + parseCountAttribute(row?.total_count), 0);

    const fishCountsMap = new Map();
    const effectiveFishRows =
      fishRows.length > 0 ? fishRows.map((row) => ({ source: "aggregated", row })) : (await getFishCountsFromRawMetrics(dateFrom, dateTo)).map((row) => ({ source: "raw", row }));

    for (const item of effectiveFishRows) {
      if (item.source === "raw") {
        const fishId = String(item.row?.fish_id || "").trim().toLowerCase();
        if (!fishId) continue;
        const count = Number(item.row?.count || 0);
        const fishLabel = String(item.row?.fish_label || "").trim();
        const current = fishCountsMap.get(fishId) || {
          fish_id: fishId,
          fish_label: fishLabel || fishId,
          count: 0
        };
        current.count += count;
        if (fishLabel) current.fish_label = fishLabel;
        fishCountsMap.set(fishId, current);
        continue;
      }

      const row = item.row;
      const fishId = String(row?.fish_id?.S || "").trim().toLowerCase();
      if (!fishId) continue;
      const count = parseCountAttribute(row?.total_count);
      const fishLabel = String(row?.fish_label?.S || "").trim();
      const current = fishCountsMap.get(fishId) || {
        fish_id: fishId,
        fish_label: fishLabel || fishId,
        count: 0
      };
      current.count += count;
      if (fishLabel) current.fish_label = fishLabel;
      fishCountsMap.set(fishId, current);
    }

    const fish_counts = Array.from(fishCountsMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.fish_id.localeCompare(b.fish_id);
    });

    return json(200, {
      total,
      today,
      this_week,
      daily_counts,
      fish_counts,
      top_fish: fish_counts[0] || null
    });
  } catch (error) {
    logError("get_dashboard_metrics_failed", error, { requestId, dateFrom, dateTo, todayJst });
    return json(200, {
      total: 0,
      today: 0,
      this_week: 0,
      daily_counts: [],
      fish_counts: [],
      top_fish: null
    });
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
    if (task === "get_metrics_summary") {
      return await handleGetMetricsSummaryTask({ requestId, body });
    }
    if (task === "get_dashboard_metrics") {
      return await handleGetDashboardMetricsTask({ requestId, body });
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


