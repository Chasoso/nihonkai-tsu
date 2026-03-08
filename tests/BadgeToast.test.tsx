import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BadgeToast } from "../src/components/BadgeToast";

describe("BadgeToast", () => {
  it("visible=true で表示用クラスが付く", () => {
    const { container } = render(
      <BadgeToast visible={true} message="バッジを獲得" onClose={() => undefined} onViewHistory={() => undefined} />
    );

    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("toast");
    expect(aside).toHaveClass("toast-visible");
    expect(screen.getByText("バッジを獲得")).toBeInTheDocument();
  });

  it("ボタン押下でコールバックを呼ぶ", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onViewHistory = vi.fn();

    render(<BadgeToast visible={false} message="msg" onClose={onClose} onViewHistory={onViewHistory} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(buttons[1]);

    expect(onViewHistory).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
