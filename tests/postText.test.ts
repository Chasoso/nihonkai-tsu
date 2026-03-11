import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePostText } from "../src/lib/postText";

const image = {
  imageBase64: "abc",
  mimeType: "image/jpeg",
  imageHash: "hash",
  width: 100,
  height: 100
} as const;

describe("generatePostText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generatedText に埋まった options JSON を展開する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          generatedText: JSON.stringify({
            options: [
              { type: "short", text: "短文です" },
              { type: "standard", text: "標準文です" },
              { type: "pr", text: "PR文です" }
            ]
          })
        })
      })
    );

    const result = await generatePostText({
      apiUrl: "/api/generate-post-text",
      image,
      fishType: "ブリ",
      tone: "friendly",
      enabled: true,
      cacheTtlMs: 0
    });

    expect(result.options[0].text).toBe("短文です");
    expect(result.options[1].text).toBe("標準文です");
    expect(result.options[2].text).toBe("PR文です");
  });

  it("option text に JSON が入っていても text だけを展開する", async () => {
    const embedded = JSON.stringify({
      options: [
        { type: "short", text: "石川のブリを堪能" },
        { type: "standard", text: "石川で水揚げされた新鮮なブリを味わいました。" },
        { type: "pr", text: "石川の海の魅力を感じる一皿でした。" }
      ]
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          options: [
            { type: "short", text: embedded },
            { type: "standard", text: embedded },
            { type: "pr", text: embedded }
          ]
        })
      })
    );

    const result = await generatePostText({
      apiUrl: "/api/generate-post-text",
      image: { ...image, imageHash: "hash-2" },
      fishType: "サバ",
      tone: "friendly",
      enabled: true,
      cacheTtlMs: 0
    });

    expect(result.options[0].text).toBe("石川のブリを堪能");
    expect(result.options[1].text).toBe("石川で水揚げされた新鮮なブリを味わいました。");
    expect(result.options[2].text).toBe("石川の海の魅力を感じる一皿でした。");
  });
});
