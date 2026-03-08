import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FishModal } from "../src/components/FishModal";
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

describe("FishModal", () => {
  it("fish が null のときは描画しない", () => {
    const { container } = render(<FishModal fish={null} onClose={() => undefined} onSelectForShare={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("投稿ボタン押下で onSelectForShare と onClose を呼ぶ", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSelectForShare = vi.fn();

    render(<FishModal fish={fishFixture} onClose={onClose} onSelectForShare={onSelectForShare} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[1]);

    expect(onSelectForShare).toHaveBeenCalledTimes(1);
    expect(onSelectForShare).toHaveBeenCalledWith(fishFixture);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("閉じるボタン押下で onClose を呼ぶ", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<FishModal fish={fishFixture} onClose={onClose} onSelectForShare={() => undefined} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
