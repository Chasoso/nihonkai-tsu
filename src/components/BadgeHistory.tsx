import type { BadgeRecord, Fish } from "../types";
import basicLevelIcon from "../assets/tsu-level/basic.png";
import silverLevelIcon from "../assets/tsu-level/silver.png";
import goldLevelIcon from "../assets/tsu-level/gold.png";

interface BadgeHistoryProps {
  badges: BadgeRecord[];
  fishList: Fish[];
  year: number;
  earnedSharePercent: number;
}

export function BadgeHistory({ badges, fishList, year, earnedSharePercent }: BadgeHistoryProps) {
  const fishById = new Map(fishList.map((fish) => [fish.id, fish]));
  const yearBadges = badges.filter((badge) => badge.year === year);

  const levels = [
    { key: "basic", label: "Basic", minShare: 0 },
    { key: "silver", label: "Silver", minShare: 20 },
    { key: "gold", label: "Gold", minShare: 50 }
  ] as const;

  const currentLevelIndex = levels.reduce((best, level, idx) => (earnedSharePercent >= level.minShare ? idx : best), 0);
  const currentLevel = levels[currentLevelIndex];
  const nextLevel = levels[currentLevelIndex + 1] ?? null;
  const levelIconMap = {
    basic: basicLevelIcon,
    silver: silverLevelIcon,
    gold: goldLevelIcon
  } as const;

  const levelProgressPercent = (() => {
    if (!nextLevel) return 100;
    const levelRange = Math.max(0.0001, nextLevel.minShare - currentLevel.minShare);
    const withinLevel = (earnedSharePercent - currentLevel.minShare) / levelRange;
    return Math.max(0, Math.min(100, Math.round(withinLevel * 100)));
  })();

  return (
    <section id="badge-history" className="section">
      <h2>バッジ履歴</h2>
      <article className="card tsu-level-card" aria-label="通レベル">
        <h3>あなたの通レベル</h3>
        <div className="tsu-level-hero">
          <img
            className="tsu-level-icon"
            src={levelIconMap[currentLevel.key]}
            alt={`${currentLevel.label}レベルのアイコン`}
            loading="lazy"
          />
          <div className="tsu-level-hero-copy">
            <p className="tsu-level-eyebrow">現在のランク</p>
            <strong>{currentLevel.label}</strong>
          </div>
        </div>
        <div className="tsu-level-grid">
          <div className="tsu-level-item">
            <p>現在のレベル</p>
            <strong>{currentLevel.label}</strong>
          </div>
          <div className="tsu-level-item">
            <p>次のレベル</p>
            <strong>{nextLevel ? nextLevel.label : "最高ランク"}</strong>
          </div>
          <div className="tsu-level-item">
            <p>累計シェア</p>
            <strong>{earnedSharePercent.toFixed(1)}%</strong>
          </div>
        </div>
        <div
          className="tsu-level-progress-shell"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={levelProgressPercent}
        >
          <div className="tsu-level-progress-bar" style={{ width: `${levelProgressPercent}%` }} />
        </div>
      </article>
      {!badges.length ? (
        <p>まだバッジはありません。投稿して魚の通バッジを集めてください。</p>
      ) : (
        <ul className="history-list">
          {yearBadges
            .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
            .map((badge) => {
              const fish = fishById.get(badge.fishId);
              return (
                <li key={`${badge.year}-${badge.fishId}`}>
                  <strong>{fish?.share.badgeLabel ?? `${badge.year} ${badge.fishId}通`}</strong>
                  <span>{new Date(badge.earnedAt).toLocaleString("ja-JP")}</span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}
