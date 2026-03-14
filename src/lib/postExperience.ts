import { getMetricsSummary, trackMetric, type MetricType, type MetricsSummary } from "./metrics";

interface RecordPostExperienceParams {
  apiUrl: string;
  metricType: MetricType;
  fishId: string;
  fishLabel: string;
  selectedVariant: "short" | "standard" | "pr";
  alreadyCompleted: boolean;
  completedFishId?: string;
  onComplete: (completedFishId?: string) => void;
  onMarkCompleted: () => void;
  onSummary: (summary: MetricsSummary) => void;
  onPostExperience?: (metricType: MetricType, summary?: MetricsSummary | null) => void;
  trackMetricImpl?: typeof trackMetric;
  getMetricsSummaryImpl?: typeof getMetricsSummary;
}

export async function recordPostExperience({
  apiUrl,
  metricType,
  fishId,
  fishLabel,
  selectedVariant,
  alreadyCompleted,
  completedFishId,
  onComplete,
  onMarkCompleted,
  onSummary,
  onPostExperience,
  trackMetricImpl = trackMetric,
  getMetricsSummaryImpl = getMetricsSummary
}: RecordPostExperienceParams): Promise<boolean> {
  const tracked = await trackMetricImpl({
    apiUrl,
    metricType,
    fishId,
    fishLabel,
    selectedVariant
  });
  if (!tracked) return false;

  if (!alreadyCompleted) {
    onMarkCompleted();
    onComplete(completedFishId);
  }

  const summary = await getMetricsSummaryImpl({
    apiUrl,
    fishId
  });

  if (summary) {
    onSummary(summary);
    onPostExperience?.(metricType, summary);
    return true;
  }

  onPostExperience?.(metricType);
  return true;
}
