import { render, screen } from "@testing-library/react";
import { Hero } from "../src/components/Hero";

describe("Hero", () => {
  it("年と見出し・サブラインを表示する", () => {
    render(<Hero headline="変わる海を、味わう。" subline="2026年度 日本海の旬" year={2026} />);

    expect(screen.getByText("Nihonkai Tsu 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "変わる海を、味わう。" })).toBeInTheDocument();
    expect(screen.getByText("2026年度 日本海の旬")).toBeInTheDocument();
  });
});

