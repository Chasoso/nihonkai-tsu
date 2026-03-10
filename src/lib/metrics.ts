export type MetricType = "copy" | "x_click";
export interface MetricsSummary {
  totalToday: number;
  currentOrder: number;
  topFishThisWeek: {
    fishId: string;
    fishLabel: string;
    count: number;
  } | null;
  fishCountToday: number | null;
}

interface TrackMetricParams {
  apiUrl: string;
  metricType: MetricType;
  fishId: string;
  fishLabel: string;
  selectedVariant: "short" | "standard" | "pr";
}

interface GetMetricsSummaryParams {
  apiUrl: string;
  fishId?: string;
}

export async function trackMetric({ apiUrl, metricType, fishId, fishLabel, selectedVariant }: TrackMetricParams): Promise<boolean> {
  if (!apiUrl.trim()) return false;
  if (!fishId.trim()) return false;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "track_metric",
        metric_type: metricType,
        fish_id: fishId,
        fish_label: fishLabel,
        selected_variant: selectedVariant
      })
    });
    if (!response.ok) return false;
    const json = (await response.json()) as { status?: string };
    return json.status === "ok";
  } catch {
    // Fire-and-forget metric tracking: do not block user actions on failure.
    return false;
  }
}

export async function getMetricsSummary({ apiUrl, fishId }: GetMetricsSummaryParams): Promise<MetricsSummary | null> {
  if (!apiUrl.trim()) return null;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "get_metrics_summary",
        fish_id: fishId?.trim() || undefined
      })
    });
    if (!response.ok) return null;

    const json = (await response.json()) as {
      total_today?: unknown;
      current_order?: unknown;
      top_fish_this_week?: { fish_id?: unknown; fish_label?: unknown; count?: unknown } | null;
      fish_count_today?: unknown;
    };

    return {
      totalToday: Number(json.total_today || 0),
      currentOrder: Number(json.current_order || 0),
      topFishThisWeek: json.top_fish_this_week
        ? {
            fishId: String(json.top_fish_this_week.fish_id || ""),
            fishLabel: String(json.top_fish_this_week.fish_label || ""),
            count: Number(json.top_fish_this_week.count || 0)
          }
        : null,
      fishCountToday:
        json.fish_count_today === null || typeof json.fish_count_today === "undefined"
          ? null
          : Number(json.fish_count_today || 0)
    };
  } catch {
    return null;
  }
}
