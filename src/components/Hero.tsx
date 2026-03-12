import type { CSSProperties } from "react";

interface HeroProps {
  year: number;
  onStartPost?: () => void;
  backgroundImageUrl?: string;
}

export function Hero({ year, onStartPost, backgroundImageUrl }: HeroProps) {
  const heroStyle = (
    backgroundImageUrl
      ? ({ "--hero-background-image": `url("${backgroundImageUrl}")` } as CSSProperties)
      : undefined
  );

  return (
    <section id="hero" className="section hero" style={heroStyle}>
      <div className="hero-content">
        <p className="eyebrow hero-eyebrow">Nihonkai Tsu {year}</p>
        <h1 className="hero-title">
          <span className="hero-title-chunk">石川の魚を撮って</span>
          <wbr />
          <span className="hero-title-chunk">投稿しよう</span>
        </h1>
        <p className="hero-subline">写真を選ぶだけで、投稿文と画像を作ってそのままX投稿に進めます。</p>
        {onStartPost ? (
          <div className="hero-actions">
            <button className="hero-cta" onClick={onStartPost}>
              写真を撮って投稿文を作る
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
