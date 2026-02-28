import type { BadgeRecord, Fish } from "../types";

export const BADGES_STORAGE_KEY = "nihonkai_badges";

function safeParse(input: string | null): BadgeRecord[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input) as BadgeRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item?.year === "number" &&
        typeof item?.fishId === "string" &&
        typeof item?.category === "string" &&
        typeof item?.earnedAt === "string"
    );
  } catch {
    return [];
  }
}

export function getBadges(): BadgeRecord[] {
  return safeParse(localStorage.getItem(BADGES_STORAGE_KEY));
}

export function earnBadge(year: number, fish: Fish): { added: boolean; badges: BadgeRecord[] } {
  const badges = getBadges();
  const exists = badges.some((item) => item.year === year && item.fishId === fish.id);
  if (exists) {
    return { added: false, badges };
  }

  const nextBadge: BadgeRecord = {
    year,
    fishId: fish.id,
    category: fish.category,
    earnedAt: new Date().toISOString()
  };

  const next = [...badges, nextBadge];
  localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(next));
  return { added: true, badges: next };
}
