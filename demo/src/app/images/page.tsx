"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";

interface GenerationAsset {
  relativePath: string;
  filePath: string;
  exists: boolean;
  size: number | null;
  mimeType: string | null;
}

interface ImageRecord {
  id: string;
  kind: string;
  status: "succeeded" | "failed";
  prompt: string;
  title: string;
  backendId: string;
  backendLabel: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  output: GenerationAsset | null;
  error?: string;
}

interface BackendDescriptor {
  id: string;
  label: string;
  supportedKinds: string[];
  available: boolean;
  reason?: string;
}

export default function ImagesPage() {
  const { messages } = useLocale();
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [backends, setBackends] = useState<BackendDescriptor[]>([]);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [selectedBackend, setSelectedBackend] = useState<string>("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<ImageRecord | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const availableBackends = backends.filter(
    (b) => b.id !== "command" && b.available && b.supportedKinds.includes("image"),
  );

  const loadImages = useCallback(async () => {
    try {
      const res = await fetch("/api/images");
      const data = await res.json();
      if (Array.isArray(data.images)) {
        setImages(data.images);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadBackends = useCallback(async () => {
    try {
      const res = await fetch("/api/images/backends");
      const data = await res.json();
      if (Array.isArray(data.backends)) {
        setBackends(data.backends);
        // Auto-select first available backend
        const available = (data.backends as BackendDescriptor[]).filter(
          (b) => b.id !== "command" && b.available && b.supportedKinds.includes("image"),
        );
        if (available.length > 0 && !selectedBackend) {
          setSelectedBackend(available[0].id);
        }
      }
    } catch {
      /* ignore */
    }
  }, [selectedBackend]);

  useEffect(() => {
    loadImages();
    loadBackends();
  }, [loadImages, loadBackends]);

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    const currentPrompt = prompt.trim();
    setGenerating(true);
    setGeneratingPrompt(currentPrompt);
    setGenerateError(null);
    setPrompt("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    // Scroll gallery to top
    if (galleryRef.current) galleryRef.current.scrollTop = 0;
    try {
      const body: Record<string, unknown> = { prompt: currentPrompt };
      if (selectedBackend) body.backendId = selectedBackend;

      // Start the API call and a minimum delay in parallel
      const [res] = await Promise.all([
        fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        new Promise((r) => setTimeout(r, 2000 + Math.random() * 1500)), // 2-3.5s simulated generation
      ]);
      const data = await res.json();
      if (data.error) {
        setGenerateError(data.error);
        setGeneratingPrompt(null);
      } else if (data.image) {
        // Reveal animation: add the image but mark it as revealing
        setRevealingId(data.image.id);
        setImages((prev) => [data.image, ...prev]);
        setGeneratingPrompt(null);
        // Clear reveal state after animation completes
        setTimeout(() => setRevealingId(null), 700);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Unknown error");
      setGeneratingPrompt(null);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/images/${id}`, { method: "DELETE" });
      setImages((prev) => prev.filter((img) => img.id !== id));
      setDeleteTarget(null);
      if (lightboxImage?.id === id) setLightboxImage(null);
    } catch {
      /* ignore */
    }
  };

  const handleDownload = async (image: ImageRecord) => {
    if (!image.output?.exists) return;
    const res = await fetch(`/api/images/${image.id}/file`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = image.output.mimeType?.split("/")[1] || "png";
    a.download = `${image.title || image.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = "0";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const hasBackends = availableBackends.length > 0;

  return (
    <div className="h-full flex flex-col" data-testid="images-page">
      {/* Header + Input */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        {!hasBackends ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              {messages.images.noBackend}
            </p>
            <Link
              href="/settings"
              className="text-sm text-foreground underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {messages.images.goToSettings}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Backend selector (only if multiple) */}
            {availableBackends.length > 1 && (
              <select
                value={selectedBackend}
                onChange={(e) => setSelectedBackend(e.target.value)}
                className="text-[13px] bg-muted border border-border rounded-md px-2 py-1.5 text-foreground w-fit"
              >
                {availableBackends.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            )}

            {/* Prompt input – chat-style pill */}
            <div className={`bg-card border border-border rounded-full flex items-center gap-1.5 px-4 py-2 transition-all focus-within:border-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}>
              {/* Image icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="shrink-0 text-muted-foreground">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <textarea
                data-testid="images-prompt"
                ref={inputRef}
                value={prompt}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder={messages.images.inputPlaceholder}
                rows={1}
                disabled={generating}
                className="flex-1 min-h-[20px] max-h-[120px] resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-[20px] self-center disabled:opacity-50"
                style={{ overflow: "hidden" }}
              />
              <button
                data-testid="images-generate-button"
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                className="shrink-0 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <svg
                    className="animate-spin h-[18px] w-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.51 4.23L18.07 8.51C21.91 10.43 21.91 13.57 18.07 15.49L9.51 19.77C3.89 22.58 1.42 20.11 4.23 14.49L5.12 12.68C5.32 12.28 5.32 11.72 5.12 11.32L4.23 9.51C1.42 3.89 3.89 1.42 9.51 4.23Z" />
                    <path d="M5.44 12H10.84" />
                  </svg>
                )}
              </button>
            </div>
            {generateError && (
              <p className="text-xs text-destructive mt-1">
                {messages.images.errorDetail(generateError)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Gallery */}
      <div ref={galleryRef} className="flex-1 overflow-y-auto px-6 py-4">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-border-hover"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="text-sm text-muted-foreground">
              {messages.images.empty}
            </p>
            <p className="text-xs text-muted-foreground">
              {messages.images.emptyHint}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {/* Generating placeholder — shimmer sweep */}
            {generatingPrompt && (
              <div className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border">
                <div className="gen-shimmer absolute inset-0" />
                <style>{`
                  .gen-shimmer {
                    background: linear-gradient(
                      105deg,
                      transparent 30%,
                      rgba(147,112,219,0.12) 45%,
                      rgba(147,112,219,0.25) 50%,
                      rgba(147,112,219,0.12) 55%,
                      transparent 70%
                    );
                    background-size: 250% 100%;
                    animation: gen-sweep 1.8s ease-in-out infinite;
                  }
                  @keyframes gen-sweep {
                    0%   { background-position: 200% 0; }
                    100% { background-position: -50% 0; }
                  }
                  @keyframes reveal-image {
                    0%   { opacity: 0; transform: scale(0.92); filter: blur(6px); }
                    100% { opacity: 1; transform: scale(1);    filter: blur(0); }
                  }
                `}</style>
              </div>
            )}
            {images.map((image) => (
              <div
                key={image.id}
                data-testid="image-card"
                data-image-id={image.id}
                className="group relative aspect-square rounded-lg overflow-hidden bg-muted border border-border hover:border-border-hover transition-colors cursor-pointer"
                style={revealingId === image.id ? { animation: "reveal-image 0.7s cubic-bezier(0.16,1,0.3,1) forwards" } : undefined}
                onClick={() =>
                  image.status === "succeeded" && image.output?.exists
                    ? setLightboxImage(image)
                    : undefined
                }
              >
                {image.status === "succeeded" && image.output?.exists ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/images/${image.id}/file`}
                    alt={image.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-destructive"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span className="text-[11px] text-destructive text-center">
                      {messages.images.failed}
                    </span>
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2">
                  <p className="text-[11px] text-white/90 line-clamp-3 leading-tight">
                    {image.title}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/60">
                      {formatDate(image.createdAt)}
                    </span>
                    <div className="flex gap-1">
                      {image.status === "succeeded" && image.output?.exists && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(image);
                          }}
                          className="p-1 rounded hover:bg-white/20 transition-colors"
                          title={messages.images.download}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="image-delete-trigger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(image.id);
                        }}
                        className="p-1 rounded hover:bg-white/20 transition-colors"
                        title={messages.images.deleteAction}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-card border border-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-foreground mb-1">
              {messages.images.deleteTitle}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {messages.images.deleteConfirm}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                data-testid="images-delete-cancel"
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-muted transition-colors"
              >
                {messages.images.cancelAction}
              </button>
              <button
                data-testid="images-delete-confirm"
                type="button"
                onClick={() => handleDelete(deleteTarget)}
                className="px-3 py-1.5 text-sm rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
              >
                {messages.images.deleteAction}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && lightboxImage.output?.exists && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/images/${lightboxImage.id}/file`}
              alt={lightboxImage.title}
              className="max-w-full max-h-[80vh] rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center gap-3">
              <p className="text-sm text-white/80 max-w-md truncate">
                {lightboxImage.title}
              </p>
              <button
                type="button"
                onClick={() => handleDownload(lightboxImage)}
                className="shrink-0 px-3 py-1 rounded-md text-xs font-medium bg-white/20 text-white hover:bg-white/30 transition-colors"
              >
                {messages.images.download}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
