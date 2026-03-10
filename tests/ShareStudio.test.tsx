import { fireEvent, render, screen } from "@testing-library/react";
import { ShareStudio } from "../src/components/ShareStudio";
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

describe("ShareStudio", () => {
  it("投稿フロー3ステップを表示し、未完了ステップを無効化する", async () => {
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
    expect(screen.queryByRole("button", { name: "投稿文を生成する" })).not.toBeInTheDocument();
  });

  it("カメラ起動時はプレビューを表示し、撮影前は次へを無効化する", async () => {
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
});
