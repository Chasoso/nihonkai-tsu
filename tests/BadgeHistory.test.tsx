import { render, screen, within } from "@testing-library/react";
import { BadgeHistory } from "../src/components/BadgeHistory";
import type { BadgeRecord, Fish } from "../src/types";

const fishList: Fish[] = [
  {
    id: "buri",
    name: "ブリ",
    category: "回遊",
    trend: "up",
    percentile: 86,
    microcopy: "脂のりがよく、冬に人気の魚。",
    share: { badgeLabel: "ブリ通", text: "今日はブリを味わいました。" }
  },
  {
    id: "aji",
    name: "アジ",
    category: "回遊",
    trend: "flat",
    percentile: 52,
    microcopy: "通年で親しまれる魚。",
    share: { badgeLabel: "アジ通", text: "今日はアジを味わいました。" }
  }
];

describe("BadgeHistory", () => {
  it("対象年のバッジのみを新しい順に表示する", () => {
    const badges: BadgeRecord[] = [
      { year: 2026, fishId: "buri", category: "回遊", earnedAt: "2026-03-01T09:00:00.000Z" },
      { year: 2025, fishId: "aji", category: "回遊", earnedAt: "2025-12-01T09:00:00.000Z" },
      { year: 2026, fishId: "aji", category: "回遊", earnedAt: "2026-03-02T09:00:00.000Z" }
    ];

    render(<BadgeHistory badges={badges} fishList={fishList} year={2026} />);

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("アジ通")).toBeInTheDocument();
    expect(within(items[1]).getByText("ブリ通")).toBeInTheDocument();
  });

  it("該当年バッジがない場合はリストを表示しない", () => {
    render(<BadgeHistory badges={[]} fishList={fishList} year={2026} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("fishList に存在しない fishId はフォールバックラベルで表示する", () => {
    const badges: BadgeRecord[] = [
      { year: 2026, fishId: "unknown", category: "不明", earnedAt: "2026-03-03T09:00:00.000Z" }
    ];

    render(<BadgeHistory badges={badges} fishList={fishList} year={2026} />);

    expect(screen.getByText(/2026 unknown/)).toBeInTheDocument();
  });
});
