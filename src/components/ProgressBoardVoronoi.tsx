import { useMemo, useState } from "react";
import { hierarchy } from "d3";
import { voronoiTreemap } from "d3-voronoi-treemap";
import type { Category, Fish } from "../types";

interface ProgressBoardVoronoiProps {
  fish: Fish[];
  categories: Category[];
  earnedFishIds: Set<string>;
  maxCoveredPercentile: number;
  onOpenFish: (fish: Fish) => void;
}

interface LeafData {
  id: string;
  name: string;
  category: string;
  percentile: number;
  weight: number;
}

const WIDTH = 960;
const HEIGHT = 520;

function categoryColor(id: string): string {
  if (id === "trend") return "#3d7f5f";
  if (id === "discovery") return "#1f5f8b";
  return "#7f5f3d";
}

export function ProgressBoardVoronoi({
  fish,
  categories,
  earnedFishIds,
  maxCoveredPercentile,
  onOpenFish
}: ProgressBoardVoronoiProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const fishById = useMemo(() => new Map(fish.map((item) => [item.id, item])), [fish]);

  const leaves = useMemo(() => {
    const treeData = {
      name: "root",
      children: categories.map((category) => ({
        name: category.id,
        children: fish
          .filter((item) => item.category === category.id)
          .map(
            (item): LeafData => ({
              id: item.id,
              name: item.name,
              category: item.category,
              percentile: item.percentile,
              weight: Math.max(1, 100 - item.percentile)
            })
          )
      }))
    };

    const root = hierarchy(treeData)
      .sum((node) => ("weight" in node ? (node as unknown as LeafData).weight : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = voronoiTreemap<unknown>().clip([
      [0, 0],
      [WIDTH, 0],
      [WIDTH, HEIGHT],
      [0, HEIGHT]
    ]);
    layout(root as never);

    return root.leaves().map((leaf) => {
      const data = leaf.data as unknown as LeafData;
      const polygon = (leaf as unknown as { polygon?: [number, number][] }).polygon ?? [];
      return {
        ...data,
        polygon
      };
    });
  }, [fish, categories]);

  return (
    <section className="section" id="progress-board">
      <h2>Progress Board</h2>
      <p>上位 {maxCoveredPercentile}% の海を味わった</p>
      <div className="progress-shell">
        <div className="progress-bar" style={{ width: `${maxCoveredPercentile}%` }} />
      </div>

      <div className="voronoi-wrapper">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="魚の進捗ボード">
          {leaves.map((leaf) => {
            const fishData = fishById.get(leaf.id);
            if (!fishData || leaf.polygon.length < 3) return null;

            const isEarned = earnedFishIds.has(leaf.id);
            const isCovered = fishData.percentile <= maxCoveredPercentile;
            const points = leaf.polygon.map((point) => point.join(",")).join(" ");

            return (
              <polygon
                key={leaf.id}
                points={points}
                className="voronoi-cell"
                fill={categoryColor(leaf.category)}
                fillOpacity={isEarned ? 0.72 : 0.26}
                stroke={isCovered ? "#f9d976" : "#ffffff"}
                strokeWidth={isCovered ? 2.5 : 1.1}
                onMouseMove={(event) =>
                  setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    text: `${leaf.name} / 上位${leaf.percentile}%`
                  })
                }
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onOpenFish(fishData)}
              />
            );
          })}
        </svg>
        {tooltip ? (
          <div className="tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
            {tooltip.text}
          </div>
        ) : null}
      </div>
    </section>
  );
}
