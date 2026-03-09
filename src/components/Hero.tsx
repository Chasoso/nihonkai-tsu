interface HeroProps {
  headline: string;
  subline: string;
  year: number;
  onExploreFish?: () => void;
}

export function Hero({ headline, subline, year, onExploreFish }: HeroProps) {
  return (
    <section id="hero" className="section hero">
      <div className="hero-content">
        <p className="eyebrow hero-eyebrow">Nihonkai Tsu {year}</p>
        <h1 className="hero-title">{headline}</h1>
        <p className="hero-subline">{subline}</p>
        {onExploreFish ? (
          <div className="hero-actions">
            <button className="hero-cta" onClick={onExploreFish}>
              Explore Fish
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
