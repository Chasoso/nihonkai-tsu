import { render, screen } from "@testing-library/react";
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

    expect(await screen.findByText("1/3 Photo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2/3 Confirm fish" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "3/3 Post" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate post text" })).toBeDisabled();
  });
});
