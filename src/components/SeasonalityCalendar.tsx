import { useEffect, useId, useMemo, useState } from "react";
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
  const tooltipId = useId();
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
      setCalendarFishId((prev) => (prev === selectedFishId ? prev : selectedFishId));
      return;
    }

    setCalendarFishId((prev) => {
      if (prev && seasonalityById.has(prev)) {
        return prev;
      }
      return selectableFish[0].id;
    });
  }, [selectedFishId, selectableFish, seasonalityById]);

  const currentMonth = monthInJst();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const selectedMonthTopIds = useMemo(
    () => getTopSeasonFishIdsByMonth(seasonalityList, selectedMonth, TOP_SEASON_FISH_LIMIT),
    [seasonalityList, selectedMonth]
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
      <h2 className="section-title">投稿ネタを探す（旬の魚）</h2>
      <div className="season-meta-row">
        <p className="section-lead season-meta-copy">
          旬判定: 指数 {SEASON_THRESHOLD.toFixed(2)} 以上 / 集計期間: {landings.meta.range_years[0]}-
          {landings.meta.range_years[landings.meta.range_years.length - 1]} / 単位: {landings.meta.unit}
        </p>
        <div className="season-help">
          <button
            type="button"
            className="season-help-button"
            aria-label="指数の説明"
            aria-describedby={tooltipId}
          >
            ?
          </button>
          <div id={tooltipId} role="tooltip" className="season-help-tooltip">
            指数は、各月の平均漁獲量をその魚の年間平均漁獲量で割った値です。
            <br />
            1.00 が年間平均、1.20 以上なら「旬」とみなします。
          </div>
        </div>
      </div>

      <div className="season-month-tabs" role="tablist" aria-label="月を選ぶ">
        {Array.from({ length: 12 }, (_, idx) => idx + 1).map((month) => (
          <button
            key={month}
            className={month === selectedMonth ? "season-month-tab season-month-tab-active" : "season-month-tab"}
            onClick={() => setSelectedMonth(month)}
          >
            {month}月
          </button>
        ))}
      </div>

      <div className="card season-card">
        <h3>{selectedMonth}月の旬の魚タグ</h3>
        <div className="chip-row">
          {selectedMonthTopIds.map((fishId) => {
            const fish = fishById.get(fishId);
            return fish ? (
              <button key={`selected-${fishId}`} onClick={() => handleSelectFromSeasonList(fishId)}>
                {fish.name}
              </button>
            ) : null;
          })}
          {!selectedMonthTopIds.length ? <p>該当なし</p> : null}
        </div>
      </div>

      <div className="season-controls">
        <label>
          魚種を選択
          <select
            value={calendarFishId ?? ""}
            onChange={(event) => {
              const nextFishId = event.target.value;
              setCalendarFishId(nextFishId);
              onSelectMainFish(nextFishId);
            }}
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
