import assert from "node:assert/strict";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

const lambdaPath = new URL("../backend/lambda/generate-post-text.mjs", import.meta.url);

function snapshotGlobals() {
  return {
    env: { ...process.env },
    fetch: globalThis.fetch,
    ddbSend: DynamoDBClient.prototype.send,
    bedrockSend: BedrockRuntimeClient.prototype.send
  };
}

function restoreGlobals(snapshot) {
  process.env = snapshot.env;
  globalThis.fetch = snapshot.fetch;
  DynamoDBClient.prototype.send = snapshot.ddbSend;
  BedrockRuntimeClient.prototype.send = snapshot.bedrockSend;
}

async function freshHandler(env = {}) {
  process.env = { ...process.env, ...env };
  const mod = await import(`${lambdaPath.href}?t=${Date.now()}-${Math.random()}`);
  return mod.handler;
}

function eventOf(body, sourceIp = "203.0.113.10") {
  return {
    requestContext: {
      http: {
        method: "POST",
        sourceIp
      }
    },
    body: JSON.stringify(body)
  };
}

function optionsEvent() {
  return {
    requestContext: {
      http: {
        method: "OPTIONS",
        sourceIp: "203.0.113.10"
      }
    },
    body: ""
  };
}

async function runCase(name, fn, results) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

async function main() {
  const results = [];

  await runCase("OPTIONSは204を返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "live", AI_PROVIDER: "bedrock" });
      const res = await handler(optionsEvent());
      assert.equal(res.statusCode, 204);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("JSON不正時にinvalid_jsonでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "live", AI_PROVIDER: "bedrock" });
      const res = await handler({ body: "{invalid-json", requestContext: { http: { method: "POST", sourceIp: "1.1.1.1" } } });
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "invalid_json");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("画像未指定時にimage_missingでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "live", AI_PROVIDER: "bedrock" });
      const res = await handler(eventOf({ fishType: "ブリ" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "image_missing");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("provider未対応値はprovider_not_supported", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "live", AI_PROVIDER: "invalid" });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "provider_not_supported");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("testモードは固定文を返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "test",
        TEST_MODE_FIXED_TEXT: "固定テキスト",
        AI_PROVIDER: "bedrock"
      });
      const res = await handler(eventOf({ fishType: "ブリ" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.generatedText, "固定テキスト");
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.mode, "test");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("レート制限超過で429", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "",
        RATE_LIMIT_WINDOW_MS: "60000",
        RATE_LIMIT_MAX_REQUESTS: "1"
      });
      const ev = eventOf({ fishType: "サワラ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }, "198.51.100.20");
      const first = await handler(ev);
      const second = await handler(ev);
      assert.equal(first.statusCode, 200);
      const secondBody = JSON.parse(second.body);
      assert.equal(second.statusCode, 429);
      assert.equal(secondBody.errorMessage, "rate_limited");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("DynamoDB日次上限超過で429", async () => {
    const snapshot = snapshotGlobals();
    try {
      DynamoDBClient.prototype.send = async () => {
        const err = new Error("limit");
        err.name = "ConditionalCheckFailedException";
        throw err;
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_TABLE_NAME: "dummy-table",
        DAILY_LIMIT_MAX_PER_DAY: "1"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 429);
      assert.equal(body.errorMessage, "daily_limit_exceeded");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("DynamoDB異常時もLambdaは落ちずdaily_limit_check_failed", async () => {
    const snapshot = snapshotGlobals();
    try {
      DynamoDBClient.prototype.send = async () => {
        throw new Error("ddb_down");
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_TABLE_NAME: "dummy-table",
        DAILY_LIMIT_MAX_PER_DAY: "5"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "daily_limit_check_failed");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("OpenAIキー未設定時はopenai_key_missing", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: ""
      });
      const res = await handler(eventOf({ fishType: "ノドグロ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "openai_key_missing");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("OpenAI HTTPエラーをopenai_http_XXXで返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      globalThis.fetch = async () => ({ ok: false, status: 503 });
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "dummy-key"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "openai_http_503");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("OpenAI空応答はempty_generation", async () => {
    const snapshot = snapshotGlobals();
    try {
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ output: [] }) });
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "dummy-key"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "empty_generation");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("OpenAI fetch例外時もフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      globalThis.fetch = async () => {
        throw new Error("network_down");
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "dummy-key"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "network_down");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("Bedrock異常応答(テキストなし)はempty_generation", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({ output: { message: { content: [{ image: {} }] } } });
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        BEDROCK_REGION: "us-east-1"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "empty_generation");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("Bedrock例外時もフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => {
        throw new Error("bedrock_throttled");
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        BEDROCK_REGION: "us-east-1"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.errorMessage, "bedrock_throttled");
      assert.equal(body.fallbackUsed, true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("Bedrock正常応答時はlive_bedrock", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: { message: { content: [{ text: "本日のブリは脂がのっていて、海の季節を感じる一皿でした。#変わる海を味わう" }] } }
      });
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        BEDROCK_REGION: "us-east-1"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.mode, "live_bedrock");
      assert.match(body.generatedText, /ブリ|海/);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} - ${r.name}`);
    if (!r.ok) {
      console.error(r.error);
    }
  }

  console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
