import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:5173/nihonkai-tsu/";
const sampleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f6f7f2"/>
  <circle cx="640" cy="360" r="180" fill="#d9e3f0"/>
</svg>
`.trim();

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (msg) => console.log(`PAGE_CONSOLE=${msg.type()}:${msg.text()}`));
  page.on("pageerror", (error) => console.log(`PAGE_ERROR=${error.message}`));

  await page.route("**/api/generate-post-text", async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() || "{}");

    if (body.task === "estimate_fish_candidates") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidates: [
            { fish_id: "brand_36600", score: 0.92 },
            { fish_id: "brand_5400", score: 0.71 },
            { fish_id: "brand_23500", score: 0.55 },
            { fish_id: "other", score: 0 }
          ]
        })
      });
      return;
    }

    if (body.task === "generate_post_text") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          options: [
            { type: "short", text: "ブリの塩焼き。#石川の魚" },
            { type: "standard", text: "ブリの塩焼きがおいしかった。#石川の魚" },
            { type: "pr", text: "石川の海を感じるブリの塩焼き。#石川の魚" }
          ],
          generatedText: "ブリの塩焼きがおいしかった。#石川の魚",
          fallbackUsed: false,
          errorMessage: null
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" })
    });
  });

  console.log("STEP=open");
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 20000 });
  console.log("STEP=loaded");
  await page.getByRole("button", { name: "この魚で投稿をはじめる" }).first().click();
  console.log("STEP=start_post_clicked");

  const modal = page.locator(".x-post-modal");
  await modal.waitFor({ state: "visible" });
  console.log("STEP=modal_visible");

  await page.locator("input.hidden-file-input").setInputFiles({
    name: "sample-upload.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(sampleSvg, "utf8")
  });
  console.log("STEP=file_selected");

  await modal.getByRole("button", { name: "この写真で次へ" }).click();
  console.log("STEP=step2");
  await modal.getByRole("button", { name: "この魚で投稿文を作る" }).click();
  console.log("STEP=step3");
  await modal.getByRole("button", { name: "投稿文を作る" }).click();
  console.log("STEP=generate_clicked");
  await modal.getByRole("button", { name: "Xに投稿する" }).waitFor({ state: "visible", timeout: 20000 });
  console.log("STEP=x_button_visible");

  const popupPromise = page.waitForEvent("popup", { timeout: 10000 });
  await modal.getByRole("button", { name: "Xに投稿する" }).click();
  console.log("STEP=x_clicked");
  const popup = await popupPromise;
  console.log("STEP=popup_opened");

  await popup.waitForURL(/x\.com\/intent\/tweet/, { timeout: 20000 });
  console.log("STEP=popup_x_url");
  await popup.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});

  console.log(`POPUP_URL=${popup.url()}`);
  console.log(`MAIN_URL=${page.url()}`);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
