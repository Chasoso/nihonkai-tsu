import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareStudio, normalizeKanaForSearch } from "../src/components/ShareStudio";
import type { Fish, LandingsData } from "../src/types";

const fish: Fish = {
  id: "saba",
  name: "サバ",
  category: "trend",
  trend: "up",
  percentile: 12,
  microcopy: "旬のサバ",
  share: {
    badgeLabel: "サバ通",
    text: "#石川の魚 #日本海"
  }
};

const landings: LandingsData = {
  meta: {
    range_years: [2024, 2025],
    unit: "t",
    updated_at: "2026-01-01"
  },
  species: []
};

const landingsWithSpecies: LandingsData = {
  meta: landings.meta,
  species: [
    { id: "saba", name_ja: "サバ", monthly: [] },
    { id: "aji", name_ja: "アジ", monthly: [] },
    { id: "iwashi", name_ja: "イワシ", monthly: [] }
  ]
};

describe("ShareStudio", () => {
  it("normalizes hiragana and katakana to the same search key", () => {
    expect(normalizeKanaForSearch("まいわし")).toBe(normalizeKanaForSearch("マイワシ"));
    expect(normalizeKanaForSearch("  あかがれい ")).toBe(normalizeKanaForSearch("アカガレイ"));
  });

  it("shows the 3-step flow and disables incomplete steps", async () => {
    const { rerender } = render(
      <ShareStudio
        fish={fish}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landings}
        openComposerNonce={0}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    rerender(
      <ShareStudio
        fish={fish}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landings}
        openComposerNonce={1}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    expect(await screen.findByLabelText("1/3 写真")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2/3 魚を確認" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "3/3 投稿" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "投稿文を作る" })).not.toBeInTheDocument();
  });

  it("shows the camera preview and keeps next disabled before capture", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });

    const { rerender } = render(
      <ShareStudio
        fish={fish}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landings}
        openComposerNonce={0}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    rerender(
      <ShareStudio
        fish={fish}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landings}
        openComposerNonce={1}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "カメラを開く" }));

    expect(await screen.findByLabelText("撮影")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "この写真で次へ" })).toBeDisabled();
  });

  it("captures a photo from the shutter button and enables next", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 1280
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 720
    });

    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage
    } as unknown as CanvasRenderingContext2D);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(new Blob(["image"], { type: "image/jpeg" })));

    const { rerender } = render(
      <ShareStudio
        fish={fish}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landings}
        openComposerNonce={0}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    rerender(
      <ShareStudio
        fish={fish}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landings}
        openComposerNonce={1}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "カメラを開く" }));
    fireEvent.touchEnd(await screen.findByLabelText("撮影"));

    await waitFor(() => expect(screen.getByAltText("post image preview")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "この写真で次へ" })).toBeEnabled();
    expect(drawImage).toHaveBeenCalled();

    getContext.mockRestore();
    toBlob.mockRestore();
  });

  it("uses the camera stream aspect ratio for the preview frame", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [
        {
          stop: vi.fn(),
          getSettings: () => ({ width: 4032, height: 3024 })
        }
      ]
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 4032
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 3024
    });

    const { rerender } = render(
      <ShareStudio
        fish={fish}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landings}
        openComposerNonce={0}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    rerender(
      <ShareStudio
        fish={fish}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landings}
        openComposerNonce={1}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "カメラを開く" }));
    await screen.findByLabelText("撮影");

    expect(document.querySelector(".media-frame")).toHaveStyle({
      aspectRatio: `${4032 / 3024}`
    });
  });

  it("keeps the target fish unselected when opened without an explicit fish", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 1280
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 720
    });

    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage
    } as unknown as CanvasRenderingContext2D);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(new Blob(["image"], { type: "image/jpeg" })));

    const { rerender } = render(
      <ShareStudio
        fish={null}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landingsWithSpecies}
        openComposerNonce={0}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    rerender(
      <ShareStudio
        fish={null}
        fishTypeOptions={["saba", "aji", "iwashi"]}
        landings={landingsWithSpecies}
        openComposerNonce={1}
        onOpenXIntent={async () => true}
        onComplete={() => undefined}
      />
    );

    expect((await screen.findAllByText("対象の魚: 未選択")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "カメラを開く" }));
    fireEvent.touchEnd(await screen.findByLabelText("撮影"));
    await waitFor(() => expect(screen.getByRole("button", { name: "この写真で次へ" })).toBeEnabled());

    getContext.mockRestore();
    toBlob.mockRestore();
  });
});
