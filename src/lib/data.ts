import type { AppData } from "../types";

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
