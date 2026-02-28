interface HeroProps {
  headline: string;
  subline: string;
  year: number;
}

export function Hero({ headline, subline, year }: HeroProps) {
  return (
    <section id="hero" className="section hero">
      <p className="eyebrow">Nihonkai Badges {year}</p>
      <h1>{headline}</h1>
      <p className="hero-subline">{subline}</p>
    </section>
  );
}
