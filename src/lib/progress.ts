import type { BadgeRecord, Fish } from "../types";

export function computeMaxCoveredPercentile(badges: BadgeRecord[], fishList: Fish[]): number {
  if (!badges.length || !fishList.length) return 0;

  const fishById = new Map(fishList.map((fish) => [fish.id, fish]));
  const values = badges
    .map((badge) => fishById.get(badge.fishId)?.percentile)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);

  if (!values.length) return 0;

  // MVP: min-max到達方式。将来的に厳密連続区間判定へ差し替え可能。
  let currentMax = values[0];
  for (const value of values) {
    if (value > currentMax) {
      currentMax = value;
    }
  }
  return Math.max(0, Math.min(100, Math.round(currentMax)));
}
