import { useMemo, useState } from "react";
import { hierarchy } from "d3-hierarchy";
import { voronoiTreemap } from "d3-voronoi-treemap";
import type { Category, Fish } from "../types";

interface ProgressBoardVoronoiProps {
  fish: Fish[];
  categories: Category[];
  earnedFishIds: Set<string>;
  earnedSharePercent: number;
  onOpenFish: (fish: Fish) => void;
}

type TreeNode = {
  name: string;
  id?: string;
  category?: string;
  percentile?: number;
  weight?: number;
  children?: TreeNode[];
};

type LeafNode = {
  id: string;
  name: string;
  category: string;
  percentile: number;
  polygon: [number, number][];
};

const WIDTH = 960;
const HEIGHT = 520;

function getVoronoiFill(isEarned: boolean): string {
  return isEarned ? "#1d4ed8" : "#dce7f5";
}

function getVoronoiStroke(isEarned: boolean): string {
  return isEarned ? "#f8fbff" : "#b7c9e1";
}

export function ProgressBoardVoronoi({
  fish,
  categories,
  earnedFishIds,
  earnedSharePercent,
  onOpenFish
}: ProgressBoardVoronoiProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const fishById = useMemo(() => new Map(fish.map((item) => [item.id, item])), [fish]);

  const leaves = useMemo<LeafNode[]>(() => {
    const treeData: TreeNode = {
      name: "root",
      children: categories.map((category) => ({
        name: category.id,
        children: fish
          .filter((item) => item.category === category.id)
          .map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            percentile: item.percentile,
            weight: item.percentile + 0.0001
          }))
      }))
    };

    const root = hierarchy<TreeNode>(treeData)
      .sum((node) => node.weight ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = voronoiTreemap<TreeNode>().clip([
      [0, 0],
      [WIDTH, 0],
      [WIDTH, HEIGHT],
      [0, HEIGHT]
    ]);
    layout(root as never);

    return root.leaves().flatMap((leaf) => {
      const data = leaf.data;
      const polygon = (leaf as unknown as { polygon?: [number, number][] }).polygon ?? [];
      if (!data.id || !data.category || typeof data.percentile !== "number") return [];

      return [
        {
          id: data.id,
          name: data.name,
          category: data.category,
          percentile: data.percentile,
          polygon
        }
      ];
    });
  }, [fish, categories]);

  return (
    <section className="section" id="progress-board">
      <h2>Progress Board</h2>
      <p>累計で漁獲量シェア {earnedSharePercent.toFixed(1)}% を味わった</p>
      <div className="progress-shell">
        <div className="progress-bar" style={{ width: `${earnedSharePercent}%` }} />
      </div>

      <div className="voronoi-wrapper">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Fish progress board">
          {leaves.map((leaf) => {
            const fishData = fishById.get(leaf.id);
            if (!fishData || leaf.polygon.length < 3) return null;

            const isEarned = earnedFishIds.has(leaf.id);
            const points = leaf.polygon.map((point) => point.join(",")).join(" ");

            return (
              <polygon
                key={leaf.id}
                points={points}
                className="voronoi-cell"
                fill={getVoronoiFill(isEarned)}
                fillOpacity={isEarned ? 0.96 : 0.86}
                stroke={getVoronoiStroke(isEarned)}
                strokeWidth={isEarned ? 2.6 : 1.2}
                onMouseMove={(event) =>
                  setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    text: `${leaf.name} / ${leaf.percentile}%`
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
