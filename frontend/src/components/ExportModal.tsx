"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/utils/api";

interface ExportModalProps {
  id: string;
  API_URL: string;
  activeEdits: any[];
  multiTrackEdl: any;
  fontStyle: string;
  fontSize: number;
  fontColor: string;
  useOutline: boolean;
  selectedTemplate: string | null;
  onClose: () => void;
  onPaywall?: () => void;
  onStatusChange: (isRendering: boolean) => void;
  brandId?: string;
}

type Quality = "high" | "medium" | "fast";
type Resolution = "1080p" | "720p";

const QUALITY_OPTIONS: { value: Quality; label: string; hint: string }[] = [
  { value: "fast", label: "Быстрое", hint: "~1 мин · без ротоскопа" },
  { value: "medium", label: "Обычное", hint: "Баланс скорость / качество" },
  { value: "high", label: "Высокое", hint: "Дольше · маска если уже есть" },
];

const RESOLUTION_OPTIONS: { value: Resolution; label: string; hint: string }[] = [
  { value: "1080p", label: "1080 × 1920", hint: "Рекомендуется для Reels" },
  { value: "720p", label: "720 × 1280", hint: "Быстрее и легче файл" },
];

export default function ExportModal({
  id,
  API_URL,
  activeEdits,
  multiTrackEdl,
  fontStyle,
  fontSize,
  fontColor,
  useOutline,
  selectedTemplate,
  onClose,
  onPaywall,
  onStatusChange,
  brandId,
}: ExportModalProps) {
  const [mounted, setMounted] = useState(false);
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [quality, setQuality] = useState<Quality>("fast");
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("Готов к экспорту");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const downloadUrl = `${API_URL}/uploads/${id}_rendered.mp4`;
  const resLabel = resolution === "1080p" ? "1080×1920" : "720×1280";
  const qualityLabel = QUALITY_OPTIONS.find((q) => q.value === quality)?.label || quality;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportDone(false);
      setError(null);
      setStatusLine("Запускаем рендер…");
      onStatusChange(true);

      // Match preview: prefer subtitle edit fonts over page Arial default
      const subEdit = activeEdits.find((e: any) => e.action === "add_subtitles");
      const exportFont = subEdit?.font || fontStyle || "Montserrat-ExtraBold";
      const exportFontSize = Number(subEdit?.font_size || fontSize || 84);
      const exportFontColor = subEdit?.font_color || fontColor || "White";
      const exportOutline =
        subEdit?.use_outline !== undefined ? !!subEdit.use_outline : useOutline;

      const exportEdits = activeEdits.map((e: any) => {
        if (e.action !== "add_subtitles") return e;
        const behind =
          !!e.behind_speaker ||
          e.position === "behind_speaker" ||
          e.position === "behind";
        return behind
          ? { ...e, behind_speaker: true, position: e.position || "behind_speaker" }
          : e;
      });

      const res = await apiFetch("/api/video/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: id,
          resolution,
          quality,
          fps: 30,
          format: "mp4_h264",
          audio_bitrate: "192k",
          edits: exportEdits.length > 0 ? exportEdits : null,
          edl: multiTrackEdl,
          font: exportFont,
          font_size: exportFontSize,
          font_color: exportFontColor,
          use_outline: exportOutline,
          template_id: selectedTemplate || "instagram_reels",
          brand_id: brandId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 402 || data.detail === "free_reel_used") {
          onPaywall?.();
          return;
        }
        throw new Error(data.detail || `Ошибка ${res.status}`);
      }

      setStatusLine("Рендерим Instagram Reel…");

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const st = await apiFetch(`/api/video/${id}/status`).then((r) => r.json());
          if (Array.isArray(st.logs) && st.logs.length) {
            const last = String(st.logs[st.logs.length - 1] || "");
            if (last) {
              setStatusLine(
                last.replace(/^[^\wа-яА-Я🚀⚙️✅❌]+/u, "").slice(0, 90) || last.slice(0, 90)
              );
            }
          }
          if (st.status === "ready") {
            if (pollRef.current) clearInterval(pollRef.current);
            setIsExporting(false);
            onStatusChange(false);
            setExportDone(true);
            setStatusLine("Готово");
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Не удалось запустить экспорт");
      setIsExporting(false);
      onStatusChange(false);
      setStatusLine("Ошибка");
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-6"
      style={{
        zIndex: 100000,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) onClose();
      }}
    >
      <div
        className="relative w-full max-w-[420px] rounded-2xl overflow-hidden border border-white/10 bg-[#121214] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        style={{ zIndex: 100001 }}
      >
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-400/90 mb-1">
              Instagram Reels
            </p>
            <h2 className="text-[18px] font-semibold tracking-tight text-white">Экспорт</h2>
            <p className="text-[13px] text-neutral-500 mt-1">9:16 · MP4 · H.264</p>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
            aria-label="Закрыть"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div>
            <label className="block text-[12px] font-medium text-neutral-400 mb-2">Разрешение</label>
            <div className="grid grid-cols-2 gap-2">
              {RESOLUTION_OPTIONS.map((opt) => {
                const active = resolution === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isExporting}
                    onClick={() => setResolution(opt.value)}
                    className={`text-left rounded-xl px-3.5 py-3 border transition-all ${
                      active
                        ? "border-sky-400/50 bg-sky-500/10"
                        : "border-white/8 bg-white/[0.03] hover:border-white/15"
                    } disabled:opacity-50`}
                  >
                    <div className={`text-[13px] font-semibold ${active ? "text-sky-400" : "text-neutral-200"}`}>
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-neutral-400 mb-2">Качество</label>
            <div className="grid grid-cols-3 gap-2">
              {QUALITY_OPTIONS.map((opt) => {
                const active = quality === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isExporting}
                    onClick={() => setQuality(opt.value)}
                    className={`text-left rounded-xl px-3 py-3 border transition-all ${
                      active
                        ? "border-sky-400/50 bg-sky-500/10"
                        : "border-white/8 bg-white/[0.03] hover:border-white/15"
                    } disabled:opacity-50`}
                  >
                    <div className={`text-[13px] font-semibold ${active ? "text-sky-400" : "text-neutral-200"}`}>
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5 leading-snug">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3 flex items-start gap-2.5">
            <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
            <p className="text-[12px] text-neutral-400 leading-relaxed">
              Итог: <span className="text-neutral-200">{resLabel}</span>
              {" · "}
              <span className="text-neutral-200">{qualityLabel}</span>
              {" · "}
              <span className="text-neutral-200">MP4</span>
            </p>
          </div>

          {(isExporting || statusLine !== "Готов к экспорту") && !exportDone && (
            <div className="rounded-xl border border-white/8 bg-black/30 px-3.5 py-3">
              <div className="flex items-center gap-2 text-[12px] text-neutral-300">
                {isExporting && (
                  <svg className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                <span className="truncate">{statusLine}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-[12px] text-red-300">
              {error}
            </div>
          )}

          {exportDone && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-emerald-300">Reel готов</p>
                <p className="text-[11px] text-emerald-400/70 truncate">Можно скачать и выложить в Instagram</p>
              </div>
              <a
                href={downloadUrl}
                download={`synapix-reel-${id.slice(0, 8)}.mp4`}
                className="shrink-0 px-3.5 py-2 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-black text-[12px] font-semibold transition-colors"
              >
                Скачать
              </a>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/5 flex items-center justify-between gap-3 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2.5 text-[13px] text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
          >
            {exportDone ? "Закрыть" : "Отмена"}
          </button>
          {!exportDone && (
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExport}
              className="flex items-center justify-center gap-2 min-w-[160px] px-5 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-black text-[13px] font-semibold transition-colors shadow-[0_0_24px_rgba(56,189,248,0.25)]"
            >
              {isExporting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Рендер…
                </>
              ) : (
                "Экспортировать Reel"
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
