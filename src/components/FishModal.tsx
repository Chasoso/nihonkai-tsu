import type { Fish } from "../types";

interface FishModalProps {
  fish: Fish | null;
  onClose: () => void;
  onSelectForShare: (fish: Fish) => void;
}

function trendLabel(trend: Fish["trend"]) {
  if (trend === "up") return "上昇";
  if (trend === "down") return "下降";
  return "横ばい";
}

export function FishModal({ fish, onClose, onSelectForShare }: FishModalProps) {
  if (!fish) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <button className="close-button" onClick={onClose} aria-label="閉じる">
          ×
        </button>
        <h3>{fish.name}</h3>
        <p>{fish.microcopy}</p>
        <ul>
          <li>カテゴリ: {fish.category}</li>
          <li>トレンド: {trendLabel(fish.trend)}</li>
          <li>レア帯: 上位{fish.percentile}%</li>
        </ul>
        <button
          onClick={() => {
            onSelectForShare(fish);
            onClose();
          }}
        >
          この魚で投稿する
        </button>
      </div>
    </div>
  );
}
