import type { AppData, LandingsData } from "../types";

const ALLOWED_TRENDS = new Set(["up", "down", "flat"]);

function validateData(data: AppData): AppData {
  data.fish.forEach((fish) => {
    if (!ALLOWED_TRENDS.has(fish.trend)) {
      throw new Error(`Invalid trend value for fish "${fish.id}"`);
    }
    if (fish.percentile < 0 || fish.percentile > 100) {
      throw new Error(`Invalid percentile for fish "${fish.id}"`);
    }
  });
  return data;
}

export async function fetchYearData(year = 2026): Promise<AppData> {
  const url = `${import.meta.env.BASE_URL}data/${year}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load data: ${response.status}`);
  }
  const json = (await response.json()) as AppData;
  return validateData(json);
}

function validateLandingsData(data: LandingsData): LandingsData {
  if (!Array.isArray(data.meta?.range_years) || data.meta.range_years.length === 0) {
    throw new Error("Invalid landings meta.range_years");
  }
  if (!Array.isArray(data.species)) {
    throw new Error("Invalid landings species");
  }

  data.species.forEach((species) => {
    if (!Array.isArray(species.monthly)) {
      throw new Error(`Invalid monthly data for species "${species.id}"`);
    }
    species.monthly.forEach((entry) => {
      if (entry.m < 1 || entry.m > 12) {
        throw new Error(`Invalid month for species "${species.id}"`);
      }
      if (entry.value < 0) {
        throw new Error(`Invalid landing value for species "${species.id}"`);
      }
    });
  });

  return data;
}

export async function fetchLandings5y(): Promise<LandingsData> {
  const url = `${import.meta.env.BASE_URL}data/landings_5y.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load landings data: ${response.status}`);
  }

  const json = (await response.json()) as LandingsData;
  return validateLandingsData(json);
}
