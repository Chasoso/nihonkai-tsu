const fishImageModules = import.meta.glob("../assets/fish/*.png", {
  eager: true,
  import: "default"
}) as Record<string, string>;

const fishImageMap = new Map(
  Object.entries(fishImageModules).map(([filePath, url]) => {
    const match = filePath.match(/\/([^/]+)\.png$/);
    return [match?.[1]?.toLowerCase() ?? filePath.toLowerCase(), url];
  })
);

function resolveFishImageSrc(fishId: string): string {
  const normalizedId = fishId.trim().toLowerCase();
  return fishImageMap.get(normalizedId) ?? fishImageMap.get("default-fish") ?? "";
}

interface FishImageProps {
  fishId: string;
  fishName: string;
  className?: string;
}

export function FishImage({ fishId, fishName, className = "fish-photo" }: FishImageProps) {
  const src = resolveFishImageSrc(fishId);
  return <img src={src} alt={`${fishName}の画像`} className={className} loading="lazy" />;
}
