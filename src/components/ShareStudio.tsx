import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Fish } from "../types";

interface ShareStudioProps {
  fish: Fish | null;
  onOpenXIntent: (finalText: string, imageFile: File | null) => Promise<boolean> | boolean;
  onComplete: () => void;
}

type FrameOption = "none";

export function ShareStudio({ fish, onOpenXIntent, onComplete }: ShareStudioProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [userComment, setUserComment] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [frameOption, setFrameOption] = useState<FrameOption>("none");
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

    if (!file) {
      return;
    }

    setSelectedImageUrl(URL.createObjectURL(file));
  };

  const resetComposer = () => {
    setUserComment("");
    setCameraError(null);
    setFrameOption("none");
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
      const posted = await onOpenXIntent(finalText, selectedImageFile);
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
                  <button className="capture-button-in-frame" onClick={capturePhoto} disabled={isSubmitting}>
                    撮影する
                  </button>
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
                    checked={frameOption === "none"}
                    onChange={() => setFrameOption("none")}
                    disabled={isSubmitting}
                  />
                  フレームなし
                </label>
                <label className="frame-option frame-option-disabled">
                  <input type="radio" name="post-frame" disabled />
                  Nihonkai-tsu フレーム（準備中）
                </label>
              </div>
              <p className="frame-note">今後ここに、このアプリ専用フレームの選択と適用機能を追加します。</p>
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
