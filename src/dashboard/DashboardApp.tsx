import { useEffect, useMemo, useState } from "react";
import { DashboardPage } from "./DashboardPage";
import { getDashboardMetrics, type DashboardMetrics } from "../lib/dashboardMetrics";

type RangeKey = "today" | "7d" | "30d";

function getJstDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getRange(rangeKey: RangeKey): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = getJstDateString(now);
  const offset = rangeKey === "today" ? 0 : rangeKey === "7d" ? 6 : 29;
  const dateFrom = getJstDateString(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000));
  return { dateFrom, dateTo };
}

export function DashboardApp() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { dateFrom, dateTo } = useMemo(() => getRange(rangeKey), [rangeKey]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);

    getDashboardMetrics({ dateFrom, dateTo })
      .then((result) => {
        if (disposed) return;
        if (!result) {
          setError("KPI集計を取得できませんでした。");
          setMetrics(null);
          return;
        }
        setMetrics(result);
      })
      .catch(() => {
        if (disposed) return;
        setError("KPI集計を取得できませんでした。");
        setMetrics(null);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [dateFrom, dateTo]);

  return (
    <DashboardPage
      rangeKey={rangeKey}
      onRangeChange={setRangeKey}
      dateFrom={dateFrom}
      dateTo={dateTo}
      metrics={metrics}
      loading={loading}
      error={error}
    />
  );
}
