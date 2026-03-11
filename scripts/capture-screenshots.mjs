import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:5173";
const viewports = [
  {
    key: "desktop",
    viewport: { width: 1440, height: 1400 },
    isMobile: false,
    userAgent: undefined
  },
  {
    key: "mobile",
    viewport: { width: 430, height: 1600 },
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  }
];
const captureFiles = [
  "01-top.png",
  "02-modal-step1-initial.png",
  "03-modal-step1-selected.png",
  "04-modal-step2-default.png",
  "05-modal-step2-other.png",
  "06-modal-step3-initial.png",
  "07-modal-step3-generated.png",
  "08-progress-board-after-alt-fish.png",
  "09-dashboard.png"
];
const sampleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f6f7f2"/>
  <rect x="30" y="30" width="1220" height="660" rx="18" fill="#fbfbf8" stroke="#c8ced7" stroke-width="6"/>
  <path d="M210 380 C320 250 520 210 700 260 C800 285 900 340 980 330 L1075 285 L1030 350 L1095 390 L980 385 C920 460 800 500 660 500 C470 500 290 455 210 380 Z" fill="#eceee8" stroke="#777d84" stroke-width="8"/>
  <path d="M365 355 C510 315 725 320 900 355" stroke="#9ca3aa" stroke-width="7" fill="none"/>
  <path d="M320 385 C500 360 720 360 930 392" stroke="#9ca3aa" stroke-width="6" fill="none"/>
  <path d="M470 280 L555 150 L610 290" fill="#f1f3ed" stroke="#777d84" stroke-width="8"/>
  <path d="M700 495 L770 620 L810 500" fill="#f1f3ed" stroke="#777d84" stroke-width="8"/>
  <circle cx="880" cy="355" r="26" fill="#ffffff" stroke="#777d84" stroke-width="8"/>
  <circle cx="888" cy="355" r="10" fill="#777d84"/>
  <path d="M935 376 Q970 390 1005 372" stroke="#777d84" stroke-width="8" fill="none"/>
  <path d="M120 575 C340 535 640 560 1160 522" stroke="#d7dcd3" stroke-width="6" fill="none"/>
</svg>
`.trim();

function timestampLabel(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function saveFullPage(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`saved: ${path.relative(repoRoot, filePath)}`);
}

async function saveExpandedModal(page, filePath) {
  await page.evaluate(() => {
    const modal = document.querySelector(".x-post-modal");
    const scroll = document.querySelector(".x-post-modal-scroll");
    if (!(modal instanceof HTMLElement) || !(scroll instanceof HTMLElement)) return;

    modal.dataset.captureOriginalMaxHeight = modal.style.maxHeight || "";
    modal.dataset.captureOriginalOverflow = modal.style.overflow || "";
    scroll.dataset.captureOriginalMaxHeight = scroll.style.maxHeight || "";
    scroll.dataset.captureOriginalOverflowY = scroll.style.overflowY || "";
    scroll.dataset.captureOriginalOverflowX = scroll.style.overflowX || "";
    scroll.dataset.captureOriginalPaddingRight = scroll.style.paddingRight || "";
    scroll.dataset.captureOriginalMarginRight = scroll.style.marginRight || "";

    modal.style.maxHeight = "none";
    modal.style.overflow = "visible";
    scroll.style.maxHeight = "none";
    scroll.style.overflowY = "visible";
    scroll.style.overflowX = "visible";
    scroll.style.paddingRight = "0";
    scroll.style.marginRight = "0";
  });

  const modal = page.locator(".x-post-modal");
  await modal.screenshot({ path: filePath });
  console.log(`saved: ${path.relative(repoRoot, filePath)}`);

  await page.evaluate(() => {
    const modal = document.querySelector(".x-post-modal");
    const scroll = document.querySelector(".x-post-modal-scroll");
    if (!(modal instanceof HTMLElement) || !(scroll instanceof HTMLElement)) return;

    modal.style.maxHeight = modal.dataset.captureOriginalMaxHeight ?? "";
    modal.style.overflow = modal.dataset.captureOriginalOverflow ?? "";
    scroll.style.maxHeight = scroll.dataset.captureOriginalMaxHeight ?? "";
    scroll.style.overflowY = scroll.dataset.captureOriginalOverflowY ?? "";
    scroll.style.overflowX = scroll.dataset.captureOriginalOverflowX ?? "";
    scroll.style.paddingRight = scroll.dataset.captureOriginalPaddingRight ?? "";
    scroll.style.marginRight = scroll.dataset.captureOriginalMarginRight ?? "";

    delete modal.dataset.captureOriginalMaxHeight;
    delete modal.dataset.captureOriginalOverflow;
    delete scroll.dataset.captureOriginalMaxHeight;
    delete scroll.dataset.captureOriginalOverflowY;
    delete scroll.dataset.captureOriginalOverflowX;
    delete scroll.dataset.captureOriginalPaddingRight;
    delete scroll.dataset.captureOriginalMarginRight;
  });
}

async function saveElement(locator, filePath) {
  await locator.screenshot({ path: filePath });
  console.log(`saved: ${path.relative(repoRoot, filePath)}`);
}

async function captureSet(browser, outputDir, config) {
  const context = await browser.newContext({
    viewport: config.viewport,
    isMobile: config.isMobile,
    hasTouch: config.isMobile,
    deviceScaleFactor: config.isMobile ? 3 : 1,
    userAgent: config.userAgent
  });

  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.open = () => null;
      window.alert = () => undefined;
    });

    try {
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 20000 });
    } catch (error) {
      throw new Error(
        `Cannot open ${baseUrl}. Start the app with "npm run dev" first. Original error: ${String(error)}`
      );
    }

    await saveFullPage(page, path.join(outputDir, "01-top.png"));

    await page.getByRole("button", { name: "投稿をはじめる" }).first().click();
    const modal = page.locator(".x-post-modal");
    await modal.waitFor({ state: "visible" });
    await saveExpandedModal(page, path.join(outputDir, "02-modal-step1-initial.png"));

    const fileInput = page.locator("input.hidden-file-input");
    await fileInput.setInputFiles({
      name: "sample-upload.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(sampleSvg, "utf8")
    });

    await page.getByRole("heading", { name: "Step 2: 魚を選ぶ" }).waitFor();
    await modal.getByRole("button", { name: "1/3 写真" }).click();
    await modal.getByRole("heading", { name: "Step 1: 写真を撮る / 選ぶ" }).waitFor();
    await saveExpandedModal(page, path.join(outputDir, "03-modal-step1-selected.png"));

    await modal.getByRole("button", { name: "2/3 魚を確認" }).click();
    await modal.getByRole("heading", { name: "Step 2: 魚を選ぶ" }).waitFor();
    await saveExpandedModal(page, path.join(outputDir, "04-modal-step2-default.png"));

    const otherCandidate = modal.locator('input[name="fish-candidate"][value="other"]');
    if (await otherCandidate.count()) {
      await otherCandidate.check({ force: true });
      await modal
        .getByText("魚種が分からなくても投稿できます。候補にない場合も、そのまま進めます。", { exact: true })
        .waitFor();
      await saveExpandedModal(page, path.join(outputDir, "05-modal-step2-other.png"));

      const otherFishSearch = modal.getByRole("searchbox", { name: "魚を検索" });
      if (await otherFishSearch.count()) {
        await otherFishSearch.fill("マサバ");
      }

      const preferredOtherFish = modal.getByRole("button", { name: /^マサバ$/ }).first();
      if (!(await preferredOtherFish.count())) {
        throw new Error("Progress Board verification setup failed: マサバ option was not found in Step 2.");
      }
      await preferredOtherFish.click();
    }

    const step2Primary = modal.getByRole("button", { name: "この魚で投稿文を作る" });
    await step2Primary.waitFor();
    await step2Primary.click();

    await modal.getByRole("heading", { name: "Step 3: 投稿文を作って投稿" }).waitFor();
    await saveExpandedModal(page, path.join(outputDir, "06-modal-step3-initial.png"));

    const generateButton = modal.getByRole("button", { name: "投稿文を作る" });
    await generateButton.waitFor();
    await generateButton.click();

    await modal.getByRole("button", { name: "コピーする" }).waitFor({ timeout: 20000 });
    await saveExpandedModal(page, path.join(outputDir, "07-modal-step3-generated.png"));

    const xPostButton = modal.getByRole("button", { name: "Xに投稿する" });
    await xPostButton.waitFor();
    await xPostButton.click();
    await modal.waitFor({ state: "hidden", timeout: 10000 });

    const badges = await page.evaluate(() => {
      try {
        return JSON.parse(window.localStorage.getItem("nihonkai_badges") || "[]");
      } catch {
        return [];
      }
    });

    const earnedIds = new Set(
      Array.isArray(badges) ? badges.map((badge) => String(badge?.fishId || "").trim().toLowerCase()) : []
    );
    if (!Array.isArray(badges) || badges.length === 0) {
      throw new Error("Progress Board verification failed: no badges were recorded after posting.");
    }
    if (!earnedIds.has("brand_36600")) {
      throw new Error(`Progress Board verification failed: alternate fish badge was not recorded. Actual: ${JSON.stringify(badges)}`);
    }
    if (earnedIds.has("brand_5400")) {
      throw new Error("Progress Board verification failed: initial fish badge was recorded instead of the alternate fish.");
    }

    const progressSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your Tsu" }) }).first();
    await progressSection.scrollIntoViewIfNeeded();
    await saveElement(progressSection, path.join(outputDir, "08-progress-board-after-alt-fish.png"));

    const dashboardPage = await context.newPage();
    await dashboardPage.goto(`${baseUrl}/dashboard/`, { waitUntil: "networkidle", timeout: 20000 });
    await saveFullPage(dashboardPage, path.join(outputDir, "09-dashboard.png"));
    await dashboardPage.close();
  } finally {
    await context.close();
  }
}

async function main() {
  const outputRootDir = path.join(repoRoot, "screenshots", timestampLabel());
  await ensureDir(outputRootDir);

  const browser = await chromium.launch({
    headless: process.env.SCREENSHOT_HEADLESS !== "false"
  });

  try {
    for (const config of viewports) {
      const variantDir = path.join(outputRootDir, config.key);
      await ensureDir(variantDir);
      await captureSet(browser, variantDir, config);
    }

    const metadata = {
      capturedAt: new Date().toISOString(),
      baseUrl,
      captureMode: {
        top: "fullPage",
        modal: "expanded-scroll"
      },
      variants: viewports.map((config) => ({
        key: config.key,
        viewport: config.viewport,
        isMobile: config.isMobile,
        files: captureFiles
      }))
    };
    await fs.writeFile(path.join(outputRootDir, "meta.json"), JSON.stringify(metadata, null, 2), "utf8");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
