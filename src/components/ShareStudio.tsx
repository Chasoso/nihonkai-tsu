import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { createPortal } from "react-dom";
import type { Fish, LandingsData, LandingSpecies } from "../types";
import { StepFlowHeader } from "./StepFlowHeader";
import {
  generatePostText,
  getFallbackPostText,
  type AiInputImagePayload,
  type PostTextOption,
  type PostTextOptionType
} from "../lib/postText";
import { getMetricsSummary, trackMetric, type MetricsSummary } from "../lib/metrics";

interface ShareStudioProps {
  fish: Fish | null;
  fishTypeOptions: string[];
  landings: LandingsData;
  openComposerNonce: number;
  onOpenXIntent: (finalText: string, imageFile: File | null) => Promise<boolean> | boolean;
  onComplete: () => void;
  onPostExperience?: (metricType: "copy" | "x_click", summary?: MetricsSummary | null) => void;
}

type FrameOption = "none" | "nihonkai";
type ComposerStep = 1 | 2 | 3;

const DEFAULT_MAX_AI_IMAGE_EDGE_PX = 512;
const DEFAULT_AI_IMAGE_QUALITY = 0.68;
const DEFAULT_AI_CACHE_TTL_MS = 180_000;
const DEFAULT_AI_API_URL = "/api/generate-post-text";
const FALLBACK_FISH_CANDIDATES = ["aji", "saba", "iwashi", "other"];
const FIXED_POST_HASHTAGS = ["#石川の魚", "#日本海", "#nihonkai_tsu"];

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

function postOptionLabel(type: PostTextOptionType): string {
  if (type === "short") return "短くサクッと";
  if (type === "standard") return "ちょうどいい";
  return "石川らしさ強め";
}

function postOptionHint(type: PostTextOptionType): string {
  if (type === "short") return "140文字以内でサクッと";
  if (type === "standard") return "食べ方も少し入る";
  return "観光向け・地域PR寄り";
}

function formatPostText(input: string, appUrl: string): string {
  const baseText = input.trim();
  const existingTags = new Set(
    (baseText.match(/#[^\s#]+/g) ?? []).map((tag) => tag.trim().toLowerCase())
  );

  const tagsToAppend = FIXED_POST_HASHTAGS.filter((tag) => !existingTags.has(tag.toLowerCase()));
  const lines: string[] = [baseText];

  if (tagsToAppend.length) {
    lines.push(tagsToAppend.join(" "));
  }

  const hasUrl = appUrl && baseText.includes(appUrl);
  if (appUrl && !hasUrl) {
    lines.push(appUrl);
  }

  return lines.filter((line) => line.trim().length > 0).join("\n");
}

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

function findSpeciesBySelection(landings: LandingsData, selection: string): LandingSpecies | undefined {
  const key = selection.trim().toLowerCase();
  if (!key || key === "other") return undefined;
  return landings.species.find((item) => {
    const id = item.id.trim().toLowerCase();
    const nameJa = item.name_ja.trim().toLowerCase();
    return id === key || nameJa === key;
  });
}

function drawFlowBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.04)");
  gradient.addColorStop(0.55, "rgba(9, 26, 45, 0.06)");
  gradient.addColorStop(1, "rgba(9, 26, 45, 0.24)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(209, 236, 255, 0.22)";
  ctx.lineWidth = Math.max(1.5, width * 0.0024);
  ctx.beginPath();
  ctx.moveTo(width * 0.04, height * 0.78);
  ctx.bezierCurveTo(width * 0.28, height * 0.70, width * 0.54, height * 0.87, width * 0.82, height * 0.76);
  ctx.bezierCurveTo(width * 0.90, height * 0.73, width * 0.95, height * 0.76, width * 1.02, height * 0.72);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = Math.max(1, width * 0.0018);
  ctx.beginPath();
  ctx.moveTo(width * 0.04, height * 0.84);
  ctx.bezierCurveTo(width * 0.22, height * 0.78, width * 0.53, height * 0.93, width * 0.88, height * 0.82);
  ctx.stroke();
}

function drawFishTitle(ctx: CanvasRenderingContext2D, width: number, height: number, fishName: string) {
  const panelWidth = width * 0.28;
  const panelHeight = height * 0.09;
  const pad = width * 0.04;

  ctx.save();
  drawRoundedRect(ctx, pad, pad, panelWidth, panelHeight, Math.max(10, width * 0.018));
  ctx.fillStyle = "rgba(255, 255, 255, 0.26)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.44)";
  ctx.lineWidth = Math.max(1.2, width * 0.0018);
  ctx.stroke();

  ctx.fillStyle = "#f3f8ff";
  ctx.font = `700 ${Math.max(12, width * 0.022)}px "Hiragino Sans", "Yu Gothic", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(fishName, pad + width * 0.018, pad + panelHeight / 2);
  ctx.restore();
}

function drawTrendChart(ctx: CanvasRenderingContext2D, width: number, height: number, series: number[], unit: string) {
  const boxWidth = width * 0.42;
  const boxHeight = height * 0.28;
  const margin = width * 0.03;
  const x = width - boxWidth - margin;
  const y = height - boxHeight - margin;

  ctx.save();
  const fade = ctx.createRadialGradient(
    width * 0.92,
    height * 0.9,
    0,
    width * 0.92,
    height * 0.9,
    Math.max(boxWidth * 1.26, height * 0.42)
  );
  fade.addColorStop(0, "rgba(6, 30, 56, 0.62)");
  fade.addColorStop(0.32, "rgba(6, 30, 56, 0.42)");
  fade.addColorStop(0.56, "rgba(6, 30, 56, 0.22)");
  fade.addColorStop(0.76, "rgba(6, 30, 56, 0.1)");
  fade.addColorStop(1, "rgba(6, 30, 56, 0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, height);

  if (!series.length) {
    ctx.fillStyle = "rgba(240, 248, 255, 0.9)";
    ctx.font = `600 ${Math.max(10, width * 0.016)}px "Inter", "Noto Sans JP", sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("Nihonkai-tsu 2026", x + boxWidth - 2, y + boxHeight - 6);
    ctx.restore();
    return;
  }

  const chartX = x + boxWidth * 0.04;
  const chartY = y + boxHeight * 0.22;
  const chartW = boxWidth * 0.92;
  const chartH = boxHeight * 0.46;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(1, max - min);

  ctx.strokeStyle = "rgba(240, 248, 255, 0.38)";
  ctx.lineWidth = Math.max(1, width * 0.0015);
  ctx.beginPath();
  ctx.moveTo(chartX, chartY + chartH);
  ctx.lineTo(chartX + chartW, chartY + chartH);
  ctx.stroke();

  // Draw a thin dark outline first so the chart line stays visible on bright backgrounds.
  ctx.strokeStyle = "rgba(17, 44, 76, 0.55)";
  ctx.lineWidth = Math.max(2.8, width * 0.0032);
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

  ctx.strokeStyle = "rgba(221, 242, 255, 0.96)";
  ctx.lineWidth = Math.max(1.8, width * 0.0022);
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

  ctx.fillStyle = "rgba(240, 248, 255, 0.84)";
  ctx.font = `500 ${Math.max(8, width * 0.012)}px "Hiragino Sans", "Yu Gothic", sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`貍∫佐謗ｨ遘ｻ`, chartX, y + boxHeight - 20);
  ctx.fillText(`max ${Math.round(max)} ${unit}`, chartX, y + boxHeight - 7);

  ctx.textAlign = "right";
  ctx.font = `600 ${Math.max(10, width * 0.015)}px "Inter", "Noto Sans JP", sans-serif`;
  ctx.fillText("Nihonkai-tsu 2026", x + boxWidth - 2, y + boxHeight - 6);
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return `size-${buffer.byteLength}`;
  }

  const hash = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildShareImage(file: File, fish: Fish, landings: LandingsData): Promise<File> {
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

export async function buildAiInputImage(file: File, maxEdgePx: number, quality: number): Promise<AiInputImagePayload> {
  const img = await loadFileImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const scale = Math.min(1, maxEdgePx / Math.max(srcW, srcH));
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("failed_to_get_canvas_context");
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) {
    throw new Error("failed_to_encode_image");
  }

  const buffer = await blob.arrayBuffer();
  return {
    imageBase64: arrayBufferToBase64(buffer),
    mimeType: "image/jpeg",
    imageHash: await sha256Hex(buffer),
    width: targetW,
    height: targetH
  };
}

export function ShareStudio({
  fish,
  fishTypeOptions,
  landings,
  openComposerNonce,
  onOpenXIntent,
  onComplete,
  onPostExperience
}: ShareStudioProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [cameraPreviewOpen, setCameraPreviewOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStreamVersion, setCameraStreamVersion] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [frameOption, setFrameOption] = useState<FrameOption>("nihonkai");
  const [currentStep, setCurrentStep] = useState<ComposerStep>(1);
  const [fishCandidates, setFishCandidates] = useState<string[]>([]);
  const [isEstimatingFish, setIsEstimatingFish] = useState(false);
  const [fishEstimateError, setFishEstimateError] = useState<string | null>(null);
  const [pendingFishType, setPendingFishType] = useState("");
  const [confirmedFishType, setConfirmedFishType] = useState("");
  const [otherFishQuery, setOtherFishQuery] = useState("");
  const [selectedOtherFish, setSelectedOtherFish] = useState("");
  const [generatedOptions, setGeneratedOptions] = useState<PostTextOption[]>([]);
  const [selectedOptionType, setSelectedOptionType] = useState<PostTextOptionType>("standard");
  const [editablePostText, setEditablePostText] = useState("");
  const [generationNote, setGenerationNote] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageSaved, setImageSaved] = useState(false);
  const [postMetricsSummary, setPostMetricsSummary] = useState<MetricsSummary | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalScrollRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastOpenNonceRef = useRef(openComposerNonce);
  const estimateRequestIdRef = useRef(0);

  const aiApiUrl = String(import.meta.env.VITE_POST_TEXT_API_URL ?? DEFAULT_AI_API_URL);
  const aiEnabled = envFlag(import.meta.env.VITE_AI_POST_TEXT_ENABLED, true);
  const aiMaxEdgePx = toNumber(import.meta.env.VITE_AI_IMAGE_MAX_EDGE_PX, DEFAULT_MAX_AI_IMAGE_EDGE_PX);
  const aiImageQuality = toNumber(import.meta.env.VITE_AI_IMAGE_QUALITY, DEFAULT_AI_IMAGE_QUALITY);
  const aiCacheTtlMs = toNumber(import.meta.env.VITE_AI_CACHE_TTL_MS, DEFAULT_AI_CACHE_TTL_MS);
  const tone = "friendly";
  const appUrl = useMemo(() => {
    const explicit = String(import.meta.env.VITE_APP_URL ?? "").trim();
    if (explicit) return explicit;
    if (typeof window !== "undefined") {
      return new URL(import.meta.env.BASE_URL ?? "/", window.location.origin).toString();
    }
    return "";
  }, []);

  const previewSelectionKey = useMemo(() => {
    if (pendingFishType === "other") {
      const otherSelected = selectedOtherFish.trim();
      if (otherSelected) return otherSelected;
    }
    const pending = pendingFishType.trim();
    if (pending) return pending;
    const confirmed = confirmedFishType.trim();
    if (confirmed) return confirmed;
    return fish?.id ?? "";
  }, [pendingFishType, selectedOtherFish, confirmedFishType, fish?.id]);

  const previewSeries = useMemo(() => {
    const species =
      findSpeciesBySelection(landings, previewSelectionKey) ??
      (fish ? landings.species.find((item) => item.id === fish.id) : undefined);
    return getTwoYearMonthlySeries(species);
  }, [landings, previewSelectionKey, fish]);

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

  const shareHashtags = useMemo(() => {
    const matches = fish?.share.text.match(/#[^\s#]+/g) ?? [];
    const unique = Array.from(new Set(matches));
    if (unique.length) return unique.slice(0, 4);
    return ["#譌･譛ｬ豬ｷ騾・026", "#螟峨ｏ繧区ｵｷ繧貞袖繧上≧"];
  }, [fish?.share.text]);

  const fallbackFishCandidates = useMemo(() => {
    const list: string[] = [];
    for (const name of fishTypeOptions) {
      const normalized = name.trim().toLowerCase();
      if (!normalized || list.includes(normalized)) continue;
      list.push(normalized);
      if (list.length >= 3) break;
    }
    if (list.length < 3) {
      for (const name of FALLBACK_FISH_CANDIDATES) {
        if (!list.includes(name) && name !== "other") {
          list.push(name);
        }
        if (list.length >= 3) break;
      }
    }
    if (!list.includes("other")) {
      list.push("other");
    }
    return list.slice(0, 4);
  }, [fishTypeOptions]);

  const step1Complete = Boolean(selectedImageFile);
  const step1PreviewVisible = step1Complete || cameraPreviewOpen;
  const step2Complete = Boolean(confirmedFishType.trim());
  const displayFishLabel = confirmedFishType.trim() || "未選択";
  const frameFishBadgeLabel = confirmedFishType.trim();
  const needsOtherFishSelection = pendingFishType === "other";
  const canConfirmFishType = Boolean(
    pendingFishType.trim() && (!needsOtherFishSelection || selectedOtherFish.trim())
  );
  const selectedOption = useMemo(
    () => generatedOptions.find((item) => item.type === selectedOptionType) ?? null,
    [generatedOptions, selectedOptionType]
  );
  const searchableFishOptions = useMemo(() => {
    const unique = new Set<string>();
    const list: string[] = [];
    for (const name of fishTypeOptions) {
      const label = name.trim();
      if (!label || unique.has(label)) continue;
      unique.add(label);
      list.push(label);
    }
    return list;
  }, [fishTypeOptions]);
  const filteredOtherFishOptions = useMemo(() => {
    if (!needsOtherFishSelection) return [];
    const query = otherFishQuery.trim().toLowerCase();
    if (!query) return searchableFishOptions.slice(0, 24);
    return searchableFishOptions
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 24);
  }, [needsOtherFishSelection, otherFishQuery, searchableFishOptions]);

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
    if (typeof document === "undefined" || !composerOpen) return;

    const { body, documentElement } = document;
    const originalBodyOverflow = body.style.overflow;
    const originalBodyTouchAction = body.style.touchAction;
    const originalHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.overflow = originalBodyOverflow;
      body.style.touchAction = originalBodyTouchAction;
      documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [composerOpen]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraPreviewOpen || !video || !stream || selectedImageUrl) return;

    let cancelled = false;
    video.srcObject = stream;
    void video
      .play()
      .then(() => {
        if (!cancelled) {
          setCameraReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError("カメラ映像を表示できませんでした。");
          setCameraReady(false);
          setCameraPreviewOpen(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cameraPreviewOpen, selectedImageUrl, cameraStreamVersion]);

  useEffect(() => {
    if (openComposerNonce === lastOpenNonceRef.current) return;
    lastOpenNonceRef.current = openComposerNonce;
    if (!fish) return;
    setComposerOpen(true);
  }, [openComposerNonce, fish]);

  useEffect(() => {
    if (!composerOpen) return;
    const node = modalScrollRef.current;
    if (!node) return;

    const rafId = window.requestAnimationFrame(() => {
      if (typeof node.scrollTo === "function") {
        node.scrollTo({ top: 0, behavior: "auto" });
      } else {
        node.scrollTop = 0;
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [composerOpen, currentStep]);

  useEffect(() => {
    if (fish?.name) {
      setPendingFishType("");
      setConfirmedFishType("");
    } else {
      setPendingFishType("");
      setConfirmedFishType("");
    }
    setFishCandidates([]);
    setFishEstimateError(null);
    setIsEstimatingFish(false);
    setOtherFishQuery("");
    setSelectedOtherFish("");
    setCurrentStep(1);
  }, [fish?.name]);

  useEffect(() => {
    if (pendingFishType !== "other") {
      setOtherFishQuery("");
      setSelectedOtherFish("");
    }
  }, [pendingFishType]);

  const stopCamera = () => {
    setCameraPreviewOpen(false);
    setCameraReady(false);
    setCameraStreamVersion(0);
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const normalizeFishCandidates = (input: unknown): string[] => {
    if (!Array.isArray(input)) {
      return [...fallbackFishCandidates];
    }

    const labels: string[] = [];
    for (const item of input) {
      const label =
        typeof item === "object" && item !== null
          ? String((item as { label?: unknown; id?: unknown }).label ?? (item as { id?: unknown }).id ?? "")
          : "";
      const normalized = label.trim().toLowerCase();
      if (!normalized || labels.includes(normalized)) continue;
      labels.push(normalized);
      if (labels.length >= 4) break;
    }

    if (!labels.includes("other")) {
      labels.push("other");
    }
    return labels.slice(0, 4);
  };

  const estimateFishCandidates = async (file: File) => {
    const reqId = estimateRequestIdRef.current + 1;
    estimateRequestIdRef.current = reqId;
    setIsEstimatingFish(true);
    setFishEstimateError(null);

    try {
      const aiImage = await buildAiInputImage(file, aiMaxEdgePx, aiImageQuality);
      const response = await fetch(aiApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "estimate_fish_candidates",
          imageBase64: aiImage.imageBase64,
          mimeType: aiImage.mimeType
        })
      });

      if (!response.ok) {
        throw new Error(`http_${response.status}`);
      }

      const json = (await response.json()) as { candidates?: unknown };
      if (estimateRequestIdRef.current !== reqId) return;
      const nextCandidates = normalizeFishCandidates(json.candidates);
      setFishCandidates(nextCandidates);
      setPendingFishType(nextCandidates[0] ?? "");
    } catch {
      if (estimateRequestIdRef.current !== reqId) return;
      setFishCandidates([...fallbackFishCandidates]);
      setPendingFishType(fallbackFishCandidates[0] ?? "");
      setFishEstimateError("魚種推定に失敗したため、候補を表示しています。");
    } finally {
      if (estimateRequestIdRef.current === reqId) {
        setIsEstimatingFish(false);
      }
    }
  };

  const updateSelectedImage = (file: File | null) => {
    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
      setSelectedImageUrl(null);
    }

    setSelectedImageFile(file);
    setCurrentStep(file ? 2 : 1);
    setConfirmedFishType("");
    setPendingFishType("");
    setOtherFishQuery("");
    setSelectedOtherFish("");
    setFishCandidates([]);
    setFishEstimateError(null);
    setGeneratedOptions([]);
    setSelectedOptionType("standard");
    setEditablePostText("");
    setGenerationNote(null);
    setCopied(false);
    setImageSaved(false);
    setPostMetricsSummary(null);
    if (!file) {
      setIsEstimatingFish(false);
      return;
    }
    setSelectedImageUrl(URL.createObjectURL(file));
    void estimateFishCandidates(file);
  };

  const resetComposer = () => {
    setCameraError(null);
    setFrameOption("nihonkai");
    updateSelectedImage(null);
    setGeneratedOptions([]);
    setSelectedOptionType("standard");
    setEditablePostText("");
    setGenerationNote(null);
    setCopied(false);
    setImageSaved(false);
    setPostMetricsSummary(null);
    stopCamera();
    setPendingFishType("");
    setConfirmedFishType("");
    setOtherFishQuery("");
    setSelectedOtherFish("");
    setFishCandidates([]);
    setFishEstimateError(null);
    setIsEstimatingFish(false);
    setCurrentStep(1);
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
    updateSelectedImage(null);
    setCameraPreviewOpen(true);
    setCameraReady(false);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("このブラウザではカメラを利用できません。");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });

      streamRef.current = stream;
      setCameraStreamVersion((value) => value + 1);
    } catch {
      setCameraError("カメラにアクセスできませんでした。許可設定をご確認ください。");
      setCameraPreviewOpen(false);
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

  const handleConfirmFishType = () => {
    const nextFishType = needsOtherFishSelection ? selectedOtherFish.trim() : pendingFishType.trim();
    if (!nextFishType) return;
    setConfirmedFishType(nextFishType);
    setCurrentStep(3);
    setGeneratedOptions([]);
    setSelectedOptionType("standard");
    setEditablePostText("");
    setGenerationNote(null);
    setCopied(false);
    setImageSaved(false);
    setPostMetricsSummary(null);
  };

  const handleGeneratePostText = async () => {
    const fishType = confirmedFishType.trim() || fish?.name || "fish";

    setIsGenerating(true);
    setCopied(false);
    setImageSaved(false);
    setPostMetricsSummary(null);
    try {
      if (!selectedImageFile) {
        const fallback = getFallbackPostText(fishType);
        const options: PostTextOption[] = [
          { type: "short", text: fallback.slice(0, 60) },
          { type: "standard", text: fallback },
          { type: "pr", text: `${fallback}\nDiscover more local seafood.` }
        ];
        setGeneratedOptions(options);
        setSelectedOptionType("standard");
        setEditablePostText(options[1].text);
        setGenerationNote("No image selected. Showing fallback text.");
        return;
      }

      const aiImage = await buildAiInputImage(selectedImageFile, aiMaxEdgePx, aiImageQuality);
      const result = await generatePostText({
        apiUrl: aiApiUrl,
        image: aiImage,
        fishType,
        tone,
        enabled: aiEnabled,
        cacheTtlMs: aiCacheTtlMs
      });

      setGeneratedOptions(result.options);
      const defaultOption = result.options.find((item) => item.type === "standard") ?? result.options[0];
      setSelectedOptionType(defaultOption.type);
      setEditablePostText(defaultOption.text);
      if (result.fallbackUsed) {
        setGenerationNote("AI generation failed. Showing fallback text.");
      } else {
        setGenerationNote("AI generated this post text.");
      }
    } catch {
      const fallback = getFallbackPostText(fishType);
      const options: PostTextOption[] = [
        { type: "short", text: fallback.slice(0, 60) },
        { type: "standard", text: fallback },
        { type: "pr", text: `${fallback}\nDiscover more local seafood.` }
      ];
      setGeneratedOptions(options);
      setSelectedOptionType("standard");
      setEditablePostText(options[1].text);
      setGenerationNote("Generation failed. Showing fallback text.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleコピーText = async () => {
    if (!editablePostText.trim()) return;
    try {
      const finalText = formatPostText(editablePostText, appUrl);
      await navigator.clipboard.writeText(finalText);
      const metricFishId = confirmedFishType.trim().toLowerCase();
      const metricFishLabel = confirmedFishType.trim() || fish?.name || "unknown";
      const metricVariant = selectedOptionType;
      onPostExperience?.("copy");
      void (async () => {
        const tracked = await trackMetric({
          apiUrl: aiApiUrl,
          metricType: "copy",
          fishId: metricFishId,
          fishLabel: metricFishLabel,
          selectedVariant: metricVariant
        });
        if (!tracked) return;
        const summary = await getMetricsSummary({
          apiUrl: aiApiUrl,
          fishId: metricFishId
        });
        if (!summary) return;
        setPostMetricsSummary(summary);
        onPostExperience?.("copy", summary);
      })();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleSaveImage = async () => {
    if (!selectedImageFile) return;

    try {
      let fileToSave = selectedImageFile;
      if (fish && frameOption === "nihonkai") {
        fileToSave = await buildShareImage(fileToSave, fish, landings);
      }

      const downloadUrl = URL.createObjectURL(fileToSave);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileToSave.name || `nihonkai-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setImageSaved(true);
      window.setTimeout(() => setImageSaved(false), 1600);
    } catch {
      setImageSaved(false);
    }
  };

  const handleOpenXPost = async () => {
    if (!fish || !editablePostText.trim()) return;

    setIsSubmitting(true);
    const metricFishId = confirmedFishType.trim().toLowerCase();
    const metricFishLabel = confirmedFishType.trim() || fish?.name || "unknown";
    const metricVariant = selectedOptionType;
    onPostExperience?.("x_click");
    void (async () => {
      const tracked = await trackMetric({
        apiUrl: aiApiUrl,
        metricType: "x_click",
        fishId: metricFishId,
        fishLabel: metricFishLabel,
        selectedVariant: metricVariant
      });
      if (!tracked) return;
      const summary = await getMetricsSummary({
        apiUrl: aiApiUrl,
        fishId: metricFishId
      });
      if (!summary) return;
      setPostMetricsSummary(summary);
      onPostExperience?.("x_click", summary);
    })();
    try {
      let imageToPost = selectedImageFile;
      if (imageToPost && frameOption === "nihonkai") {
        imageToPost = await buildShareImage(imageToPost, fish, landings);
      }

      const finalText = formatPostText(editablePostText, appUrl);
      const posted = await onOpenXIntent(finalText, imageToPost);
      if (!posted) return;

      onComplete();
      closeComposer();
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToStep2 = () => {
    if (!step1Complete) return;
    setCurrentStep(2);
  };

  return (
    <section id="share-studio" className="section share-studio-section">
      <div className="card share-studio-card">
        <div className="share-studio-copy">
          <h2 className="section-title">投稿を作る</h2>
          <p className="section-lead">
            写真と投稿文をその場で作成して、海の旬をシェアしましょう。
          </p>
          <p className="share-target-fish">対象の魚: {fish ? fish.name : "未選択"}</p>
          <div className="share-hashtag-list" aria-label="投稿ハッシュタグ">
            {shareHashtags.map((tag) => (
              <span key={tag} className="share-hashtag-chip">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="share-studio-cta-wrap">
          <button className="share-studio-cta" onClick={openComposer} disabled={!fish}>
            投稿をはじめる
          </button>
        </div>
      </div>

      {composerOpen && typeof document !== "undefined" ? createPortal(
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="X投稿ポップアップ">
          <div className="modal x-post-modal">
            <button className="close-button" onClick={closeComposer} aria-label="閉じる">
              x
            </button>
            <div className="x-post-modal-header">
              <h3>Xに投稿</h3>
            </div>
            <div ref={modalScrollRef} className="x-post-modal-scroll">
              <p>対象の魚: {displayFishLabel}</p>

              <StepFlowHeader
                currentStep={currentStep}
                step1Complete={step1Complete}
                step2Complete={step2Complete}
                onStepChange={(step) => {
                  if (step === 1) {
                    setCurrentStep(1);
                    return;
                  }
                  if (step === 2 && step1Complete) {
                    setCurrentStep(2);
                    return;
                  }
                  if (step === 3 && step2Complete) {
                    setCurrentStep(3);
                  }
                }}
              />

              <input
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                onChange={handlePickImage}
              />

            {currentStep === 1 ? (
            <section className="camera-area composer-step-stage" aria-label="step 1 photo">
              <div className="composer-step-layout composer-step-layout-stacked">
                <div className="composer-step-heading">
                  <h4>Step 1: 写真を撮る / 選ぶ</h4>
                  <p className="frame-note">まずは写真を1枚選ぶだけで進めます。</p>
                </div>

                {!step1Complete ? (
                  <div className="composer-step-entry">
                    <div className="actions composer-photo-actions">
                      <button onClick={startCamera} disabled={isGenerating || isSubmitting}>
                        カメラを開く
                      </button>
                      <button onClick={handlePickImageClick} disabled={isGenerating || isSubmitting}>
                        画像を選ぶ
                      </button>
                    </div>
                    {cameraError ? <p className="frame-note">{cameraError}</p> : null}
                  </div>
                ) : null}

                {step1PreviewVisible ? (
                  <div className="composer-step-expanded composer-step-expanded-photo">
                    {step1Complete ? (
                      <div className="composer-frame-compact" role="radiogroup" aria-label="post frame options">
                        <span className="composer-frame-label">投稿フレーム</span>
                        <div className="composer-frame-toggle">
                          <button
                            type="button"
                            className={
                              frameOption === "nihonkai"
                                ? "composer-frame-chip composer-frame-chip-active"
                                : "composer-frame-chip"
                            }
                            onClick={() => setFrameOption("nihonkai")}
                            disabled={isGenerating || isSubmitting}
                            aria-pressed={frameOption === "nihonkai"}
                          >
                            Nihonkai-tsu
                          </button>
                          <button
                            type="button"
                            className={
                              frameOption === "none"
                                ? "composer-frame-chip composer-frame-chip-active"
                                : "composer-frame-chip"
                            }
                            onClick={() => setFrameOption("none")}
                            disabled={isGenerating || isSubmitting}
                            aria-pressed={frameOption === "none"}
                          >
                            なし
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="composer-step-preview composer-step-preview-wide">
                      <div className="media-frame">
                        {selectedImageUrl ? (
                          <img src={selectedImageUrl} className="captured-preview" alt="post image preview" />
                        ) : (
                          <>
                            <video ref={videoRef} className="camera-preview" playsInline muted />
                            {!cameraReady ? <div className="preview-placeholder">写真を撮るか画像を選んでください。</div> : null}
                          </>
                        )}

                        {cameraReady && !selectedImageUrl ? (
                          <button
                            className="capture-button-in-frame"
                            onClick={capturePhoto}
                            disabled={isGenerating || isSubmitting}
                            aria-label="撮影"
                          >
                            <span className="capture-icon">
                              <span className="capture-icon-inner" />
                            </span>
                          </button>
                        ) : null}

                        {frameOption === "nihonkai" ? (
                          <div className="frame-overlay" aria-hidden="true">
                            {frameFishBadgeLabel ? <div className="frame-fish-badge">{frameFishBadgeLabel}</div> : null}
                            <div className="frame-mini-overlay">
                              {previewPolyline ? (
                                <svg viewBox="0 0 240 100" preserveAspectRatio="none">
                                  <polyline points={previewPolyline} />
                                </svg>
                              ) : null}
                              <span className="frame-mini-label">トレンド</span>
                              <span className="frame-mini-brand">Nihonkai-tsu 2026</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="composer-step-footer composer-step-footer-split">
                      <div className="step-secondary-actions">
                        <button
                          type="button"
                          className="step-secondary-button"
                          onClick={startCamera}
                          disabled={isGenerating || isSubmitting}
                        >
                          カメラを開く
                        </button>
                        <button
                          type="button"
                          className="step-secondary-button"
                          onClick={handlePickImageClick}
                          disabled={isGenerating || isSubmitting}
                        >
                          画像を選ぶ
                        </button>
                      </div>
                      <div className="step-primary-actions step-primary-actions-step1">
                        <button
                          type="button"
                          className="step-primary-button"
                          onClick={goToStep2}
                          disabled={!step1Complete || isGenerating || isSubmitting}
                        >
                          この写真で次へ
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
            ) : null}

            {currentStep === 2 ? (
            <section className="frame-area composer-step-stage" aria-label="step 2 fish confirmation">
              <h4>Step 2: 魚を選ぶ</h4>
              <p className="step2-intro">写真をもとに、候補をいくつか出しました。</p>
              <p className="step2-intro step2-intro-sub">一番近いものを選ぶか、なければ「それ以外」を選んでください。</p>
              <fieldset disabled={!step1Complete || isGenerating || isSubmitting}>
                {isEstimatingFish ? <p className="frame-note">写真を見ながら候補を準備しています...</p> : null}
                {!isEstimatingFish ? (
                  <div className="fish-candidate-grid" role="radiogroup" aria-label="fish candidates">
                    {fishCandidates.map((name) => (
                      <label key={name} className="fish-candidate-card">
                        <input
                          className="fish-candidate-radio"
                          type="radio"
                          name="fish-candidate"
                          value={name}
                          checked={pendingFishType === name}
                          onChange={(event) => setPendingFishType(event.target.value)}
                        />
                        <span className="fish-candidate-label">{name === "other" ? "それ以外" : name}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <p className="step2-support-copy">魚種が分からなくても投稿できます。候補にない場合も、そのまま進めます。</p>
                {needsOtherFishSelection ? (
                  <>
                    <p className="frame-note">候補にない場合は、近い名前を選べばそのまま投稿文づくりに進めます。</p>
                    <label className="generated-text-label">
                      魚を検索
                      <input
                        type="search"
                        value={otherFishQuery}
                        onChange={(event) => setOtherFishQuery(event.target.value)}
                        placeholder="魚名で検索"
                      />
                    </label>
                    <div className="frame-options-card-grid" role="radiogroup" aria-label="all fish options">
                      {filteredOtherFishOptions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={
                            selectedOtherFish === name
                              ? "frame-select-card frame-select-card-active"
                              : "frame-select-card"
                          }
                          onClick={() => setSelectedOtherFish(name)}
                          aria-pressed={selectedOtherFish === name}
                        >
                          <div className="frame-select-copy">
                            <strong>{name}</strong>
                          </div>
                        </button>
                      ))}
                    </div>
                    {!filteredOtherFishOptions.length ? <p className="frame-note">一致する魚が見つかりません。</p> : null}
                  </>
                ) : null}
                <div className="composer-step-footer">
                  <button
                    type="button"
                    className="step-primary-button"
                    onClick={handleConfirmFishType}
                    disabled={isEstimatingFish || !canConfirmFishType}
                  >
                    この魚で投稿文を作る
                  </button>
                </div>
              </fieldset>
              {!step1Complete ? <p className="frame-note">先に Step 1 を完了してください。</p> : null}
              {fishEstimateError ? <p className="frame-note">{fishEstimateError}</p> : null}
              {step2Complete ? <p className="frame-note">確定した魚: {confirmedFishType}</p> : null}
            </section>
            ) : null}

            {currentStep === 3 ? (
            <section className="ai-generate-area composer-step-stage" aria-label="step 3 post">
              <h4>Step 3: 投稿文を作って投稿</h4>
              {!step2Complete ? <p className="frame-note">先に Step 2 を完了してください。</p> : null}

              {generatedOptions.length ? (
                <div className="generated-text-panel">
                  <p className="generated-text-label">生成された投稿文（3案）</p>
                  <div className="frame-options-card-grid" role="radiogroup" aria-label="post text options">
                    {generatedOptions.map((option) => (
                      <button
                        key={option.type}
                        type="button"
                        className={
                          selectedOptionType === option.type
                            ? "post-option-card post-option-card-active"
                            : "post-option-card"
                        }
                        onClick={() => {
                          setSelectedOptionType(option.type);
                          setEditablePostText(option.text);
                        }}
                        aria-pressed={selectedOptionType === option.type}
                        >
                          <div className="frame-select-copy">
                            <strong>{postOptionLabel(option.type)}</strong>
                            <span className="post-option-hint">{postOptionHint(option.type)}</span>
                            <p>{option.text}</p>
                          </div>
                        </button>
                    ))}
                  </div>
                  <p className="ai-safety-note">AI生成文は参考です。内容は編集できます。</p>
                  <label className="generated-text-label">
                    選択した投稿文を編集
                    <textarea
                      className={selectedOption ? "generated-text-editor generated-text-editor-active" : "generated-text-editor"}
                      value={editablePostText}
                      onChange={(event) => setEditablePostText(event.target.value)}
                      rows={6}
                    />
                  </label>
                  {selectedOption ? <p className="frame-note">選択中: {postOptionLabel(selectedOption.type)}</p> : null}
                  {generationNote ? <p className="generated-note">{generationNote}</p> : null}
                  <p className="post-experience-note">※ コピーするだけでも投稿体験としてカウントされます</p>
                </div>
              ) : null}
              <div className="composer-step-footer">
                {generatedOptions.length ? (
                  <div className="step-primary-actions">
                    <button
                      className="step-primary-button step-secondary-button"
                      onClick={handleSaveImage}
                      disabled={isGenerating || isSubmitting || !selectedImageFile}
                    >
                      {imageSaved ? "保存済み" : "画像を保存する"}
                    </button>
                    <button
                      className={copied ? "step-primary-button step-secondary-button" : "step-primary-button step-secondary-button"}
                      onClick={handleコピーText}
                      disabled={isGenerating || isSubmitting || !editablePostText.trim()}
                    >
                      {copied ? "コピー済み" : "コピーする"}
                    </button>
                    <button
                      className="step-primary-button"
                      onClick={handleOpenXPost}
                      disabled={isGenerating || isSubmitting || !editablePostText.trim()}
                    >
                      {isSubmitting ? "投稿中..." : "Xに投稿する"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="step-primary-button"
                    onClick={handleGeneratePostText}
                    disabled={isGenerating || isSubmitting || !step2Complete}
                  >
                    {isGenerating ? "生成中..." : "投稿文を作る"}
                  </button>
                )}
              </div>
              {postMetricsSummary ? (
                <div className="post-experience-feedback" aria-live="polite">
                  <p className="post-experience-feedback-title">投稿体験を記録しました</p>
                  <p>あなたは今日{postMetricsSummary.currentOrder}件目の投稿体験です</p>
                  <p>今日の投稿体験数: {postMetricsSummary.totalToday}件</p>
                  {postMetricsSummary.topFishThisWeek ? (
                    <p>
                      今週人気: {postMetricsSummary.topFishThisWeek.fishLabel}
                      （{postMetricsSummary.topFishThisWeek.count}件）
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
            ) : null}

              <canvas ref={canvasRef} className="hidden-canvas" />
            </div>
          </div>
        </div>
      , document.body) : null}
    </section>
  );
}


