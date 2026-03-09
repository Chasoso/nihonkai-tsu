import type { BadgeRecord, Fish } from "../types";

interface BadgeHistoryProps {
  badges: BadgeRecord[];
  fishList: Fish[];
  year: number;
}

export function BadgeHistory({ badges, fishList, year }: BadgeHistoryProps) {
  const fishById = new Map(fishList.map((fish) => [fish.id, fish]));
  const yearBadges = badges.filter((badge) => badge.year === year);
  const earnedCount = yearBadges.length;
  const totalFish = Math.max(1, fishList.length);
  const earnedRatio = earnedCount / totalFish;

  const levels = [
    { key: "basic", label: "Basic", minRatio: 0 },
    { key: "silver", label: "Silver", minRatio: 0.2 },
    { key: "gold", label: "Gold", minRatio: 0.5 }
  ] as const;

  const currentLevelIndex = levels.reduce((best, level, idx) => (earnedRatio >= level.minRatio ? idx : best), 0);
  const currentLevel = levels[currentLevelIndex];
  const nextLevel = levels[currentLevelIndex + 1] ?? null;

  const levelProgressPercent = (() => {
    if (!nextLevel) return 100;
    const levelRange = Math.max(0.0001, nextLevel.minRatio - currentLevel.minRatio);
    const withinLevel = (earnedRatio - currentLevel.minRatio) / levelRange;
    return Math.max(0, Math.min(100, Math.round(withinLevel * 100)));
  })();

  return (
    <section id="badge-history" className="section">
      <h2>通履歴</h2>
      <article className="card tsu-level-card" aria-label="通バッジレベル">
        <h3>Your Tsu Level</h3>
        <div className="tsu-level-grid">
          <div className="tsu-level-item">
            <p>現在のバッジ</p>
            <strong>{currentLevel.label}</strong>
          </div>
          <div className="tsu-level-item">
            <p>次のレベル</p>
            <strong>{nextLevel ? nextLevel.label : "MAX"}</strong>
          </div>
          <div className="tsu-level-item">
            <p>進捗</p>
            <strong>
              {earnedCount}/{totalFish}
            </strong>
          </div>
        </div>
        <div className="tsu-level-progress-shell" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelProgressPercent}>
          <div className="tsu-level-progress-bar" style={{ width: `${levelProgressPercent}%` }} />
        </div>
      </article>
      {!badges.length ? (
        <p>まだ通はありません。投稿して最初の称号を獲得してください。</p>
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
