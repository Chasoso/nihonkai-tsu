import type { LandingsData } from "../types";

export const SEASON_THRESHOLD = 1.2;
export const TOP_SEASON_FISH_LIMIT = 5;

export interface SpeciesSeasonality {
  id: string;
  name: string;
  avgByMonth: number[];
  avgAll: number;
  indexByMonth: number[];
  isSeasonByMonth: boolean[];
}

export function computeSeasonalityBySpecies(
  landings: LandingsData,
  threshold = SEASON_THRESHOLD
): SpeciesSeasonality[] {
  const years = landings.meta.range_years;
  const yearCount = Math.max(1, years.length);

  return landings.species.map((species) => {
    const valueByYearMonth = new Map<string, number>();
    species.monthly.forEach((entry) => {
      valueByYearMonth.set(`${entry.year}-${entry.m}`, entry.value);
    });

    const avgByMonth = Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const total = years.reduce((sum, year) => sum + (valueByYearMonth.get(`${year}-${month}`) ?? 0), 0);
      return total / yearCount;
    });

    const avgAll = avgByMonth.reduce((sum, value) => sum + value, 0) / 12;
    const indexByMonth = avgByMonth.map((avg) => (avgAll > 0 ? avg / avgAll : 0));
    const isSeasonByMonth = indexByMonth.map((index) => index >= threshold);

    return {
      id: species.id,
      name: species.name_ja,
      avgByMonth,
      avgAll,
      indexByMonth,
      isSeasonByMonth
    };
  });
}

export function getTopSeasonFishIdsByMonth(
  seasonalityList: SpeciesSeasonality[],
  month: number,
  limit = TOP_SEASON_FISH_LIMIT
): string[] {
  const monthIndex = Math.min(11, Math.max(0, month - 1));

  return seasonalityList
    .filter((species) => species.isSeasonByMonth[monthIndex])
    .sort((a, b) => b.avgByMonth[monthIndex] - a.avgByMonth[monthIndex])
    .slice(0, limit)
    .map((species) => species.id);
}

