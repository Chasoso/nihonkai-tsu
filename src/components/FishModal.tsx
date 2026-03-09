import { useMemo } from "react";
import type { Fish, LandingsData } from "../types";

interface FishModalProps {
  fish: Fish | null;
  landings?: LandingsData | null;
  onClose: () => void;
  onSelectForShare: (fish: Fish) => void;
}

function trendLabel(trend: Fish["trend"]) {
  if (trend === "up") return "上昇";
  if (trend === "down") return "下降";
  return "横ばい";
}

function categoryLabel(category: string): string {
  if (category === "trend") return "旬";
  if (category === "discovery") return "発見";
  if (category === "classic") return "王道";
  return category;
}

function buildSeasonIndexByMonth(landings: LandingsData | null | undefined, fishId: string): number[] {
  const species = landings?.species.find((item) => item.id === fishId);
  if (!species) return [];

  const totals = Array.from({ length: 12 }, () => 0);
  const counts = Array.from({ length: 12 }, () => 0);
  species.monthly.forEach((entry) => {
    const idx = entry.m - 1;
    if (idx < 0 || idx > 11) return;
    totals[idx] += entry.value;
    counts[idx] += 1;
  });

  const monthlyAvg = totals.map((total, idx) => (counts[idx] > 0 ? total / counts[idx] : 0));
  const avgAll = monthlyAvg.reduce((sum, value) => sum + value, 0) / 12;
  if (avgAll <= 0) return Array.from({ length: 12 }, () => 0);
  return monthlyAvg.map((value) => value / avgAll);
}

function recommendDishes(fishName: string): string[] {
  const name = fishName.toLowerCase();
  if (name.includes("イカ")) return ["刺身", "バター醤油炒め", "天ぷら"];
  if (name.includes("エビ") || name.includes("ガニ")) return ["刺身", "塩ゆで", "味噌汁"];
  if (name.includes("サバ") || name.includes("イワシ")) return ["塩焼き", "炙り刺し", "つみれ汁"];
  if (name.includes("ブリ")) return ["刺身", "照り焼き", "しゃぶしゃぶ"];
  if (name.includes("ノドグロ")) return ["塩焼き", "炙り寿司", "煮付け"];
  return ["刺身", "塩焼き", "煮付け"];
}

export function FishModal({ fish, landings = null, onClose, onSelectForShare }: FishModalProps) {
  if (!fish) return null;

  const seasonIndexByMonth = useMemo(() => buildSeasonIndexByMonth(landings, fish.id), [landings, fish.id]);
  const dishes = useMemo(() => recommendDishes(fish.name), [fish.name]);
  const peakMonth = useMemo(() => {
    if (!seasonIndexByMonth.length) return null;
    let bestIndex = 0;
    let bestValue = seasonIndexByMonth[0];
    seasonIndexByMonth.forEach((value, idx) => {
      if (value > bestValue) {
        bestValue = value;
        bestIndex = idx;
      }
    });
    return bestIndex + 1;
  }, [seasonIndexByMonth]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal fish-detail-modal">
        <button className="close-button" onClick={onClose} aria-label="閉じる">
          ×
        </button>
        <div className="fish-detail-grid">
          <div className="fish-detail-hero card">
            <div className="fish-detail-image" aria-label={`${fish.name}の画像`}>
              <span className="fish-detail-emoji">🐟</span>
            </div>
            <div>
              <h3 className="fish-detail-title">{fish.name}</h3>
              <p className="fish-detail-copy">{fish.microcopy}</p>
              <div className="fish-detail-meta">
                <span>カテゴリ: {categoryLabel(fish.category)}</span>
                <span>トレンド: {trendLabel(fish.trend)}</span>
                <span>レア帯: 上位{fish.percentile}%</span>
              </div>
            </div>
          </div>

          <section className="card fish-detail-section">
            <h4>旬グラフ</h4>
            {seasonIndexByMonth.length ? (
              <>
                <div className="season-mini-graph" aria-label="月別旬グラフ">
                  {seasonIndexByMonth.map((value, idx) => (
                    <div key={idx} className="season-mini-bar-wrap" title={`${idx + 1}月 / 指数 ${value.toFixed(2)}`}>
                      <div className={`season-mini-bar ${peakMonth === idx + 1 ? "season-mini-bar-peak" : ""}`} style={{ height: `${Math.max(10, Math.min(100, value * 58))}%` }} />
                    </div>
                  ))}
                </div>
                <p className="fish-detail-note">ピーク月: {peakMonth}月</p>
              </>
            ) : (
              <p className="fish-detail-note">旬データは準備中です。</p>
            )}
          </section>

          <section className="card fish-detail-section">
            <h4>おすすめ料理</h4>
            <div className="dish-chip-list">
              {dishes.map((dish) => (
                <span key={dish} className="dish-chip">
                  {dish}
                </span>
              ))}
            </div>
          </section>
        </div>

        <div className="fish-detail-actions">
          <button
            className="fish-detail-eat-button"
            onClick={() => {
              onSelectForShare(fish);
              onClose();
            }}
          >
            食べた（投稿する）
          </button>
        </div>
      </div>
    </div>
  );
}
