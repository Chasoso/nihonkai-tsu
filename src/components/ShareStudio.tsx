import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Fish, LandingsData, LandingSpecies } from "../types";

interface ShareStudioProps {
  fish: Fish | null;
  landings: LandingsData;
  openComposerNonce: number;
  onOpenXIntent: (finalText: string, imageFile: File | null) => Promise<boolean> | boolean;
  onComplete: () => void;
}

type FrameOption = "none" | "nihonkai";

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function getTwoYearMonthlySeries(species: LandingSpecies | undefined): number[] {
  if (!species) return [];

  const years = [...new Set(species.monthly.map((entry) => entry.year))].sort((a, b) => a - b);
  const targetYears = years.slice(-2);
  if (!targetYears.length) return [];

  const valueByYearMonth = new Map<string, number>();
  species.monthly.forEach((entry) => {
    valueByYearMonth.set(`${entry.year}-${entry.m}`, entry.value);
  });

  const series: number[] = [];
  targetYears.forEach((year) => {
    for (let month = 1; month <= 12; month++) {
      series.push(valueByYearMonth.get(`${year}-${month}`) ?? 0);
    }
  });

  return series;
}

function drawFlowBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(99, 210, 255, 0.20)");
  gradient.addColorStop(0.5, "rgba(92, 146, 196, 0.14)");
  gradient.addColorStop(1, "rgba(246, 194, 111, 0.18)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(99, 210, 255, 0.45)";
  ctx.lineWidth = Math.max(2, width * 0.0038);
  ctx.beginPath();
  ctx.moveTo(width * 0.04, height * 0.30);
  ctx.bezierCurveTo(width * 0.22, height * 0.18, width * 0.44, height * 0.52, width * 0.66, height * 0.36);
  ctx.bezierCurveTo(width * 0.80, height * 0.26, width * 0.90, height * 0.32, width * 0.98, height * 0.23);
  ctx.stroke();

  ctx.strokeStyle = "rgba(246, 194, 111, 0.40)";
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.beginPath();
  ctx.moveTo(width * 0.02, height * 0.74);
  ctx.bezierCurveTo(width * 0.24, height * 0.58, width * 0.52, height * 0.88, width * 0.80, height * 0.70);
  ctx.bezierCurveTo(width * 0.90, height * 0.64, width * 0.96, height * 0.70, width, height * 0.65);
  ctx.stroke();

  const blobGradient = ctx.createRadialGradient(width * 0.88, height * 0.20, 10, width * 0.88, height * 0.20, width * 0.25);
  blobGradient.addColorStop(0, "rgba(99, 210, 255, 0.22)");
  blobGradient.addColorStop(1, "rgba(99, 210, 255, 0)");
  ctx.fillStyle = blobGradient;
  ctx.fillRect(width * 0.63, 0, width * 0.37, height * 0.45);
}

function drawFishTitle(ctx: CanvasRenderingContext2D, width: number, height: number, fishName: string) {
  const panelWidth = width * 0.44;
  const panelHeight = height * 0.12;
  const pad = width * 0.04;

  ctx.save();
  drawRoundedRect(ctx, pad, pad, panelWidth, panelHeight, Math.max(10, width * 0.018));
  ctx.fillStyle = "rgba(8, 16, 25, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(246, 194, 111, 0.85)";
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.stroke();

  ctx.fillStyle = "#f8f6f2";
  ctx.font = `700 ${Math.max(14, width * 0.035)}px \"Hiragino Sans\", \"Yu Gothic\", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(fishName, pad + width * 0.025, pad + panelHeight / 2);
  ctx.restore();
}

function drawTrendChart(ctx: CanvasRenderingContext2D, width: number, height: number, series: number[], unit: string) {
  const boxWidth = width * 0.42;
  const boxHeight = height * 0.3;
  const margin = width * 0.03;
  const x = width - boxWidth - margin;
  const y = height - boxHeight - margin;

  ctx.save();
  drawRoundedRect(ctx, x, y, boxWidth, boxHeight, Math.max(10, width * 0.018));
  ctx.fillStyle = "rgba(8, 16, 25, 0.74)";
  ctx.fill();
  ctx.strokeStyle = "rgba(99, 210, 255, 0.8)";
  ctx.lineWidth = Math.max(2, width * 0.0028);
  ctx.stroke();

  ctx.fillStyle = "#f6f3ec";
  ctx.font = `600 ${Math.max(11, width * 0.021)}px \"Hiragino Sans\", \"Yu Gothic\", sans-serif`;
  ctx.fillText("過去2年の漁獲量推移", x + boxWidth * 0.07, y + boxHeight * 0.18);

  if (!series.length) {
    ctx.fillStyle = "rgba(246, 243, 236, 0.75)";
    ctx.font = `500 ${Math.max(10, width * 0.018)}px \"Hiragino Sans\", \"Yu Gothic\", sans-serif`;
    ctx.fillText("データなし", x + boxWidth * 0.07, y + boxHeight * 0.56);
    ctx.restore();
    return;
  }

  const chartX = x + boxWidth * 0.07;
  const chartY = y + boxHeight * 0.30;
  const chartW = boxWidth * 0.86;
  const chartH = boxHeight * 0.56;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(1, max - min);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chartX, chartY + chartH);
  ctx.lineTo(chartX + chartW, chartY + chartH);
  ctx.stroke();

  ctx.strokeStyle = "rgba(99, 210, 255, 0.95)";
  ctx.lineWidth = Math.max(2, width * 0.0026);
  ctx.beginPath();
  series.forEach((value, idx) => {
    const px = chartX + (chartW * idx) / Math.max(1, series.length - 1);
    const py = chartY + chartH - ((value - min) / range) * chartH;
    if (idx === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(246, 243, 236, 0.85)";
  ctx.font = `500 ${Math.max(9, width * 0.016)}px \"Hiragino Sans\", \"Yu Gothic\", sans-serif`;
  ctx.fillText(`max ${Math.round(max)} ${unit}`, chartX, chartY + chartH + boxHeight * 0.16);
  ctx.restore();
}

async function loadFileImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("failed to load image"));
    };
    img.src = url;
  });
}

async function composeFramedImage(file: File, fish: Fish, landings: LandingsData): Promise<File> {
  const img = await loadFileImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return file;
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  drawFlowBackground(ctx, canvas.width, canvas.height);
  drawFishTitle(ctx, canvas.width, canvas.height, fish.name);

  const species = landings.species.find((item) => item.id === fish.id);
  const series = getTwoYearMonthlySeries(species);
  drawTrendChart(ctx, canvas.width, canvas.height, series, landings.meta.unit);

  const borderInset = Math.max(6, canvas.width * 0.012);
  drawRoundedRect(
    ctx,
    borderInset,
    borderInset,
    canvas.width - borderInset * 2,
    canvas.height - borderInset * 2,
    Math.max(12, canvas.width * 0.02)
  );
  ctx.strokeStyle = "rgba(246, 194, 111, 0.9)";
  ctx.lineWidth = Math.max(3, canvas.width * 0.005);
  ctx.stroke();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
  if (!blob) {
    return file;
  }

  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${base}_framed.jpg`, { type: "image/jpeg" });
}

export function ShareStudio({ fish, landings, openComposerNonce, onOpenXIntent, onComplete }: ShareStudioProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [userComment, setUserComment] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [frameOption, setFrameOption] = useState<FrameOption>("nihonkai");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fixedTemplate = fish?.share.text ?? "";
  const finalText = useMemo(() => {
    if (!fish) return "";
    if (!userComment.trim()) return fixedTemplate;
    return `${userComment.trim()}\n\n${fixedTemplate}`;
  }, [fish, userComment, fixedTemplate]);
  const previewSeries = useMemo(() => {
    if (!fish) return [];
    const species = landings.species.find((item) => item.id === fish.id);
    return getTwoYearMonthlySeries(species);
  }, [fish, landings]);
  const previewPolyline = useMemo(() => {
    if (!previewSeries.length) return "";
    const min = Math.min(...previewSeries);
    const max = Math.max(...previewSeries);
    const range = Math.max(1, max - min);
    const xMin = 4;
    const xMax = 236;
    const yMin = 10;
    const yMax = 90;
    return previewSeries
      .map((value, idx) => {
        const x = xMin + ((xMax - xMin) * idx) / Math.max(1, previewSeries.length - 1);
        const y = yMax - ((value - min) / range) * (yMax - yMin);
        return `${x},${y}`;
      })
      .join(" ");
  }, [previewSeries]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
      }
    };
  }, [selectedImageUrl]);

  useEffect(() => {
    if (!fish) return;
    setComposerOpen(true);
  }, [openComposerNonce]);

  const stopCamera = () => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const updateSelectedImage = (file: File | null) => {
    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
      setSelectedImageUrl(null);
    }

    setSelectedImageFile(file);
    if (!file) return;
    setSelectedImageUrl(URL.createObjectURL(file));
  };

  const resetComposer = () => {
    setUserComment("");
    setCameraError(null);
    setFrameOption("nihonkai");
    updateSelectedImage(null);
    stopCamera();
  };

  const openComposer = () => {
    if (!fish) return;
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    resetComposer();
  };

  const startCamera = async () => {
    setCameraError(null);
    updateSelectedImage(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("このブラウザではカメラ機能を利用できません。");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError("カメラにアクセスできませんでした。権限設定を確認してください。");
      setCameraReady(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !fish) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `nihonkai-${fish.id}-${Date.now()}.jpg`, { type: "image/jpeg" });
        updateSelectedImage(file);
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  };

  const handlePickImageClick = () => {
    fileInputRef.current?.click();
  };

  const handlePickImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    stopCamera();
    updateSelectedImage(file);
    event.target.value = "";
  };

  const handleSubmit = async () => {
    if (!fish) return;

    setIsSubmitting(true);
    try {
      let imageToPost = selectedImageFile;
      if (imageToPost && frameOption === "nihonkai") {
        imageToPost = await composeFramedImage(imageToPost, fish, landings);
      }

      const posted = await onOpenXIntent(finalText, imageToPost);
      if (!posted) return;

      onComplete();
      closeComposer();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="share-studio" className="section">
      <h2>Share Studio</h2>
      <div className="actions">
        <p>選択中の魚: {fish ? fish.name : "未選択"}</p>
        <button onClick={openComposer} disabled={!fish}>
          Xに投稿する
        </button>
      </div>

      {composerOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="X投稿ポップアップ">
          <div className="modal x-post-modal">
            <button className="close-button" onClick={closeComposer} aria-label="閉じる">
              ×
            </button>
            <h3>Xに投稿する</h3>
            <p>対象の魚: {fish?.name}</p>

            <label>
              コメント
              <textarea
                value={userComment}
                onChange={(event) => setUserComment(event.target.value)}
                placeholder="コメントを入力してください"
                disabled={!fish || isSubmitting}
              />
            </label>

            <div className="fixed-template">
              <p>固定テンプレート</p>
              <pre>{fixedTemplate || "魚を選ぶと表示されます"}</pre>
            </div>

            <div className="camera-area">
              <p>画像</p>
              <div className="actions">
                <button onClick={startCamera} disabled={isSubmitting}>
                  カメラ起動
                </button>
                <button onClick={handlePickImageClick} disabled={isSubmitting}>
                  画像を選択
                </button>
              </div>

              <input
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/*"
                onChange={handlePickImage}
              />

              {cameraError ? <p>{cameraError}</p> : null}

              <div className="media-frame">
                {selectedImageUrl ? (
                  <img src={selectedImageUrl} className="captured-preview" alt="投稿画像プレビュー" />
                ) : (
                  <>
                    <video ref={videoRef} className="camera-preview" playsInline muted />
                    {!cameraReady ? <div className="preview-placeholder">画像を撮影または選択するとここに表示されます</div> : null}
                  </>
                )}

                {cameraReady && !selectedImageUrl ? (
                  <button
                    className="capture-button-in-frame"
                    onClick={capturePhoto}
                    disabled={isSubmitting}
                    aria-label="撮影する"
                  >
                    <span className="capture-icon">
                      <span className="capture-icon-inner" />
                    </span>
                  </button>
                ) : null}

                {frameOption === "nihonkai" ? (
                  <div className="frame-overlay" aria-hidden="true">
                    <div className="frame-flow frame-flow-a" />
                    <div className="frame-flow frame-flow-b" />
                    <div className="frame-fish-badge">{fish?.name ?? ""}</div>
                    <div className="frame-chart-card">
                      <p>過去2年の漁獲量推移</p>
                      {previewPolyline ? (
                        <svg viewBox="0 0 240 100" preserveAspectRatio="none">
                          <polyline points={previewPolyline} />
                        </svg>
                      ) : (
                        <small>データなし</small>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="frame-area">
              <p>投稿フレーム</p>
              <div className="frame-options">
                <label className="frame-option">
                  <input
                    type="radio"
                    name="post-frame"
                    checked={frameOption === "nihonkai"}
                    onChange={() => setFrameOption("nihonkai")}
                    disabled={isSubmitting}
                  />
                  Nihonkai-tsu フレーム
                </label>
                <label className="frame-option">
                  <input
                    type="radio"
                    name="post-frame"
                    checked={frameOption === "none"}
                    onChange={() => setFrameOption("none")}
                    disabled={isSubmitting}
                  />
                  フレームなし
                </label>
              </div>
              <p className="frame-note">フレームには左上に魚名、右下に過去2年の漁獲量推移が表示されます。</p>
            </div>

            <canvas ref={canvasRef} className="hidden-canvas" />

            <div className="actions">
              <button onClick={handleSubmit} disabled={!fish || isSubmitting}>
                {isSubmitting ? "投稿中..." : "投稿する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
