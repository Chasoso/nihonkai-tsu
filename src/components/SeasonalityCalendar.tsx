import { useEffect, useMemo, useState } from "react";
import type { Fish, LandingsData } from "../types";
import {
  computeSeasonalityBySpecies,
  getTopSeasonFishIdsByMonth,
  SEASON_THRESHOLD,
  TOP_SEASON_FISH_LIMIT
} from "../lib/seasonality";

interface SeasonalityCalendarProps {
  fishList: Fish[];
  landings: LandingsData;
  selectedFishId: string | null;
  onSelectMainFish: (fishId: string) => void;
}

function monthInJst(date = new Date()): number {
  const monthText = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric"
  }).format(date);
  const month = Number.parseInt(monthText, 10);
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
}

export function SeasonalityCalendar({
  fishList,
  landings,
  selectedFishId,
  onSelectMainFish
}: SeasonalityCalendarProps) {
  const fishById = useMemo(() => new Map(fishList.map((fish) => [fish.id, fish])), [fishList]);
  const seasonalityList = useMemo(() => computeSeasonalityBySpecies(landings, SEASON_THRESHOLD), [landings]);
  const seasonalityById = useMemo(() => new Map(seasonalityList.map((item) => [item.id, item])), [seasonalityList]);

  const selectableFish = useMemo(
    () => fishList.filter((fish) => seasonalityById.has(fish.id)),
    [fishList, seasonalityById]
  );

  const [calendarFishId, setCalendarFishId] = useState<string | null>(selectedFishId);

  useEffect(() => {
    if (!selectableFish.length) {
      setCalendarFishId(null);
      return;
    }

    if (selectedFishId && seasonalityById.has(selectedFishId)) {
      setCalendarFishId(selectedFishId);
      return;
    }

    if (!calendarFishId || !seasonalityById.has(calendarFishId)) {
      setCalendarFishId(selectableFish[0].id);
    }
  }, [selectedFishId, selectableFish, seasonalityById, calendarFishId]);

  const currentMonth = monthInJst();
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const currentTopIds = useMemo(
    () => getTopSeasonFishIdsByMonth(seasonalityList, currentMonth, TOP_SEASON_FISH_LIMIT),
    [seasonalityList, currentMonth]
  );
  const nextTopIds = useMemo(
    () => getTopSeasonFishIdsByMonth(seasonalityList, nextMonth, TOP_SEASON_FISH_LIMIT),
    [seasonalityList, nextMonth]
  );

  const calendarSeasonality = calendarFishId ? seasonalityById.get(calendarFishId) ?? null : null;

  const monthTiles = useMemo(() => {
    if (!calendarSeasonality) return [];

    return Array.from({ length: 12 }, (_, idx) => {
      const month = idx + 1;
      const index = calendarSeasonality.indexByMonth[idx] ?? 0;
      const isSeason = calendarSeasonality.isSeasonByMonth[idx] ?? false;
      const intensity = Math.max(0.2, Math.min(1, index / 1.8));
      return { month, index, isSeason, intensity };
    });
  }, [calendarSeasonality]);

  const handleSelectFromSeasonList = (fishId: string) => {
    setCalendarFishId(fishId);
    onSelectMainFish(fishId);
  };

  return (
    <section className="section seasonality-section" id="seasonality-calendar">
      <h2>旬カレンダー</h2>
      <p>
        旬判定: 指数 {SEASON_THRESHOLD.toFixed(2)} 以上 / 集計期間:{" "}
        {landings.meta.range_years[0]}〜{landings.meta.range_years[landings.meta.range_years.length - 1]} / 単位:{" "}
        {landings.meta.unit}
      </p>

      <div className="season-lists">
        <section className="card season-card">
          <h3>{currentMonth}月の旬の魚</h3>
          <div className="chip-row">
            {currentTopIds.map((fishId) => {
              const fish = fishById.get(fishId);
              return fish ? (
                <button key={`current-${fishId}`} onClick={() => handleSelectFromSeasonList(fishId)}>
                  {fish.name}
                </button>
              ) : null;
            })}
            {!currentTopIds.length ? <p>該当なし</p> : null}
          </div>
        </section>

        <section className="card season-card">
          <h3>{nextMonth}月の旬の魚</h3>
          <div className="chip-row">
            {nextTopIds.map((fishId) => {
              const fish = fishById.get(fishId);
              return fish ? (
                <button key={`next-${fishId}`} onClick={() => handleSelectFromSeasonList(fishId)}>
                  {fish.name}
                </button>
              ) : null;
            })}
            {!nextTopIds.length ? <p>該当なし</p> : null}
          </div>
        </section>
      </div>

      <div className="season-controls">
        <label>
          魚種を選択
          <select
            value={calendarFishId ?? ""}
            onChange={(event) => setCalendarFishId(event.target.value)}
            disabled={!selectableFish.length}
          >
            {selectableFish.map((fish) => (
              <option key={fish.id} value={fish.id}>
                {fish.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="season-grid">
        {monthTiles.map((tile) => (
          <div
            key={tile.month}
            className={`season-tile ${tile.isSeason ? "season-tile-peak" : ""}`}
            style={{ opacity: tile.intensity }}
          >
            <strong>{tile.month}月</strong>
            <span>指数 {tile.index.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
