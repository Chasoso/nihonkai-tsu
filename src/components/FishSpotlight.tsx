import type { Fish } from "../types";

interface FishSpotlightProps {
  fish: Fish;
  onOpenDetail: (fish: Fish) => void;
}

function trendLabel(trend: Fish["trend"]) {
  if (trend === "up") return "上昇";
  if (trend === "down") return "下降";
  return "横ばい";
}

export function FishSpotlight({ fish, onOpenDetail }: FishSpotlightProps) {
  return (
    <section className="section spotlight-section" id="spotlight">
      <h2 className="section-title">Featured Fish</h2>
      <article className="card spotlight-card">
        <h3 className="spotlight-name">{fish.name}</h3>
        <p className="spotlight-copy">{fish.microcopy}</p>
        <dl className="meta">
          <div>
            <dt>トレンド</dt>
            <dd>{trendLabel(fish.trend)}</dd>
          </div>
          <div>
            <dt>レア帯</dt>
            <dd>上位{fish.percentile}%</dd>
          </div>
        </dl>
        <button className="spotlight-action" onClick={() => onOpenDetail(fish)}>
          View
        </button>
      </article>
    </section>
  );
}
