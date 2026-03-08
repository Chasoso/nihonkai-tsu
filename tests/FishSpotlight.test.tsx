import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FishSpotlight } from "../src/components/FishSpotlight";
import type { Fish } from "../src/types";

const fishFixture: Fish = {
  id: "buri",
  name: "ブリ",
  category: "回遊",
  trend: "up",
  percentile: 86,
  microcopy: "脂のりがよく、冬に人気の魚。",
  share: {
    badgeLabel: "ブリ通",
    text: "今日はブリを味わいました。"
  }
};

describe("FishSpotlight", () => {
  it("魚情報を表示して、詳細ボタンでコールバックを呼ぶ", async () => {
    const user = userEvent.setup();
    const onOpenDetail = vi.fn();

    render(<FishSpotlight fish={fishFixture} onOpenDetail={onOpenDetail} />);

    expect(screen.getByRole("heading", { level: 3, name: "ブリ" })).toBeInTheDocument();
    expect(screen.getByText("脂のりがよく、冬に人気の魚。")).toBeInTheDocument();

    await user.click(screen.getByRole("button"));

    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledWith(fishFixture);
  });

  it("trend=down でも表示できる", () => {
    const fishDown: Fish = {
      ...fishFixture,
      id: "madai",
      name: "マダイ",
      trend: "down"
    };

    render(<FishSpotlight fish={fishDown} onOpenDetail={() => undefined} />);

    expect(screen.getByRole("heading", { level: 3, name: "マダイ" })).toBeInTheDocument();
  });

  it("trend=flat でも表示できる", () => {
    const fishFlat: Fish = {
      ...fishFixture,
      id: "aji",
      name: "アジ",
      trend: "flat"
    };

    render(<FishSpotlight fish={fishFlat} onOpenDetail={() => undefined} />);

    expect(screen.getByRole("heading", { level: 3, name: "アジ" })).toBeInTheDocument();
  });
});
