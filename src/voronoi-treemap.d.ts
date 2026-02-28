declare module "d3-voronoi-treemap" {
  interface VoronoiTreemapLayout<T> {
    (root: any): any;
    clip(polygon: [number, number][]): VoronoiTreemapLayout<T>;
  }

  export function voronoiTreemap<T>(): VoronoiTreemapLayout<T>;
}
