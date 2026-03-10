import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Hero } from "./components/Hero";
import heroBackgroundImage from "./assets/hero-background.png";
import { FishModal } from "./components/FishModal";
import { ShareStudio } from "./components/ShareStudio";
import { SeasonalityCalendar } from "./components/SeasonalityCalendar";
import { BadgeToast } from "./components/BadgeToast";
import { BadgeHistory } from "./components/BadgeHistory";
import { ProgressBoardVoronoi } from "./components/ProgressBoardVoronoi";
import { fetchLandings5y, fetchYearData } from "./lib/data";
import type { MetricsSummary } from "./lib/metrics";
import { computeMaxCoveredPercentile } from "./lib/progress";
import { earnBadge, getBadges } from "./lib/storage";
import type { AppData, Fish, LandingsData } from "./types";

type SectionKey = "featured" | "main" | "share" | "progress" | "about";

function categoryLabel(category: string): string {
  if (category === "trend") return "旬";
  if (category === "discovery") return "発見";
  if (category === "classic") return "定番";
  return category;
}

function trendLabel(trend: Fish["trend"]) {
  if (trend === "up") return "上昇";
  if (trend === "down") return "下降";
  return "横ばい";
}

function buildSeasonIndexByMonth(landings: LandingsData | null, fishId: string): number[] {
  if (!landings) return [];
  const species = landings.species.find((item) => item.id === fishId);
  if (!species) return [];

  const totals = Array.from({ length: 12 }, () => 0);
  const counts = Array.from({ length: 12 }, () => 0);
  species.monthly.forEach((entry) => {
    const idx = entry.m - 1;
    if (idx < 0 || idx > 11) return;
    totals[idx] += entry.value;
    counts[idx] += 1;
  });

  const monthlyAvg = totals.map((total, idx) => (counts[idx] > 0 ? total / counts[idx] : 0));
  const avgAll = monthlyAvg.reduce((sum, value) => sum + value, 0) / 12;
  if (avgAll <= 0) return Array.from({ length: 12 }, () => 0);
  return monthlyAvg.map((value) => value / avgAll);
}

function recommendDishes(fishName: string): string[] {
  const name = fishName.toLowerCase();
  if (name.includes("いか")) return ["刺身", "バター焼き", "天ぷら"];
  if (name.includes("えび") || name.includes("かに")) return ["刺身", "塩ゆで", "唐揚げ"];
  if (name.includes("さば") || name.includes("いわし")) return ["塩焼き", "炙り刺し", "つみれ汁"];
  if (name.includes("ぶり")) return ["刺身", "照り焼き", "しゃぶしゃぶ"];
  if (name.includes("のどぐろ")) return ["塩焼き", "炙り寿司", "煮付け"];
  return ["刺身", "塩焼き", "煮付け"];
}

function buildPostExperienceToast(
  metricType: "copy" | "x_click",
  count: number,
  popularFishName: string
): string {
  const firstLine =
    metricType === "copy"
      ? "コピーしました。投稿体験を記録しました。"
      : "Xへの投稿を始めました。投稿体験を記録しました。";
  return `${firstLine}\nあなたは今日${count}件目の投稿体験です\n今週人気: ${popularFishName}`;
}

function buildPostExperienceToastFromSummary(
  metricType: "copy" | "x_click",
  summary: MetricsSummary,
  fallbackFishName: string
): string {
  const firstLine =
    metricType === "copy"
      ? "コピーしました。投稿体験を記録しました。"
      : "Xへの投稿を始めました。投稿体験を記録しました。";
  const popularFishName = summary.topFishThisWeek?.fishLabel || fallbackFishName;
  return `${firstLine}\nあなたは今日${summary.currentOrder}件目の投稿体験です\n今日の投稿体験数: ${summary.totalToday}\n今週人気: ${popularFishName}`;
}

function saveImageForXPost(imageFile: File): void {
  const downloadUrl = URL.createObjectURL(imageFile);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = imageFile.name || `nihonkai-${Date.now()}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

export default function App() {
  const heroBackgroundUrl = String(import.meta.env.VITE_HERO_BACKGROUND_URL ?? "").trim() || heroBackgroundImage;
  const [data, setData] = useState<AppData | null>(null);
  const [landings, setLandings] = useState<LandingsData | null>(null);
  const [selectedFish, setSelectedFish] = useState<Fish | null>(null);
  const [openShareComposerNonce, setOpenShareComposerNonce] = useState(0);
  const [modalFish, setModalFish] = useState<Fish | null>(null);
  const [badges, setBadges] = useState(() => getBadges());
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featuredRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const shareRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLElement | null>(null);
  const aboutRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const overlayTimerRef = useRef<number | null>(null);
  const postExperienceCountRef = useRef(0);

  useEffect(() => {
    Promise.all([fetchYearData(), fetchLandings5y()])
      .then(([yearData, landingData]) => {
        setData(yearData);
        setLandings(landingData);
        if (yearData.fish.length > 0) {
          setSelectedFish(yearData.fish[0]);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "繝・・繧ｿ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆"));
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    };
  }, []);

  const yearBadges = useMemo(
    () => badges.filter((badge) => badge.year === data?.year),
    [badges, data?.year]
  );
  const earnedFishIds = useMemo(() => new Set(yearBadges.map((badge) => badge.fishId)), [yearBadges]);
  const maxCoveredPercentile = useMemo(
    () => computeMaxCoveredPercentile(yearBadges, data?.fish ?? []),
    [yearBadges, data?.fish]
  );

  const featuredFish = useMemo(() => {
    if (!data) return [];
    return [...data.fish].sort((a, b) => b.percentile - a.percentile).slice(0, 3);
  }, [data]);

  const seasonIndexByMonth = useMemo(
    () => (selectedFish ? buildSeasonIndexByMonth(landings, selectedFish.id) : []),
    [landings, selectedFish]
  );

  const peakMonth = useMemo(() => {
    if (!seasonIndexByMonth.length) return null;
    let peak = 0;
    let max = seasonIndexByMonth[0];
    seasonIndexByMonth.forEach((value, idx) => {
      if (value > max) {
        max = value;
        peak = idx;
      }
    });
    return peak + 1;
  }, [seasonIndexByMonth]);

  const dishes = useMemo(() => (selectedFish ? recommendDishes(selectedFish.name) : []), [selectedFish]);

  const sectionRefByKey: Record<SectionKey, RefObject<HTMLElement | null>> = {
    featured: featuredRef,
    main: mainRef,
    share: shareRef,
    progress: progressRef,
    about: aboutRef
  };

  const scrollToSection = (key: SectionKey) => {
    sectionRefByKey[key].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastVisible(false), 7000);
  };

  const openFishForShare = (fish: Fish) => {
    setSelectedFish(fish);
    setOpenShareComposerNonce((prev) => prev + 1);
    shareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startPostingFlow = () => {
    setOpenShareComposerNonce((prev) => prev + 1);
    shareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePostExperience = (metricType: "copy" | "x_click", summary?: MetricsSummary | null) => {
    const popularFishName = featuredFish[0]?.name ?? selectedFish?.name ?? "おすすめの魚";
    if (summary) {
      postExperienceCountRef.current = summary.currentOrder;
      openToast(buildPostExperienceToastFromSummary(metricType, summary, popularFishName));
      return;
    }

    postExperienceCountRef.current += 1;
    openToast(buildPostExperienceToast(metricType, postExperienceCountRef.current, popularFishName));
  };

  if (error) {
    return <main className="app-shell">Error: {error}</main>;
  }
  if (!data || !landings || !selectedFish) {
    return <main className="app-shell">Loading...</main>;
  }

  return (
    <main className="app-shell horizontal-app">
      <header className="top-nav">
        <div className="top-nav-inner">
          <button className="brand-button" onClick={startPostingFlow} aria-label="Nihonkai Tsu">
            Nihonkai Tsu
          </button>
          <nav className="top-nav-links" aria-label="メインナビゲーション">
            <button onClick={() => scrollToSection("featured")}>Fish</button>
            <button onClick={() => scrollToSection("about")}>About</button>
          </nav>
        </div>
      </header>

      <section className="persistent-header">
        <div className="panel-inner">
          <Hero
            year={data.year}
            onStartPost={startPostingFlow}
            backgroundImageUrl={heroBackgroundUrl}
          />
        </div>
      </section>

      <section ref={featuredRef} className="section">
        <div className="panel-inner">
          <h2 className="section-title">投稿ネタを選ぶ（おすすめ）</h2>
          <p className="section-lead featured-fish-lead">迷ったらここから選ぶと、そのまま投稿フローに入れます。</p>
          <div className="featured-fish-grid">
            {featuredFish.map((fish) => (
              <article key={fish.id} className="card featured-fish-card">
                <div className="featured-fish-image" aria-hidden="true">
                  <span>魚の写真準備中</span>
                </div>
                <h3>{fish.name}</h3>
                <p>{fish.microcopy}</p>
                <div className="featured-fish-meta">
                  <span>Season: {fish.percentile.toFixed(1)}%</span>
                  <span>Trend: {trendLabel(fish.trend)}</span>
                </div>
                <button
                  onClick={() => {
                    openFishForShare(fish);
                  }}
                >
                  この魚で投稿文を作る
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section ref={mainRef} className="section">
        <div className="panel-inner main-section-grid">
          <div className="main-section-left">
            <SeasonalityCalendar
              fishList={data.fish}
              landings={landings}
              selectedFishId={selectedFish.id}
              onSelectMainFish={(fishId) => {
                const fish = data.fish.find((item) => item.id === fishId);
                if (fish) setSelectedFish(fish);
              }}
            />
            <section className="card browse-post-cta">
              <h3>ネタが決まったらそのまま投稿</h3>
              <p>旬の魚を見つけたら、3ステップですぐ投稿できます。</p>
              <button className="fish-detail-eat-button" onClick={startPostingFlow}>
                この魚で投稿をはじめる
              </button>
            </section>
          </div>
          <aside className="card main-fish-detail">
            <h2 className="section-title">Fish Detail</h2>
            <div className="main-fish-detail-head">
              <div className="main-fish-detail-image">澄</div>
              <div>
                <h3>{selectedFish.name}</h3>
                <p>{selectedFish.microcopy}</p>
              </div>
            </div>
            <div className="main-fish-detail-meta">
              <span>カテゴリ: {categoryLabel(selectedFish.category)}</span>
              <span>トレンド: {trendLabel(selectedFish.trend)}</span>
              <span>レア度: 上位 {selectedFish.percentile}%</span>
            </div>
            <section className="main-fish-detail-block">
              <h4>旬グラフ</h4>
              {seasonIndexByMonth.length ? (
                <>
                  <div className="season-mini-graph">
                    {seasonIndexByMonth.map((value, idx) => (
                      <div key={idx} className="season-mini-bar-wrap" title={`${idx + 1}譛・/ 謖・焚 ${value.toFixed(2)}`}>
                        <div
                          className={`season-mini-bar ${peakMonth === idx + 1 ? "season-mini-bar-peak" : ""}`}
                          style={{ height: `${Math.max(10, Math.min(100, value * 58))}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="fish-detail-note">ピーク月: {peakMonth}月</p>
                </>
              ) : (
                <p className="fish-detail-note">旬データは準備中です。</p>
              )}
            </section>
            <section className="main-fish-detail-block">
              <h4>おすすめ料理</h4>
              <div className="dish-chip-list">
                {dishes.map((dish) => (
                  <span key={dish} className="dish-chip">
                    {dish}
                  </span>
                ))}
              </div>
            </section>
            <div className="main-fish-detail-actions">
              <button className="fish-detail-eat-button" onClick={() => openFishForShare(selectedFish)}>
                食べたら投稿する
              </button>
            </div>
          </aside>
        </div>
      </section>

      <section ref={shareRef} className="section">
        <div className="panel-inner">
          <ShareStudio
            fish={selectedFish}
            fishTypeOptions={data.fish.map((item) => item.name)}
            landings={landings}
            openComposerNonce={openShareComposerNonce}
            onPostExperience={handlePostExperience}
            onOpenXIntent={async (finalText, imageFile) => {
              if (imageFile) {
                saveImageForXPost(imageFile);
                openToast("画像を保存しました。Xの投稿画面で画像を添付してください。");
              }

              const url = `https://x.com/intent/tweet?text=${encodeURIComponent(finalText)}`;
              window.open(url, "_blank", "noopener,noreferrer");
              return true;
            }}
            onComplete={(completedFishId) => {
              const earnedFish =
                data.fish.find((item) => item.id === (completedFishId?.trim().toLowerCase() || "")) ?? selectedFish;
              const result = earnBadge(data.year, earnedFish);
              setBadges(result.badges);
              if (result.added) {
                setOverlayVisible(true);
                if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
                overlayTimerRef.current = window.setTimeout(() => setOverlayVisible(false), 1500);
                openToast(`通を獲得しました: ${earnedFish.share.badgeLabel}`);
              } else {
                openToast(`すでに獲得済みです: ${earnedFish.share.badgeLabel}`);
              }
            }}
          />
        </div>
      </section>

      <section ref={progressRef} className="section">
        <div className="panel-inner">
          <h2 className="section-title">Your Tsu</h2>
          <ProgressBoardVoronoi
            fish={data.fish}
            categories={data.categories}
            earnedFishIds={earnedFishIds}
            maxCoveredPercentile={maxCoveredPercentile}
            onOpenFish={setModalFish}
          />
          <section ref={historyRef}>
            <BadgeHistory badges={yearBadges} fishList={data.fish} year={data.year} />
          </section>
        </div>
      </section>

      <section ref={aboutRef} className="section">
        <div className="panel-inner">
          <section className="card">
            <h2>About</h2>
            <p>このアプリは、石川の魚を撮って投稿する体験を通して、旬の変化を楽しむためのプロトタイプです。</p>
          </section>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>Nihonkai Tsu</span>
          <span>Data Sources</span>
          <span>Ishikawa Fisheries</span>
          <span>GitHub</span>
        </div>
      </footer>

      <FishModal
        fish={modalFish}
        landings={landings}
        onClose={() => setModalFish(null)}
        onSelectForShare={openFishForShare}
      />

      <BadgeToast
        visible={toastVisible}
        message={toastMessage}
        onClose={() => setToastVisible(false)}
        onViewHistory={() => {
          progressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          window.setTimeout(() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 220);
        }}
      />

      {overlayVisible ? (
        <div className="overlay">
          <div className="overlay-badge">通 獲得</div>
        </div>
      ) : null}
    </main>
  );
}


