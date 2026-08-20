"use client";

import React, { useEffect } from "react";
import { RESOLVE_SUBTITLE_PACK, resolvePresetToEditFields } from "@/utils/resolveSubtitlePack";
import { SubtitleStylePreview } from "@/components/SubtitleStylePreview";

interface TextSidebarProps {
  fontStyle: string;
  setFontStyle: (v: string) => void;
  fontSize: number;
  setFontSize: (v: number) => void;
  fontColor: string;
  setFontColor: (v: string) => void;
  useOutline: boolean;
  setUseOutline: (v: boolean) => void;
  onClose: () => void;
  activePreset?: string;
  onApplyPreset?: (fields: Record<string, unknown>) => void;
  onStyleFieldChange?: (field: string, value: unknown) => void;
}

const FONTS = ["Arial", "BebasNeue-Regular", "Montserrat-ExtraBold", "Rubik-Bold", "Impact", "Lobster"];
const COLORS = [
  { id: "White", label: "Белый", hex: "#ffffff" },
  { id: "Yellow", label: "Желтый", hex: "#FFE14A" },
  { id: "Cyan", label: "Голубой", hex: "#00ffff" },
  { id: "Green", label: "Зеленый", hex: "#55ff55" },
  { id: "Red", label: "Красный", hex: "#ff5555" },
];

export default function TextSidebar({
  fontStyle,
  setFontStyle,
  fontSize,
  setFontSize,
  fontColor,
  setFontColor,
  useOutline,
  setUseOutline,
  onClose,
  activePreset,
  onApplyPreset,
  onStyleFieldChange,
}: TextSidebarProps) {
  useEffect(() => {
    if (document.getElementById("resolve-sub-fonts")) return;
    const link = document.createElement("link");
    link.id = "resolve-sub-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Lobster&family=Marck+Script&family=Manrope:wght@700&family=Montserrat:wght@800;900&display=swap";
    document.head.appendChild(link);
  }, []);

  const applyPreset = (id: string) => {
    const preset = RESOLVE_SUBTITLE_PACK.find((p) => p.id === id) || RESOLVE_SUBTITLE_PACK[0];
    const fields = resolvePresetToEditFields(preset);
    onApplyPreset?.(fields);
    setFontStyle(String(fields.font || fontStyle));
    setFontSize(Number(fields.font_size || fontSize));
    setFontColor(String(fields.font_color || fontColor));
    setUseOutline(Boolean(fields.use_outline));
  };

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white">Стили субтитров</h3>
        <button onClick={onClose} className="min-h-9 px-2 text-neutral-400 hover:text-white transition-colors text-xs cursor-pointer">
          Закрыть
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">
            Шаблоны
          </label>
          <div className="grid grid-cols-1 gap-2">
            {RESOLVE_SUBTITLE_PACK.map((preset) => {
              const isAct = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`group w-full text-left rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                    isAct
                      ? "border-orange-500/70 ring-1 ring-orange-500/30"
                      : "border-white/8 hover:border-orange-500/35"
                  }`}
                >
                  <SubtitleStylePreview look={preset.look} active={isAct} />
                  <div className="px-3 py-2 bg-[#1a1816]/80 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">{preset.label}</span>
                    {isAct && <span className="text-[9px] font-bold uppercase tracking-wider text-orange-400">выбран</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Шрифт</label>
          <div className="grid grid-cols-1 gap-2">
            {FONTS.map((font) => (
              <button
                key={font}
                onClick={() => {
                  setFontStyle(font);
                  onStyleFieldChange?.("font", font);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  fontStyle === font
                    ? "bg-orange-500/10 border-orange-500/30 text-white font-bold"
                    : "bg-[#2C2C2E]/20 border-white/5 text-neutral-300 hover:bg-[#2C2C2E]/40"
                }`}
                style={{ fontFamily: font.replace(/-.*$/, "") }}
              >
                {font}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Размер шрифта</label>
            <span className="text-xs text-orange-500 font-semibold">{fontSize}px</span>
          </div>
          <input
            type="range"
            min="40"
            max="150"
            value={fontSize}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setFontSize(val);
              onStyleFieldChange?.("font_size", val);
            }}
            className="w-full accent-orange-500 cursor-pointer h-1 rounded-lg bg-neutral-700"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Цвет текста</label>
          <div className="grid grid-cols-5 gap-2">
            {COLORS.map((color) => (
              <button
                key={color.id}
                title={color.label}
                onClick={() => {
                  setFontColor(color.id);
                  onStyleFieldChange?.("font_color", color.hex);
                }}
                className={`h-9 rounded-lg border transition-all cursor-pointer ${
                  fontColor === color.id || fontColor === color.hex
                    ? "border-orange-500 scale-105"
                    : "border-white/10 hover:border-white/30"
                }`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-[#2C2C2E]/30 rounded-xl border border-white/5">
          <div>
            <div className="text-xs font-semibold text-white">Обводка текста</div>
            <div className="text-[9px] text-neutral-400 mt-0.5">Черный контур для читаемости</div>
          </div>
          <button
            onClick={() => {
              const next = !useOutline;
              setUseOutline(next);
              onStyleFieldChange?.("use_outline", next);
            }}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors relative cursor-pointer ${useOutline ? "bg-orange-500" : "bg-neutral-700"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${useOutline ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
