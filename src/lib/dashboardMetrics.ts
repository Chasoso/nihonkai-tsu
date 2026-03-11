const DEFAULT_METRICS_API_URL = "/api/generate-post-text";

export interface DashboardSummary {
  total: number;
  today: number;
  thisWeek: number;
}

export interface DailyCountPoint {
  dateJst: string;
  count: number;
}

export interface FishCountItem {
  fishId: string;
  fishLabel: string;
  count: number;
}

export interface DashboardMetrics {
  summary: DashboardSummary;
  dailyCounts: DailyCountPoint[];
  fishCounts: FishCountItem[];
  topFish: FishCountItem | null;
}

export interface DashboardMetricsParams {
  apiUrl?: string;
  dateFrom: string;
  dateTo: string;
}

export function defaultDashboardApiUrl(): string {
  return String(import.meta.env.VITE_POST_TEXT_API_URL ?? DEFAULT_METRICS_API_URL).trim();
}

export async function getDashboardMetrics({
  apiUrl = defaultDashboardApiUrl(),
  dateFrom,
  dateTo
}: DashboardMetricsParams): Promise<DashboardMetrics | null> {
  if (!apiUrl.trim()) return null;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "get_dashboard_metrics",
        date_from: dateFrom,
        date_to: dateTo
      })
    });
    if (!response.ok) return null;

    const json = (await response.json()) as {
      total?: unknown;
      today?: unknown;
      this_week?: unknown;
      daily_counts?: Array<{ date_jst?: unknown; count?: unknown }>;
      fish_counts?: Array<{ fish_id?: unknown; fish_label?: unknown; count?: unknown }>;
      top_fish?: { fish_id?: unknown; fish_label?: unknown; count?: unknown } | null;
    };

    return {
      summary: {
        total: Number(json.total || 0),
        today: Number(json.today || 0),
        thisWeek: Number(json.this_week || 0)
      },
      dailyCounts: Array.isArray(json.daily_counts)
        ? json.daily_counts.map((item) => ({
            dateJst: String(item.date_jst || ""),
            count: Number(item.count || 0)
          }))
        : [],
      fishCounts: Array.isArray(json.fish_counts)
        ? json.fish_counts.map((item) => ({
            fishId: String(item.fish_id || ""),
            fishLabel: String(item.fish_label || ""),
            count: Number(item.count || 0)
          }))
        : [],
      topFish: json.top_fish
        ? {
            fishId: String(json.top_fish.fish_id || ""),
            fishLabel: String(json.top_fish.fish_label || ""),
            count: Number(json.top_fish.count || 0)
          }
        : null
    };
  } catch {
    return null;
  }
}
