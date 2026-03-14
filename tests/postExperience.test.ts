import { recordPostExperience } from "../src/lib/postExperience";
import type { MetricsSummary } from "../src/lib/metrics";

describe("recordPostExperience", () => {
  const summary: MetricsSummary = {
    totalToday: 12,
    currentOrder: 4,
    topFishThisWeek: {
      fishId: "saba",
      fishLabel: "サバ",
      count: 7
    },
    fishCountToday: 2
  };

  it("記録失敗時は成功通知も完了処理も実行しない", async () => {
    const onComplete = vi.fn();
    const onMarkCompleted = vi.fn();
    const onSummary = vi.fn();
    const onPostExperience = vi.fn();

    const tracked = await recordPostExperience({
      apiUrl: "/api/metrics",
      metricType: "copy",
      fishId: "saba",
      fishLabel: "サバ",
      selectedVariant: "standard",
      alreadyCompleted: false,
      completedFishId: "saba",
      onComplete,
      onMarkCompleted,
      onSummary,
      onPostExperience,
      trackMetricImpl: vi.fn().mockResolvedValue(false),
      getMetricsSummaryImpl: vi.fn()
    });

    expect(tracked).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onMarkCompleted).not.toHaveBeenCalled();
    expect(onSummary).not.toHaveBeenCalled();
    expect(onPostExperience).not.toHaveBeenCalled();
  });

  it("記録成功時は完了処理を先走りさせず、通知は1回だけ送る", async () => {
    const onComplete = vi.fn();
    const onMarkCompleted = vi.fn();
    const onSummary = vi.fn();
    const onPostExperience = vi.fn();

    const tracked = await recordPostExperience({
      apiUrl: "/api/metrics",
      metricType: "copy",
      fishId: "saba",
      fishLabel: "サバ",
      selectedVariant: "standard",
      alreadyCompleted: false,
      completedFishId: "saba",
      onComplete,
      onMarkCompleted,
      onSummary,
      onPostExperience,
      trackMetricImpl: vi.fn().mockResolvedValue(true),
      getMetricsSummaryImpl: vi.fn().mockResolvedValue(summary)
    });

    expect(tracked).toBe(true);
    expect(onMarkCompleted).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("saba");
    expect(onSummary).toHaveBeenCalledTimes(1);
    expect(onSummary).toHaveBeenCalledWith(summary);
    expect(onPostExperience).toHaveBeenCalledTimes(1);
    expect(onPostExperience).toHaveBeenCalledWith("copy", summary);
  });

  it("集計取得に失敗しても成功通知は1回だけ送る", async () => {
    const onComplete = vi.fn();
    const onMarkCompleted = vi.fn();
    const onSummary = vi.fn();
    const onPostExperience = vi.fn();

    const tracked = await recordPostExperience({
      apiUrl: "/api/metrics",
      metricType: "x_click",
      fishId: "saba",
      fishLabel: "サバ",
      selectedVariant: "pr",
      alreadyCompleted: true,
      completedFishId: "saba",
      onComplete,
      onMarkCompleted,
      onSummary,
      onPostExperience,
      trackMetricImpl: vi.fn().mockResolvedValue(true),
      getMetricsSummaryImpl: vi.fn().mockResolvedValue(null)
    });

    expect(tracked).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onMarkCompleted).not.toHaveBeenCalled();
    expect(onSummary).not.toHaveBeenCalled();
    expect(onPostExperience).toHaveBeenCalledTimes(1);
    expect(onPostExperience).toHaveBeenCalledWith("x_click");
  });
});
