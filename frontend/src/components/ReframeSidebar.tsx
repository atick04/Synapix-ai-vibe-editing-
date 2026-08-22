import React from "react";

interface ReframeSidebarProps {
  activeEdits: any[];
  onEditsChange: (edits: any[]) => void;
  onClose: () => void;
  sourceIsLandscape: boolean;
}

function upsertFormat(edits: any[], patch: Record<string, any>) {
  const current = edits.find((e) => e.action === "change_format") || {
    action: "change_format",
    format: "9:16",
    fit: "cover",
    scale: 1,
    focus_x: 0.5,
    focus_y: 0.5,
  };
  const next = { ...current, format: "9:16", ...patch };
  return [next, ...edits.filter((e) => e.action !== "change_format")];
}

export default function ReframeSidebar({
  activeEdits,
  onEditsChange,
  onClose,
  sourceIsLandscape,
}: ReframeSidebarProps) {
  const fmt = activeEdits.find((e) => e.action === "change_format") || {
    action: "change_format",
    format: "9:16",
    fit: "cover",
    scale: 1,
    focus_x: 0.5,
    focus_y: 0.5,
  };
  const rawFit = String(fmt.fit || fmt.mode || "cover").toLowerCase();
  const fit = rawFit === "contain" || rawFit === "letterbox" || rawFit === "horizontal" ? "contain" : "cover";
  const scale = Number(fmt.scale ?? 1);
  const focusX = Number(fmt.focus_x ?? 0.5);
  const focusY = Number(fmt.focus_y ?? (fit === "contain" ? 0.5 : 0.45));
  const scalePct = fit === "contain" ? Math.round(scale * 100) : Math.round(scale * 100);

  const setFit = (next: "cover" | "contain") => {
    onEditsChange(
      upsertFormat(activeEdits, {
        fit: next,
        scale: next === "contain" ? 1 : 1,
        focus_x: 0.5,
        focus_y: next === "contain" ? 0.5 : 0.45,
      }),
    );
  };

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <p className="text-[13px] font-semibold text-white">Кадр</p>
        <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white text-lg leading-none px-2">
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <p className="text-[12px] text-neutral-500 leading-relaxed">
          {sourceIsLandscape
            ? "Исходник 16:9. Выбери, как он стоит в Reel 9:16 — на весь кадр или горизонтальной полосой."
            : "Исходник уже вертикальный. Масштаб всё равно можно подкрутить."}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFit("cover")}
            className={`rounded-2xl border p-3 text-left transition-colors ${
              fit === "cover"
                ? "border-sky-400/50 bg-sky-400/10"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            <div className="mx-auto mb-2 h-[72px] w-[40px] rounded-[6px] bg-black overflow-hidden relative border border-white/10">
              <div className="absolute inset-0 bg-neutral-400/40" />
            </div>
            <span className="block text-[12px] font-semibold text-white">На весь кадр</span>
            <span className="block text-[11px] text-neutral-500 mt-0.5 leading-snug">Обрезать бока, заполнить 9:16</span>
          </button>
          <button
            type="button"
            onClick={() => setFit("contain")}
            className={`rounded-2xl border p-3 text-left transition-colors ${
              fit === "contain"
                ? "border-sky-400/50 bg-sky-400/10"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            <div className="mx-auto mb-2 h-[72px] w-[40px] rounded-[6px] bg-black overflow-hidden relative border border-white/10">
              <div className="absolute left-0 right-0 h-[28%] top-1/2 -translate-y-1/2 bg-neutral-400/50" />
            </div>
            <span className="block text-[12px] font-semibold text-white">Горизонталь</span>
            <span className="block text-[11px] text-neutral-500 mt-0.5 leading-snug">16:9 по центру, поля сверху и снизу</span>
          </button>
        </div>

        <div>
          <div className="flex justify-between text-[11px] text-neutral-400 mb-2">
            <span>Масштаб</span>
            <span className="font-mono text-neutral-300">{scalePct}%</span>
          </div>
          {fit === "contain" ? (
            <input
              type="range"
              min={50}
              max={100}
              value={Math.round(scale * 100)}
              onChange={(e) => onEditsChange(upsertFormat(activeEdits, { fit, scale: Number(e.target.value) / 100 }))}
              className="w-full accent-sky-400"
            />
          ) : (
            <input
              type="range"
              min={100}
              max={180}
              value={Math.round(scale * 100)}
              onChange={(e) => onEditsChange(upsertFormat(activeEdits, { fit, scale: Number(e.target.value) / 100 }))}
              className="w-full accent-sky-400"
            />
          )}
          <p className="text-[11px] text-neutral-600 mt-1.5">
            {fit === "contain" ? "Уменьшает полоску 16:9 внутри кадра." : "Сильнее приближает спикера внутри 9:16."}
          </p>
        </div>

        <div>
          <div className="flex justify-between text-[11px] text-neutral-400 mb-2">
            <span>{fit === "contain" ? "Полоска влево / вправо" : "Кроп влево / вправо"}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(focusX * 100)}
            onChange={(e) => onEditsChange(upsertFormat(activeEdits, { fit, focus_x: Number(e.target.value) / 100 }))}
            className="w-full accent-sky-400"
          />
        </div>

        <div>
          <div className="flex justify-between text-[11px] text-neutral-400 mb-2">
            <span>{fit === "contain" ? "Полоска вверх / вниз" : "Кроп вверх / вниз"}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(focusY * 100)}
            onChange={(e) => onEditsChange(upsertFormat(activeEdits, { fit, focus_y: Number(e.target.value) / 100 }))}
            className="w-full accent-sky-400"
          />
        </div>
      </div>
    </div>
  );
}
