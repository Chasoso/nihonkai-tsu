export type Trend = "up" | "down" | "flat";

export interface Theme {
  headline: string;
  subline: string;
}

export interface Category {
  id: string;
  label: string;
  description: string;
}

export interface FishShare {
  badgeLabel: string;
  text: string;
}

export interface Fish {
  id: string;
  name: string;
  category: string;
  trend: Trend;
  percentile: number;
  microcopy: string;
  share: FishShare;
}

export interface AppData {
  year: number;
  theme: Theme;
  categories: Category[];
  fish: Fish[];
}

export interface LandingMonthlyRecord {
  year: number;
  m: number;
  value: number;
}

export interface LandingSpecies {
  id: string;
  name_ja: string;
  monthly: LandingMonthlyRecord[];
}

export interface LandingsMeta {
  range_years: number[];
  unit: string;
  updated_at: string;
}

export interface LandingsData {
  meta: LandingsMeta;
  species: LandingSpecies[];
}

export interface BadgeRecord {
  year: number;
  fishId: string;
  category: string;
  earnedAt: string;
}
