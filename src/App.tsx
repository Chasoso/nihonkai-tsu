import { useEffect, useMemo, useRef, useState } from "react";
import { Hero } from "./components/Hero";
import { FishSpotlight } from "./components/FishSpotlight";
import { FishModal } from "./components/FishModal";
import { ShareStudio } from "./components/ShareStudio";
import { BadgeToast } from "./components/BadgeToast";
import { BadgeHistory } from "./components/BadgeHistory";
import { ProgressBoardVoronoi } from "./components/ProgressBoardVoronoi";
import { fetchYearData } from "./lib/data";
import { computeMaxCoveredPercentile } from "./lib/progress";
import { earnBadge, getBadges } from "./lib/storage";
import type { AppData, Fish } from "./types";

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [selectedFish, setSelectedFish] = useState<Fish | null>(null);
  const [modalFish, setModalFish] = useState<Fish | null>(null);
  const [badges, setBadges] = useState(() => getBadges());
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  useEffect(() => {
    fetchYearData()
      .then((res) => {
        setData(res);
        if (res.fish.length > 0) {
          setSelectedFish(res.fish[0]);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "データ読み込みに失敗しました"));
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (overlayTimerRef.current) {
        window.clearTimeout(overlayTimerRef.current);
      }
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

  const openToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToastVisible(false), 7000);
  };

  const openFishForShare = (fish: Fish) => {
    setSelectedFish(fish);
    window.requestAnimationFrame(() => {
      shareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (error) {
    return <main className="app-shell">Error: {error}</main>;
  }

  if (!data) {
    return <main className="app-shell">Loading...</main>;
  }

  return (
    <main className="app-shell">
      <Hero headline={data.theme.headline} subline={data.theme.subline} year={data.year} />

      <FishSpotlight fish={selectedFish ?? data.fish[0]} onOpenDetail={setModalFish} />

      <section className="section fish-list">
        <h2>今年の魚</h2>
        <div className="chip-row">
          {data.fish.map((fish) => (
            <button key={fish.id} onClick={() => setModalFish(fish)}>
              {fish.name}
            </button>
          ))}
        </div>
      </section>

      <FishModal fish={modalFish} onClose={() => setModalFish(null)} onSelectForShare={openFishForShare} />

      <section ref={shareRef}>
        <ShareStudio
          fish={selectedFish}
          onOpenXIntent={(finalText) => {
            if (!selectedFish) return;
            const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(finalText)}`;
            window.open(url, "_blank");
          }}
          onComplete={() => {
            if (!selectedFish) return;
            const result = earnBadge(data.year, selectedFish);
            setBadges(result.badges);

            if (result.added) {
              setOverlayVisible(true);
              if (overlayTimerRef.current) {
                window.clearTimeout(overlayTimerRef.current);
              }
              overlayTimerRef.current = window.setTimeout(() => setOverlayVisible(false), 1500);
              openToast(`通を獲得しました: ${selectedFish.share.badgeLabel}`);
            } else {
              openToast(`すでに獲得済みです: ${selectedFish.share.badgeLabel}`);
            }
          }}
        />
      </section>

      <section ref={historyRef}>
        <BadgeHistory badges={yearBadges} fishList={data.fish} year={data.year} />
      </section>

      <ProgressBoardVoronoi
        fish={data.fish}
        categories={data.categories}
        earnedFishIds={earnedFishIds}
        maxCoveredPercentile={maxCoveredPercentile}
        onOpenFish={setModalFish}
      />

      <section className="section">
        <h2>About</h2>
        <p>「通」は知識の証明ではなく、行動履歴。味わい、投稿し、海の変化を追いかける。</p>
      </section>

      <BadgeToast
        visible={toastVisible}
        message={toastMessage}
        onClose={() => setToastVisible(false)}
        onViewHistory={() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      {overlayVisible ? (
        <div className="overlay">
          <div className="overlay-badge">通 獲得</div>
        </div>
      ) : null}
    </main>
  );
}
