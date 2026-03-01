import { useEffect, useMemo, useRef, useState } from "react";
import type { Fish } from "../types";

interface ShareStudioProps {
  fish: Fish | null;
  onOpenXIntent: (finalText: string, imageFile: File | null) => Promise<boolean> | boolean;
  onComplete: () => void;
}

export function ShareStudio({ fish, onOpenXIntent, onComplete }: ShareStudioProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [userComment, setUserComment] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
      if (capturedPhotoUrl) {
        URL.revokeObjectURL(capturedPhotoUrl);
      }
    };
  }, [capturedPhotoUrl]);

  const stopCamera = () => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const resetComposer = () => {
    setUserComment("");
    setCameraError(null);
    setCapturedPhoto(null);
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
      setCapturedPhotoUrl(null);
    }
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
    if (!video || !canvas) return;

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
        setCapturedPhoto(blob);
        if (capturedPhotoUrl) {
          URL.revokeObjectURL(capturedPhotoUrl);
        }
        setCapturedPhotoUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92
    );
  };

  const handleSubmit = async () => {
    if (!fish) return;

    setIsSubmitting(true);
    try {
      const imageFile = capturedPhoto
        ? new File([capturedPhoto], `nihonkai-${fish.id}-${Date.now()}.jpg`, { type: "image/jpeg" })
        : null;

      const posted = await onOpenXIntent(finalText, imageFile);
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
              <p>写真</p>
              <div className="actions">
                <button onClick={startCamera} disabled={isSubmitting}>
                  カメラを起動
                </button>
                <button onClick={capturePhoto} disabled={!cameraReady || isSubmitting}>
                  撮影する
                </button>
              </div>
              {cameraError ? <p>{cameraError}</p> : null}
              <video ref={videoRef} className="camera-preview" playsInline muted />
              {capturedPhotoUrl ? (
                <img src={capturedPhotoUrl} className="captured-preview" alt="撮影した写真プレビュー" />
              ) : null}
              <canvas ref={canvasRef} className="hidden-canvas" />
            </div>

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
