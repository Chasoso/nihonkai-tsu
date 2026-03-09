export type MetricType = "copy" | "x_click";

interface TrackMetricParams {
  apiUrl: string;
  metricType: MetricType;
  fishId: string;
  fishLabel: string;
  selectedVariant: "short" | "standard" | "pr";
}

export async function trackMetric({ apiUrl, metricType, fishId, fishLabel, selectedVariant }: TrackMetricParams): Promise<void> {
  if (!apiUrl.trim()) return;
  if (!fishId.trim()) return;

  try {
    await fetch(apiUrl, {
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
  } catch {
    // Fire-and-forget metric tracking: do not block user actions on failure.
  }
}
