import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Hero } from "../src/components/Hero";

describe("Hero", () => {
  it("投稿中心の見出しとCTAを表示する", () => {
    render(<Hero year={2026} />);

    expect(screen.getByText("Nihonkai Tsu 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "石川の魚を撮って投稿しよう" })).toBeInTheDocument();
    expect(screen.getByText("写真を選ぶだけで、投稿文と画像を作ってそのままX投稿に進めます。")).toBeInTheDocument();
  });

  it("CTAクリックで onStartPost を呼ぶ", async () => {
    const user = userEvent.setup();
    const onStartPost = vi.fn();

    render(<Hero year={2026} onStartPost={onStartPost} />);

    await user.click(screen.getByRole("button", { name: "写真を撮って投稿文を作る" }));
    expect(onStartPost).toHaveBeenCalledTimes(1);
  });
});
