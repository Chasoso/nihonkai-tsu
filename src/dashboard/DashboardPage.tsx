import brandLogo from "../assets/nihonkai_tsu.png";
import type { DashboardMetrics } from "../lib/dashboardMetrics";

interface DashboardPageProps {
  rangeKey: "today" | "7d" | "30d";
  onRangeChange: (value: "today" | "7d" | "30d") => void;
  dateFrom: string;
  dateTo: string;
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
}

const CHART_WIDTH = 620;
const CHART_SVG_HEIGHT = 240;
const CHART_PADDING_X = 28;
const CHART_PADDING_TOP = 16;
const CHART_PLOT_HEIGHT = 164;
const CHART_LABEL_Y = 206;

function formatDateLabel(dateJst: string): string {
  return dateJst.slice(5).replace("-", "/");
}

function maxCount(points: DashboardMetrics["dailyCounts"]): number {
  return points.reduce((max, item) => Math.max(max, item.count), 0);
}

function buildChartPoint(index: number, total: number, count: number, maxYValue: number) {
  const drawableWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const centeredX = CHART_PADDING_X + drawableWidth / 2;
  if (total <= 1) {
    const safeMaxYValue = Math.max(maxYValue, 1);
    const y = CHART_PADDING_TOP + CHART_PLOT_HEIGHT - (count / safeMaxYValue) * CHART_PLOT_HEIGHT;
    return { x: centeredX, y };
  }

  const step = total > 1 ? drawableWidth / (total - 1) : 0;
  const x = CHART_PADDING_X + step * index;
  const safeMaxYValue = Math.max(maxYValue, 1);
  const y = CHART_PADDING_TOP + CHART_PLOT_HEIGHT - (count / safeMaxYValue) * CHART_PLOT_HEIGHT;
  return { x, y };
}

function buildLinePath(points: DashboardMetrics["dailyCounts"], maxYValue: number): string {
  if (points.length === 0) return "";

  return points
    .map((point, index) => {
      const { x, y } = buildChartPoint(index, points.length, point.count, maxYValue);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildLabelIndices(total: number): Set<number> {
  if (total <= 0) return new Set<number>();
  if (total <= 5) return new Set(Array.from({ length: total }, (_, index) => index));

  const drawableWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const minLabelSpacing = 72;
  const maxLabels = Math.max(2, Math.floor(drawableWidth / minLabelSpacing) + 1);
  const step = Math.max(1, Math.ceil((total - 1) / (maxLabels - 1)));
  const indices = new Set<number>();

  for (let index = 0; index < total; index += step) {
    indices.add(index);
  }

  indices.add(total - 1);
  return indices;
}

export function DashboardPage({
  rangeKey,
  onRangeChange,
  dateFrom,
  dateTo,
  metrics,
  loading,
  error
}: DashboardPageProps) {
  const points = metrics?.dailyCounts ?? [];
  const peak = Math.max(maxCount(points), 1);
  const maxYValue = Math.max(1, Math.ceil(peak * 1.1));
  const linePath = buildLinePath(points, maxYValue);
  const labelIndices = buildLabelIndices(points.length);
  const topFish = metrics?.topFish;
  const fishCounts = metrics?.fishCounts ?? [];

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <div className="dashboard-brand-row">
            <img src={brandLogo} alt="" className="dashboard-brand-logo" aria-hidden="true" />
            <span className="dashboard-brand-name">Nihonkai Tsu</span>
          </div>
          <p className="dashboard-eyebrow">KPI Dashboard</p>
          <h1>投稿ダッシュボード</h1>
          <p className="dashboard-subtitle">日別の投稿数と、よく投稿されている魚種をまとめて確認できます。</p>
        </div>
        <a className="dashboard-back-link" href="/nihonkai-tsu/">
          投稿アプリに戻る
        </a>
      </header>

      <section className="dashboard-toolbar">
        <div className="dashboard-range-group" role="tablist" aria-label="期間選択">
          <button className={rangeKey === "today" ? "dashboard-range-active" : ""} onClick={() => onRangeChange("today")}>
            今日
          </button>
          <button className={rangeKey === "7d" ? "dashboard-range-active" : ""} onClick={() => onRangeChange("7d")}>
            7日
          </button>
          <button className={rangeKey === "30d" ? "dashboard-range-active" : ""} onClick={() => onRangeChange("30d")}>
            30日
          </button>
        </div>
        <p className="dashboard-range-caption">
          集計期間: {dateFrom} - {dateTo}
        </p>
      </section>

      {error ? <div className="dashboard-error">{error}</div> : null}

      <section className="dashboard-kpi-grid">
        <article className="dashboard-kpi-card">
          <span>期間内投稿数</span>
          <strong>{metrics?.summary.total ?? 0}</strong>
        </article>
        <article className="dashboard-kpi-card">
          <span>今日の投稿数</span>
          <strong>{metrics?.summary.today ?? 0}</strong>
        </article>
        <article className="dashboard-kpi-card">
          <span>直近7日の投稿数</span>
          <strong>{metrics?.summary.thisWeek ?? 0}</strong>
        </article>
        <article className="dashboard-kpi-card">
          <span>最多投稿の魚種</span>
          <strong>{topFish ? topFish.fishLabel : "-"}</strong>
          <small>{topFish ? `${topFish.count}件` : "データなし"}</small>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h2>日別投稿数</h2>
            <p>期間内の投稿体験の推移</p>
          </div>
          <div className="dashboard-chart-card">
            {loading ? (
              <div className="dashboard-empty">集計データを読み込み中です。</div>
            ) : points.length === 0 ? (
              <div className="dashboard-empty">表示できる集計データがありません。</div>
            ) : (
              <svg className="dashboard-line-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_SVG_HEIGHT}`} aria-label="日別投稿数グラフ">
                {[0.25, 0.5, 0.75].map((ratio) => {
                  const y = CHART_PADDING_TOP + CHART_PLOT_HEIGHT * ratio;
                  return (
                    <path
                      key={ratio}
                      className="dashboard-line-chart-grid"
                      d={`M ${CHART_PADDING_X} ${y} L ${CHART_WIDTH - CHART_PADDING_X} ${y}`}
                    />
                  );
                })}
                <path className="dashboard-line-chart-line" d={linePath} />
                {points.map((point, index) => {
                  const { x, y } = buildChartPoint(index, points.length, point.count, maxYValue);
                  return <circle key={point.dateJst} className="dashboard-line-chart-dot" cx={x} cy={y} r="5" />;
                })}
                {points.map((point, index) => {
                  if (!labelIndices.has(index)) return null;

                  const { x } = buildChartPoint(index, points.length, point.count, maxYValue);
                  return (
                    <text key={point.dateJst} className="dashboard-line-chart-label" x={x} y={CHART_LABEL_Y} textAnchor="middle">
                      {formatDateLabel(point.dateJst)}
                    </text>
                  );
                })}
              </svg>
            )}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h2>魚種別投稿数</h2>
            <p>期間内で投稿数が多かった魚種</p>
          </div>
          <div className="dashboard-ranking-card">
            {loading ? (
              <div className="dashboard-empty">集計データを読み込み中です。</div>
            ) : fishCounts.length === 0 ? (
              <div className="dashboard-empty">表示できる魚種データがありません。</div>
            ) : (
              <ol className="dashboard-ranking-list">
                {fishCounts.slice(0, 10).map((item, index) => (
                  <li key={item.fishId} className="dashboard-ranking-item">
                    <span className="dashboard-ranking-rank">{index + 1}</span>
                    <span className="dashboard-ranking-name">{item.fishLabel || item.fishId}</span>
                    <strong className="dashboard-ranking-count">{item.count}件</strong>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
