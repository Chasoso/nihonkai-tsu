import { useEffect, useMemo, useRef, useState } from "react";
import { Hero } from "./components/Hero";
import { FishSpotlight } from "./components/FishSpotlight";
import { FishModal } from "./components/FishModal";
import { ShareStudio } from "./components/ShareStudio";
import { SeasonalityCalendar } from "./components/SeasonalityCalendar";
import { BadgeToast } from "./components/BadgeToast";
import { BadgeHistory } from "./components/BadgeHistory";
import { ProgressBoardVoronoi } from "./components/ProgressBoardVoronoi";
import { fetchLandings5y, fetchYearData } from "./lib/data";
import { computeMaxCoveredPercentile } from "./lib/progress";
import { earnBadge, getBadges } from "./lib/storage";
import type { AppData, Fish, LandingsData } from "./types";

type PanelKey = "fish" | "season" | "progress" | "about";
const PANEL_ORDER: PanelKey[] = ["fish", "season", "progress", "about"];

function toKatakana(input: string): string {
  return input.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function normalizeForSearch(input: string): string {
  return toKatakana(input).toLowerCase().replace(/\s+/g, "");
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [landings, setLandings] = useState<LandingsData | null>(null);
  const [selectedFish, setSelectedFish] = useState<Fish | null>(null);
  const [openShareComposerNonce, setOpenShareComposerNonce] = useState(0);
  const [fishSearchQuery, setFishSearchQuery] = useState("");
  const [showAllFish, setShowAllFish] = useState(false);
  const [modalFish, setModalFish] = useState<Fish | null>(null);
  const [badges, setBadges] = useState(() => getBadges());
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePanelIndex, setActivePanelIndex] = useState(0);

  const panelTrackRef = useRef<HTMLDivElement | null>(null);
  const fishPanelRef = useRef<HTMLElement | null>(null);
  const seasonPanelRef = useRef<HTMLElement | null>(null);
  const progressPanelRef = useRef<HTMLElement | null>(null);
  const aboutPanelRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  const panelRefs = [fishPanelRef, seasonPanelRef, progressPanelRef, aboutPanelRef] as const;

  useEffect(() => {
    Promise.all([fetchYearData(), fetchLandings5y()])
      .then(([yearData, landingData]) => {
        setData(yearData);
        setLandings(landingData);
        if (yearData.fish.length > 0) {
          setSelectedFish(yearData.fish[0]);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "データの読み込みに失敗しました"));
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

  const getCurrentPanelIndex = () => {
    const track = panelTrackRef.current;
    if (!track) return 0;
    const trackRect = track.getBoundingClientRect();
    const centerX = trackRect.left + trackRect.width / 2;
    let bestIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;
    panelRefs.forEach((ref, idx) => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const panelCenter = rect.left + rect.width / 2;
      const distance = Math.abs(panelCenter - centerX);
      if (distance < minDistance) {
        minDistance = distance;
        bestIndex = idx;
      }
    });
    return bestIndex;
  };

  useEffect(() => {
    const track = panelTrackRef.current;
    if (!track) return;

    let raf = 0;
    const update = () => {
      setActivePanelIndex((prev) => {
        const next = getCurrentPanelIndex();
        return prev === next ? prev : next;
      });
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    const onScrollEnd = () => update();

    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scrollend", onScrollEnd as EventListener);
    window.addEventListener("resize", update);
    window.requestAnimationFrame(update);

    return () => {
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", onScrollEnd as EventListener);
      window.removeEventListener("resize", update);
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [data, landings]);

  const scrollToPanelIndex = (index: number) => {
    const safeIndex = Math.max(0, Math.min(panelRefs.length - 1, index));
    setActivePanelIndex(safeIndex);
    panelRefs[safeIndex].current?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  const navigateToPanel = (key: PanelKey) => {
    const idx = PANEL_ORDER.indexOf(key);
    if (idx >= 0) {
      scrollToPanelIndex(idx);
    }
    setMenuOpen(false);
  };

  const panelClassName = (idx: number) =>
    `panel page-panel ${activePanelIndex === idx ? "panel-active" : "panel-inactive"}`;

  const yearBadges = useMemo(
    () => badges.filter((badge) => badge.year === data?.year),
    [badges, data?.year]
  );
  const earnedFishIds = useMemo(() => new Set(yearBadges.map((badge) => badge.fishId)), [yearBadges]);
  const maxCoveredPercentile = useMemo(
    () => computeMaxCoveredPercentile(yearBadges, data?.fish ?? []),
    [yearBadges, data?.fish]
  );

  const filteredFish = useMemo(() => {
    if (!data) return [];
    const q = normalizeForSearch(fishSearchQuery.trim());
    if (!q) return data.fish;
    return data.fish.filter((fish) => normalizeForSearch(fish.name).includes(q));
  }, [data, fishSearchQuery]);
  const shouldCollapseFishList = !showAllFish && !fishSearchQuery.trim() && filteredFish.length > 0;

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
    setOpenShareComposerNonce((prev) => prev + 1);
  };

  if (error) {
    return <main className="app-shell">Error: {error}</main>;
  }
  if (!data || !landings) {
    return <main className="app-shell">Loading...</main>;
  }

  return (
    <main className="app-shell horizontal-app">
      <header className="top-nav">
        <button className="hamburger-button" onClick={() => setMenuOpen((prev) => !prev)} aria-label="メニュー">
          ☰
        </button>
      </header>

      <section className="persistent-header">
        <div className="panel-inner">
          <Hero headline={data.theme.headline} subline={data.theme.subline} year={data.year} />
          <FishSpotlight fish={selectedFish ?? data.fish[0]} onOpenDetail={setModalFish} />
        </div>
      </section>

      {menuOpen ? (
        <div className="menu-drawer" role="dialog" aria-label="ナビゲーションメニュー">
          <button onClick={() => navigateToPanel("fish")}>今年の魚</button>
          <button onClick={() => navigateToPanel("season")}>旬カレンダー</button>
          <button onClick={() => navigateToPanel("progress")}>Progress / 通履歴</button>
          <button onClick={() => navigateToPanel("about")}>About</button>
        </div>
      ) : null}

      <div className="snap-hint">
        <button
          className="snap-arrow"
          onClick={() => scrollToPanelIndex(getCurrentPanelIndex() - 1)}
          disabled={activePanelIndex === 0}
          aria-label="前のページ"
        >
          ←
        </button>
        <p>左右にスワイプしてページを切り替え</p>
        <button
          className="snap-arrow"
          onClick={() => scrollToPanelIndex(getCurrentPanelIndex() + 1)}
          disabled={activePanelIndex === panelRefs.length - 1}
          aria-label="次のページ"
        >
          →
        </button>
      </div>

      <div className="snap-dots" aria-hidden="true">
        {PANEL_ORDER.map((_, idx) => (
          <span key={idx} className={idx === activePanelIndex ? "snap-dot snap-dot-active" : "snap-dot"} />
        ))}
      </div>

      <div className="panel-track" ref={panelTrackRef}>
        <section ref={fishPanelRef} className={panelClassName(0)}>
          <div className="panel-inner">
            <section className="section fish-list">
              <div className="fish-list-header">
                <h2>今年の魚</h2>
                <label className="fish-search-wrap" aria-label="魚種検索">
                  <input
                    className="fish-search-input"
                    type="search"
                    placeholder="魚を検索"
                    value={fishSearchQuery}
                    onChange={(event) => setFishSearchQuery(event.target.value)}
                  />
                  <span className="fish-search-icon" aria-hidden="true">
                    🔍
                  </span>
                </label>
              </div>
              <div className={`fish-chip-list-shell ${shouldCollapseFishList ? "fish-chip-list-collapsed" : ""}`}>
                <div className="chip-row">
                  {filteredFish.map((fish) => (
                    <button
                      key={fish.id}
                      onClick={() => {
                        if (selectedFish?.id === fish.id) {
                          setOpenShareComposerNonce((prev) => prev + 1);
                          return;
                        }
                        setSelectedFish(fish);
                      }}
                      className={selectedFish?.id === fish.id ? "chip-active" : ""}
                    >
                      {fish.name}
                    </button>
                  ))}
                  {!filteredFish.length ? <p>該当する魚がありません</p> : null}
                </div>
                {shouldCollapseFishList ? (
                  <div className="fish-list-fade">
                    <button className="fish-list-expand-button" onClick={() => setShowAllFish(true)}>
                      さらに表示
                    </button>
                  </div>
                ) : null}
              </div>
              {showAllFish && !fishSearchQuery.trim() ? (
                <div className="fish-list-collapse-row">
                  <button className="fish-list-collapse-button" onClick={() => setShowAllFish(false)}>
                    折りたたむ
                  </button>
                </div>
              ) : null}
            </section>

            <section>
              <ShareStudio
                fish={selectedFish}
                fishTypeOptions={data.fish.map((item) => item.name)}
                landings={landings}
                openComposerNonce={openShareComposerNonce}
                onOpenXIntent={async (finalText, imageFile) => {
                  const canShareWithImage =
                    !!imageFile &&
                    typeof navigator.canShare === "function" &&
                    navigator.canShare({ files: [imageFile] });
                  if (canShareWithImage) {
                    try {
                      await navigator.share({ text: finalText, files: [imageFile] });
                      return true;
                    } catch (errorInfo) {
                      if (errorInfo instanceof DOMException && errorInfo.name === "AbortError") {
                        return false;
                      }
                    }
                  }

                  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(finalText)}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                  if (imageFile) {
                    window.alert("このブラウザでは画像の自動添付に未対応のため、Xの投稿画面で画像を手動追加してください。");
                  }
                  return true;
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
          </div>
        </section>

        <section ref={seasonPanelRef} className={panelClassName(1)}>
          <div className="panel-inner">
            <SeasonalityCalendar
              fishList={data.fish}
              landings={landings}
              selectedFishId={selectedFish?.id ?? null}
              onSelectMainFish={(fishId) => {
                const fish = data.fish.find((item) => item.id === fishId);
                if (fish) {
                  setSelectedFish(fish);
                  navigateToPanel("fish");
                }
              }}
            />
          </div>
        </section>

        <section ref={progressPanelRef} className={panelClassName(2)}>
          <div className="panel-inner">
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

        <section ref={aboutPanelRef} className={panelClassName(3)}>
          <div className="panel-inner">
            <section className="section">
              <h2>About</h2>
              <p>「通」は知識の証明ではなく、行動履歴。味わい、投稿し、海の変化を追いかける。</p>
            </section>
          </div>
        </section>
      </div>

      <FishModal fish={modalFish} onClose={() => setModalFish(null)} onSelectForShare={openFishForShare} />

      <BadgeToast
        visible={toastVisible}
        message={toastMessage}
        onClose={() => setToastVisible(false)}
        onViewHistory={() => {
          navigateToPanel("progress");
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
