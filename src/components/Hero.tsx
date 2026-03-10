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
        <h1 className="hero-title">石川の魚を撮って投稿しよう</h1>
        <p className="hero-subline">30秒で投稿文とフレーム画像が完成。魚に詳しくなくても、コピーするだけでOK。</p>
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
