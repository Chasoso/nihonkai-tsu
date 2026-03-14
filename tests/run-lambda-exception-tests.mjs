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

  await runCase("未知taskはlegacy_generate_post_textとして扱う", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "test", AI_PROVIDER: "bedrock" });
      const res = await handler(
        eventOf({ task: "unknown_task", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.generatedText, "テストモードです。今日は魚料理をおいしく味わいました。#変わる海を味わう");
      assert.equal(body.mode, "test");
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

  await runCase("task=generate_post_text は3案を返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "test",
        TEST_MODE_FIXED_TEXT: "固定テキスト",
        AI_PROVIDER: "bedrock"
      });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(Array.isArray(body.options), true);
      assert.equal(body.options.length, 3);
      assert.ok(body.options.some((o) => o.type === "short"));
      assert.ok(body.options.some((o) => o.type === "standard"));
      assert.ok(body.options.some((o) => o.type === "pr"));
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text は画像未指定時にimage_missingでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "live", AI_PROVIDER: "bedrock" });
      const res = await handler(eventOf({ task: "generate_post_text", fishType: "ブリ" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "image_missing");
      assert.equal(Array.isArray(body.options), true);
      assert.equal(body.options.length, 3);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text はprovider未対応値でフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "live", AI_PROVIDER: "invalid" });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "provider_not_supported");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text はレート制限超過で429", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        RATE_LIMIT_WINDOW_MS: "60000",
        RATE_LIMIT_MAX_REQUESTS: "1"
      });
      const ev = eventOf(
        { task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" },
        "198.51.100.40"
      );
      const first = await handler(ev);
      const second = await handler(ev);
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 429);
      assert.equal(JSON.parse(second.body).errorMessage, "rate_limited");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text は壊れたJSON応答時にfallbackを返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text: '{"options":[{"type":"short","text":"石川のブリは絶品！焼き魚にレモンを添えて。#石川グルメ #ブリの魅力'
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "invalid_option_response");
      assert.equal(Array.isArray(body.options), true);
      assert.equal(body.options.length, 3);
      assert.equal(body.options.some((option) => String(option.text || "").startsWith('{"options"')), false);
      assert.equal(String(body.generatedText || "").startsWith('{"options"'), false);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text はproviderが文字列例外でもprovider_errorでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => {
        throw "string_error";
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "provider_error");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text は欠けたoptionsをfallbackで補完する", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  options: [
                    { type: "short", text: "ブリの塩焼き。 #石川グルメ" },
                    { type: "invalid", text: "ignored" },
                    { type: "pr", text: "" }
                  ]
                })
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.options.length, 3);
      assert.equal(body.options[0].text.includes("石川"), true);
      assert.equal(body.options[1].text.includes("魚料理"), true);
      assert.equal(body.options[2].text.includes("魚料理"), true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text は前後に説明文が付いたJSON応答も解析する", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text: [
                  "以下が結果です。",
                  '{"options":[{"type":"short","text":"ブリの塩焼きが香ばしい。 #石川グルメ"},{"type":"standard","text":"ブリの塩焼きは香ばしく、旬のうま味がしっかり感じられました。 #石川グルメ"},{"type":"pr","text":"石川の海の恵みを感じるブリの塩焼き。旅の一皿としても印象に残ります。 #石川グルメ"}]}',
                  "ご確認ください。"
                ].join("\n")
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.errorMessage, null);
      assert.equal(body.options.length, 3);
      assert.equal(body.options[0].type, "short");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text はshort/standard/pr直下JSONも解析する", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text:
                  '{"short":"ブリの煮付けがしみる味。 #石川グルメ","standard":"ブリの煮付けは、やさしい甘みとうま味が広がる一皿でした。 #石川グルメ","pr":"石川の海の旬を感じるブリの煮付け。旅先で味わう楽しみもあります。 #石川グルメ"}'
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.options.length, 3);
      assert.equal(body.options[2].type, "pr");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text はJSONでない本文を3案へ展開する", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text: "ブリの塩焼きが香ばしくて、海の季節を感じるおいしさでした。 #変わる海を味わう"
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.errorMessage, null);
      assert.equal(body.options.length, 3);
      assert.equal(body.options[1].type, "standard");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text は空応答時にempty_generationでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: { message: { content: [{ text: "   " }] } }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "generate_post_text", fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "empty_generation");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text はコードフェンス付きJSON応答を正しく解析する", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text: [
                  "```json",
                  '{"options":[{"type":"short","text":"ブリの照り焼き、ご飯がすすむ一品です！ #和食 #ブリ"},{"type":"standard","text":"ブリの照り焼きは、甘辛いタレがご飯によく合います。さっぱりとした味わいです。 #和食 #ブリ"},{"type":"pr","text":"石川の海の恵み、ブリの照り焼き。旅先でも味わいたい一皿です。 #石川グルメ #ブリ"}]}',
                  "```"
                ].join("\n")
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({
          task: "generate_post_text",
          fishType: "ブリ",
          imageBase64: "aGVsbG8=",
          mimeType: "image/jpeg",
          target: "x",
          outputLanguage: "ja"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.errorMessage, null);
      assert.equal(body.options.length, 3);
      assert.equal(body.options[0].type, "short");
      assert.equal(String(body.options[0].text).includes("```"), false);
      assert.equal(String(body.generatedText).includes("```"), false);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=generate_post_text は別地域のハッシュタグを除去する", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text:
                  '{"options":[{"type":"short","text":"焼き立てのブリの照り焼き、最高です！ #グルメ #海鮮"},{"type":"standard","text":"焼き立てのブリの照り焼きが、ご飯によく合います。サイドの野菜も美味しい！ #和食 #海鮮料理"},{"type":"pr","text":"地元の市場で新鮮なブリを仕入れて作った照り焼き。サイドの野菜も新鮮で、ご飯が進みます！ #和歌山グルメ #海鮮"}]}'
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({
          task: "generate_post_text",
          fishType: "ブリ",
          imageBase64: "aGVsbG8=",
          mimeType: "image/jpeg",
          target: "x",
          outputLanguage: "ja"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.errorMessage, null);
      assert.equal(body.options.length, 3);
      assert.equal(String(body.options[2].text).includes("#和歌山"), false);
      assert.equal(String(body.options[2].text).includes("#海鮮"), true);
      assert.equal(String(body.generatedText || "").includes("#和歌山"), false);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates は画像未指定時にimage_missingでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "live", AI_PROVIDER: "bedrock" });
      const res = await handler(eventOf({ task: "estimate_fish_candidates" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "image_missing");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates はprovider未対応値でフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "live", AI_PROVIDER: "invalid" });
      const res = await handler(
        eventOf({ task: "estimate_fish_candidates", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "provider_not_supported");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates はレート制限超過で429", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        RATE_LIMIT_WINDOW_MS: "60000",
        RATE_LIMIT_MAX_REQUESTS: "1"
      });
      const ev = eventOf(
        { task: "estimate_fish_candidates", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" },
        "198.51.100.41"
      );
      const first = await handler(ev);
      const second = await handler(ev);
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 429);
      assert.equal(JSON.parse(second.body).errorMessage, "rate_limited");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates は壊れた候補応答時にinvalid_candidate_responseでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [{ text: '{"candidates":[{"fish_id":"brand_36600","score":0.9}' }]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "estimate_fish_candidates", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "invalid_candidate_response");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates は配列JSONとid/文字列候補も解釈する", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text: JSON.stringify([
                  { id: "brand_36600", score: 0.8 },
                  "brand_5400",
                  { label: "マイワシ", score: 0.5 },
                  { fish_id: "other", score: 0.1 }
                ])
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "estimate_fish_candidates", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.candidates.length, 4);
      assert.equal(body.candidates[0].fish_id, "brand_36600");
      assert.equal(body.candidates.some((item) => item.fish_id === "brand_5400"), true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates はproviderが文字列例外でもprovider_errorでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => {
        throw "candidate_error";
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "estimate_fish_candidates", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "provider_error");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates は空応答時にempty_generationでフォールバック", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: { message: { content: [{ text: "" }] } }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "estimate_fish_candidates", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "empty_generation");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates は候補を返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "test",
        AI_PROVIDER: "bedrock"
      });
      const res = await handler(
        eventOf({ task: "estimate_fish_candidates", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(Array.isArray(body.candidates), true);
      assert.ok(body.candidates.length >= 4);
      assert.ok(body.candidates.some((c) => typeof c.fish_id === "string"));
      assert.ok(body.candidates.some((c) => c.fish_id === "other"));
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=estimate_fish_candidates はfish master内のfish_idだけを返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  candidates: [
                    { fish_id: "brand_36600", score: 0.91 },
                    { label: "マイワシ", score: 0.82 },
                    { label: "リスト外の魚", score: 0.77 },
                    { fish_id: "other", score: 0.2 }
                  ]
                })
              }
            ]
          }
        }
      });

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        DAILY_LIMIT_MAX_PER_DAY: "0"
      });
      const res = await handler(
        eventOf({ task: "estimate_fish_candidates", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.candidates.length, 4);
      assert.deepEqual(body.candidates[0], { fish_id: "brand_36600", score: 0.91 });
      assert.deepEqual(body.candidates[1], { fish_id: "brand_5400", score: 0.82 });
      assert.equal(body.candidates[2].fish_id !== "other", true);
      assert.equal(typeof body.candidates[2].fish_id, "string");
      assert.equal(body.candidates[2].score > 0, true);
      assert.deepEqual(body.candidates[3], { fish_id: "other", score: 0 });
      assert.equal(body.fallbackUsed, false);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=track_metric 正常系は status=ok", async () => {
    const snapshot = snapshotGlobals();
    try {
      const capturedInputs = [];
      DynamoDBClient.prototype.send = async (command) => {
        capturedInputs.push(command.input);
        return {};
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table",
        METRICS_FISH_DAILY_TABLE_NAME: "metrics-fish-daily-table"
      });
      const res = await handler(
        eventOf({
          task: "track_metric",
          metric_type: "copy",
          fish_id: "saba",
          fish_label: "サバ",
          selected_variant: "short"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.status, "ok");
      assert.equal(capturedInputs.length, 3);

      const eventWrite = capturedInputs[0];
      assert.equal(eventWrite.TableName, "metrics-table");
      assert.equal(eventWrite.Item.fish_id.S, "saba");
      assert.equal(eventWrite.Item.metric_type.S, "copy");
      assert.ok(eventWrite.Item.timestamp.S);
      assert.ok(eventWrite.Item.date_jst.S);

      const dailyUpdate = capturedInputs[1];
      assert.equal(dailyUpdate.TableName, "metrics-daily-table");
      assert.equal(dailyUpdate.Key.date_jst.S, eventWrite.Item.date_jst.S);
      assert.match(dailyUpdate.UpdateExpression, /total_count/);
      assert.equal(dailyUpdate.ExpressionAttributeNames["#metricCount"], "copy_count");

      const fishDailyUpdate = capturedInputs[2];
      assert.equal(fishDailyUpdate.TableName, "metrics-fish-daily-table");
      assert.equal(fishDailyUpdate.Key.date_jst.S, eventWrite.Item.date_jst.S);
      assert.equal(fishDailyUpdate.Key.fish_id.S, "saba");
      assert.equal(fishDailyUpdate.ExpressionAttributeValues[":fishLabel"].S, "サバ");
      assert.match(fishDailyUpdate.UpdateExpression, /total_count/);
      assert.equal(fishDailyUpdate.ExpressionAttributeNames["#metricCount"], "copy_count");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=track_metric はx_clickとsession_idも保存する", async () => {
    const snapshot = snapshotGlobals();
    try {
      const capturedInputs = [];
      DynamoDBClient.prototype.send = async (command) => {
        capturedInputs.push(command.input);
        return {};
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table",
        METRICS_FISH_DAILY_TABLE_NAME: "metrics-fish-daily-table"
      });
      const res = await handler(
        eventOf({
          task: "track_metric",
          metric_type: "x_click",
          fish_id: "buri",
          fish_label: "ブリ",
          selected_variant: "pr",
          session_id: "session-123"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.status, "ok");
      assert.equal(capturedInputs[0].Item.session_id.S, "session-123");
      assert.equal(capturedInputs[1].ExpressionAttributeNames["#metricCount"], "x_click_count");
      assert.equal(capturedInputs[2].ExpressionAttributeNames["#metricCount"], "x_click_count");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=track_metric はテーブル未設定時にignored", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "",
        METRICS_DAILY_TABLE_NAME: "",
        METRICS_FISH_DAILY_TABLE_NAME: ""
      });
      const res = await handler(
        eventOf({
          task: "track_metric",
          metric_type: "copy",
          fish_id: "saba",
          fish_label: "サバ"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.status, "ignored");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=track_metric はイベント保存先未設定ならignored", async () => {
    const snapshot = snapshotGlobals();
    try {
      const capturedInputs = [];
      DynamoDBClient.prototype.send = async (command) => {
        capturedInputs.push(command.input);
        return {};
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table",
        METRICS_FISH_DAILY_TABLE_NAME: "metrics-fish-daily-table"
      });
      const res = await handler(
        eventOf({ task: "track_metric", metric_type: "copy", fish_id: "saba", fish_label: "サバ" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.status, "ignored");
      assert.equal(capturedInputs.length, 0);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=track_metric は日次更新失敗時にignored", async () => {
    const snapshot = snapshotGlobals();
    try {
      let callCount = 0;
      DynamoDBClient.prototype.send = async () => {
        callCount += 1;
        if (callCount === 1) return {};
        throw new Error("daily_write_failed");
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table",
        METRICS_FISH_DAILY_TABLE_NAME: "metrics-fish-daily-table"
      });
      const res = await handler(
        eventOf({ task: "track_metric", metric_type: "copy", fish_id: "saba", fish_label: "サバ" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.status, "ignored");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=track_metric 異常入力は status=ignored", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table"
      });
      const res = await handler(
        eventOf({
          task: "track_metric",
          metric_type: "invalid",
          fish_id: ""
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.status, "ignored");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_metrics_summary はfish_id未指定ならfish_count_today=null", async () => {
    const snapshot = snapshotGlobals();
    try {
      let totalCountCalls = 0;
      DynamoDBClient.prototype.send = async (command) => {
        const input = command.input;
        if (input.IndexName === "GSI1" && input.Select === "COUNT") {
          totalCountCalls += 1;
          return { Count: 9 };
        }
        if (input.IndexName === "GSI1") {
          return { Items: [] };
        }
        throw new Error("unexpected_query");
      };

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table"
      });
      const res = await handler(eventOf({ task: "get_metrics_summary" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total_today, 9);
      assert.equal(body.current_order, 9);
      assert.equal(body.fish_count_today, null);
      assert.equal(totalCountCalls, 1);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_metrics_summary はテーブル未設定時もゼロで返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: ""
      });
      const res = await handler(eventOf({ task: "get_metrics_summary", fish_id: "maiwashi" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total_today, 0);
      assert.equal(body.current_order, 0);
      assert.equal(body.fish_count_today, 0);
      assert.equal(body.top_fish_this_week, null);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_metrics_summary は集計結果を返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      let gsiCallCount = 0;
      DynamoDBClient.prototype.send = async (command) => {
        const input = command.input;
        if (input.IndexName === "GSI1" && input.Select === "COUNT") {
          return { Count: 128 };
        }
        if (!input.IndexName && input.Select === "COUNT") {
          return { Count: 17 };
        }
        if (input.IndexName === "GSI1") {
          gsiCallCount += 1;
          if (gsiCallCount === 1) {
            return {
              Items: [
                {
                  fish_id: { S: "maiwashi" },
                  fish_label: { S: "マイワシ" }
                },
                {
                  fish_id: { S: "maiwashi" },
                  fish_label: { S: "マイワシ" }
                },
                {
                  fish_id: { S: "saba" },
                  fish_label: { S: "サバ" }
                }
              ]
            };
          }
          return { Items: [] };
        }
        return {};
      };

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table"
      });
      const res = await handler(
        eventOf({
          task: "get_metrics_summary",
          fish_id: "maiwashi"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total_today, 128);
      assert.equal(body.current_order, 128);
      assert.equal(body.fish_count_today, 17);
      assert.equal(body.top_fish_this_week.fish_id, "maiwashi");
      assert.equal(body.top_fish_this_week.fish_label, "マイワシ");
      assert.equal(body.top_fish_this_week.count, 2);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_metrics_summary はDynamoDB異常時もゼロで返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      DynamoDBClient.prototype.send = async () => {
        throw new Error("ddb_summary_down");
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table"
      });
      const res = await handler(
        eventOf({
          task: "get_metrics_summary",
          fish_id: "maiwashi"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total_today, 0);
      assert.equal(body.current_order, 0);
      assert.equal(body.fish_count_today, 0);
      assert.equal(body.top_fish_this_week, null);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_metrics_summary は魚ラベル欠落時もfish_idで集計できる", async () => {
    const snapshot = snapshotGlobals();
    try {
      let gsiCallCount = 0;
      DynamoDBClient.prototype.send = async (command) => {
        const input = command.input;
        if (input.IndexName === "GSI1" && input.Select === "COUNT") {
          return { Count: 4 };
        }
        if (!input.IndexName && input.Select === "COUNT") {
          return { Count: 1 };
        }
        if (input.IndexName === "GSI1") {
          gsiCallCount += 1;
          if (gsiCallCount === 1) {
            return {
              Items: [
                { fish_id: { S: "saba" } },
                { fish_id: { S: "saba" }, fish_label: { S: "サバ" } }
              ]
            };
          }
          return { Items: [] };
        }
        return {};
      };

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table"
      });
      const res = await handler(eventOf({ task: "get_metrics_summary", fish_id: "saba" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.top_fish_this_week.fish_id, "saba");
      assert.equal(body.top_fish_this_week.fish_label, "saba");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_dashboard_metrics は無効な日付範囲でゼロを返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table"
      });
      const res = await handler(
        eventOf({
          task: "get_dashboard_metrics",
          date_from: "2026-03-12",
          date_to: "2026-03-01"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total, 0);
      assert.equal(body.today, 0);
      assert.equal(body.this_week, 0);
      assert.deepEqual(body.daily_counts, []);
      assert.deepEqual(body.fish_counts, []);
      assert.equal(body.top_fish, null);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_dashboard_metrics は日付フォーマット不正時に既定期間へフォールバックする", async () => {
    const snapshot = snapshotGlobals();
    try {
      const seenDates = [];
      DynamoDBClient.prototype.send = async (command) => {
        const input = command.input;
        if (input.TableName === "metrics-daily-table") {
          seenDates.push(input.ExpressionAttributeValues[":dateJst"].S);
          return { Items: [] };
        }
        return { Items: [] };
      };

      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args) {
          if (args.length === 0) {
            super("2026-03-11T12:00:00.000Z");
            return;
          }
          super(...args);
        }
        static now() {
          return new OriginalDate("2026-03-11T12:00:00.000Z").getTime();
        }
        static parse(value) {
          return OriginalDate.parse(value);
        }
        static UTC(...args) {
          return OriginalDate.UTC(...args);
        }
      };

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table"
      });
      const res = await handler(
        eventOf({
          task: "get_dashboard_metrics",
          date_from: "bad-date",
          date_to: "also-bad"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total, 0);
      assert.equal(seenDates.includes("2026-03-05"), true);
      assert.equal(seenDates.includes("2026-03-11"), true);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_dashboard_metrics はテーブル未設定時もゼロで返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_DAILY_TABLE_NAME: ""
      });
      const res = await handler(
        eventOf({
          task: "get_dashboard_metrics",
          date_from: "2026-03-09",
          date_to: "2026-03-11"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total, 0);
      assert.equal(body.today, 0);
      assert.equal(body.this_week, 0);
      assert.deepEqual(body.daily_counts, []);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_dashboard_metrics は集計済みKPIを返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      DynamoDBClient.prototype.send = async (command) => {
        const input = command.input;
        if (input.TableName === "metrics-daily-table") {
          const dateJst = input.ExpressionAttributeValues[":dateJst"].S;
          if (dateJst === "2026-03-11") {
            return { Items: [{ date_jst: { S: dateJst }, total_count: { N: "7" } }] };
          }
          if (dateJst === "2026-03-10") {
            return { Items: [{ date_jst: { S: dateJst }, total_count: { N: "5" } }] };
          }
          if (dateJst === "2026-03-09") {
            return { Items: [{ date_jst: { S: dateJst }, total_count: { N: "3" } }] };
          }
          return { Items: [] };
        }
        if (input.TableName === "metrics-fish-daily-table") {
          const dateJst = input.ExpressionAttributeValues[":dateJst"].S;
          if (dateJst === "2026-03-11") {
            return {
              Items: [
                {
                  date_jst: { S: dateJst },
                  fish_id: { S: "maiwashi" },
                  fish_label: { S: "マイワシ" },
                  total_count: { N: "4" }
                },
                {
                  date_jst: { S: dateJst },
                  fish_id: { S: "saba" },
                  fish_label: { S: "サバ" },
                  total_count: { N: "3" }
                }
              ]
            };
          }
          if (dateJst === "2026-03-10") {
            return {
              Items: [
                {
                  date_jst: { S: dateJst },
                  fish_id: { S: "maiwashi" },
                  fish_label: { S: "マイワシ" },
                  total_count: { N: "2" }
                },
                {
                  date_jst: { S: dateJst },
                  fish_id: { S: "aji" },
                  fish_label: { S: "アジ" },
                  total_count: { N: "3" }
                }
              ]
            };
          }
          return { Items: [] };
        }
        return { Items: [] };
      };

      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args) {
          if (args.length === 0) {
            super("2026-03-11T12:00:00.000Z");
            return;
          }
          super(...args);
        }
        static now() {
          return new OriginalDate("2026-03-11T12:00:00.000Z").getTime();
        }
        static parse(value) {
          return OriginalDate.parse(value);
        }
        static UTC(...args) {
          return OriginalDate.UTC(...args);
        }
      };

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table",
        METRICS_FISH_DAILY_TABLE_NAME: "metrics-fish-daily-table"
      });
      const res = await handler(
        eventOf({
          task: "get_dashboard_metrics",
          date_from: "2026-03-09",
          date_to: "2026-03-11"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total, 15);
      assert.equal(body.today, 7);
      assert.equal(body.this_week, 15);
      assert.deepEqual(body.daily_counts, [
        { date_jst: "2026-03-09", count: 3 },
        { date_jst: "2026-03-10", count: 5 },
        { date_jst: "2026-03-11", count: 7 }
      ]);
      assert.equal(body.fish_counts[0].fish_id, "maiwashi");
      assert.equal(body.fish_counts[0].count, 6);
      assert.equal(body.top_fish.fish_id, "maiwashi");
      assert.equal(body.top_fish.fish_label, "マイワシ");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_dashboard_metrics はfish_dailyが空でもraw metricsから魚別件数を返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      DynamoDBClient.prototype.send = async (command) => {
        const input = command.input;
        if (input.TableName === "metrics-daily-table") {
          const dateJst = input.ExpressionAttributeValues[":dateJst"].S;
          if (dateJst === "2026-03-12") {
            return { Items: [{ date_jst: { S: dateJst }, total_count: { N: "3" } }] };
          }
          return { Items: [] };
        }
        if (input.TableName === "metrics-fish-daily-table") {
          return { Items: [] };
        }
        if (input.TableName === "metrics-table" && input.IndexName === "GSI1") {
          const dateJst = input.ExpressionAttributeValues[":dateJst"].S;
          if (dateJst === "2026-03-12") {
            return {
              Items: [
                { fish_id: { S: "buri" }, fish_label: { S: "ブリ" } },
                { fish_id: { S: "buri" }, fish_label: { S: "ブリ" } },
                { fish_id: { S: "saba" }, fish_label: { S: "サバ" } }
              ]
            };
          }
          return { Items: [] };
        }
        return { Items: [] };
      };

      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args) {
          if (args.length === 0) {
            super("2026-03-12T12:00:00.000Z");
            return;
          }
          super(...args);
        }
        static now() {
          return new OriginalDate("2026-03-12T12:00:00.000Z").getTime();
        }
        static parse(value) {
          return OriginalDate.parse(value);
        }
        static UTC(...args) {
          return OriginalDate.UTC(...args);
        }
      };

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table",
        METRICS_FISH_DAILY_TABLE_NAME: "metrics-fish-daily-table"
      });
      const res = await handler(
        eventOf({
          task: "get_dashboard_metrics",
          date_from: "2026-03-06",
          date_to: "2026-03-12"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total, 3);
      assert.equal(body.today, 3);
      assert.equal(body.fish_counts.length, 2);
      assert.deepEqual(body.fish_counts[0], { fish_id: "buri", fish_label: "ブリ", count: 2 });
      assert.deepEqual(body.top_fish, { fish_id: "buri", fish_label: "ブリ", count: 2 });
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_dashboard_metrics はraw metricsの欠損行を読み飛ばし空ラベルを補完する", async () => {
    const snapshot = snapshotGlobals();
    try {
      DynamoDBClient.prototype.send = async (command) => {
        const input = command.input;
        if (input.TableName === "metrics-daily-table") {
          return { Items: [{ date_jst: { S: "2026-03-12" }, total_count: { N: "abc" } }, {}] };
        }
        if (input.TableName === "metrics-table" && input.IndexName === "GSI1") {
          return {
            Items: [
              {},
              { fish_id: { S: "saba" } },
              { fish_id: { S: "saba" }, fish_label: { S: "サバ" } }
            ]
          };
        }
        return { Items: [] };
      };

      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args) {
          if (args.length === 0) {
            super("2026-03-12T12:00:00.000Z");
            return;
          }
          super(...args);
        }
        static now() {
          return new OriginalDate("2026-03-12T12:00:00.000Z").getTime();
        }
        static parse(value) {
          return OriginalDate.parse(value);
        }
        static UTC(...args) {
          return OriginalDate.UTC(...args);
        }
      };

      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_TABLE_NAME: "metrics-table",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table",
        METRICS_FISH_DAILY_TABLE_NAME: ""
      });
      const res = await handler(
        eventOf({ task: "get_dashboard_metrics", date_from: "2026-03-12", date_to: "2026-03-12" })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total, 0);
      assert.equal(body.fish_counts[0].fish_id, "saba");
      assert.equal(body.fish_counts[0].fish_label, "サバ");
      assert.equal(body.top_fish.fish_id, "saba");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("task=get_dashboard_metrics はDynamoDB異常時もゼロで返す", async () => {
    const snapshot = snapshotGlobals();
    try {
      DynamoDBClient.prototype.send = async () => {
        throw new Error("ddb_dashboard_down");
      };
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        METRICS_DAILY_TABLE_NAME: "metrics-daily-table",
        METRICS_FISH_DAILY_TABLE_NAME: "metrics-fish-daily-table"
      });
      const res = await handler(
        eventOf({
          task: "get_dashboard_metrics",
          date_from: "2026-03-09",
          date_to: "2026-03-11"
        })
      );
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.total, 0);
      assert.equal(body.today, 0);
      assert.equal(body.this_week, 0);
      assert.deepEqual(body.daily_counts, []);
      assert.deepEqual(body.fish_counts, []);
      assert.equal(body.top_fish, null);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("bodyがobjectでも処理でき、clientKeyはx-forwarded-forを使える", async () => {
    const snapshot = snapshotGlobals();
    try {
      const handler = await freshHandler({ POST_TEXT_MODE: "test", AI_PROVIDER: "bedrock" });
      const res = await handler({
        headers: { "x-forwarded-for": "203.0.113.77" },
        body: { fishType: "ブリ" }
      });
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.generatedText, "テストモードです。今日は魚料理をおいしく味わいました。#変わる海を味わう");
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

  await runCase("OpenAI outputのcontentが配列でないとempty_generation", async () => {
    const snapshot = snapshotGlobals();
    try {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: [{ content: "invalid" }]
        })
      });
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "dummy-key"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "empty_generation");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("Bedrock contentが配列でなくpng入力でもempty_generation", async () => {
    const snapshot = snapshotGlobals();
    try {
      BedrockRuntimeClient.prototype.send = async () => ({ output: { message: { content: {} } } });
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "bedrock",
        BEDROCK_REGION: "us-east-1"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/png" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.errorMessage, "empty_generation");
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("OpenAI正常応答(output_text)時はlive_openai", async () => {
    const snapshot = snapshotGlobals();
    try {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output_text: "ノドグロの香ばしさが広がる一皿でした。 #変わる海を味わう"
        })
      });
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "dummy-key"
      });
      const res = await handler(eventOf({ fishType: "ノドグロ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.mode, "live_openai");
      assert.match(body.generatedText, /ノドグロ/);
    } finally {
      restoreGlobals(snapshot);
    }
  }, results);

  await runCase("OpenAI正常応答(output[].content[])時はlive_openai", async () => {
    const snapshot = snapshotGlobals();
    try {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              content: [
                { type: "input_text", text: "ignored" },
                { type: "output_text", text: "ブリのうま味が広がる一皿でした。 #変わる海を味わう" }
              ]
            }
          ]
        })
      });
      const handler = await freshHandler({
        POST_TEXT_MODE: "live",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "dummy-key"
      });
      const res = await handler(eventOf({ fishType: "ブリ", imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }));
      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.mode, "live_openai");
      assert.match(body.generatedText, /ブリ/);
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
