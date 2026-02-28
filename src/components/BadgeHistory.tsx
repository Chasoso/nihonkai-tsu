import type { BadgeRecord, Fish } from "../types";

interface BadgeHistoryProps {
  badges: BadgeRecord[];
  fishList: Fish[];
  year: number;
}

export function BadgeHistory({ badges, fishList, year }: BadgeHistoryProps) {
  const fishById = new Map(fishList.map((fish) => [fish.id, fish]));

  return (
    <section id="badge-history" className="section">
      <h2>通履歴</h2>
      {!badges.length ? (
        <p>まだ通はありません。投稿して最初の称号を獲得してください。</p>
      ) : (
        <ul className="history-list">
          {badges
            .filter((badge) => badge.year === year)
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
