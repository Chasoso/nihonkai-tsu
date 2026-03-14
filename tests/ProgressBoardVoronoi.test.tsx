import { render, screen } from "@testing-library/react";
import { ProgressBoardVoronoi } from "../src/components/ProgressBoardVoronoi";
import type { Category, Fish } from "../src/types";

const categories: Category[] = [
  { id: "trend", label: "旬", description: "desc" },
  { id: "classic", label: "定番", description: "desc" }
];

const fish: Fish[] = [
  {
    id: "buri",
    name: "ブリ",
    category: "trend",
    trend: "up",
    percentile: 40,
    microcopy: "text",
    share: { badgeLabel: "ブリ通", text: "text" }
  },
  {
    id: "aji",
    name: "アジ",
    category: "classic",
    trend: "flat",
    percentile: 20,
    microcopy: "text",
    share: { badgeLabel: "アジ通", text: "text" }
  }
];

describe("ProgressBoardVoronoi", () => {
  it("累積漁獲量シェアを表示し、獲得魚だけを強調する", () => {
    const { container } = render(
      <ProgressBoardVoronoi
        fish={fish}
        categories={categories}
        earnedFishIds={new Set(["buri"])}
        earnedSharePercent={40}
        onOpenFish={() => undefined}
      />
    );

    expect(screen.getByText("累計で漁獲量シェア 40.0% を味わった")).toBeInTheDocument();

    const polygons = Array.from(container.querySelectorAll("polygon"));
    expect(polygons).toHaveLength(2);
    expect(polygons[0]).toHaveAttribute("fill", "#1d4ed8");
    expect(polygons[1]).toHaveAttribute("fill", "#dce7f5");
  });
});
