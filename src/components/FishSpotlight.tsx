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
    <section className="section" id="spotlight">
      <h2>主役魚</h2>
      <article className="card spotlight-card">
        <h3>{fish.name}</h3>
        <p>{fish.microcopy}</p>
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
        <button onClick={() => onOpenDetail(fish)}>詳しく見る</button>
      </article>
    </section>
  );
}
