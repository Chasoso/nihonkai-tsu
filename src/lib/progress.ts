import type { BadgeRecord, Fish } from "../types";

export function computeEarnedSharePercent(badges: BadgeRecord[], fishList: Fish[]): number {
  if (!badges.length || !fishList.length) return 0;

  const fishById = new Map(fishList.map((fish) => [fish.id, fish]));
  const earnedShare = badges.reduce((sum, badge) => sum + (fishById.get(badge.fishId)?.percentile ?? 0), 0);

  return Math.max(0, Math.min(100, Number(earnedShare.toFixed(1))));
}
