import React from "react";

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
}

export default function TextSidebar({
  fontStyle,
  setFontStyle,
  fontSize,
  setFontSize,
  fontColor,
  setFontColor,
  useOutline,
  setUseOutline,
  onClose
}: TextSidebarProps) {
  const fonts = ["Arial", "BebasNeue-Regular", "Montserrat-Bold", "Rubik-Bold", "Impact"];
  const colors = ["White", "Yellow", "Cyan", "Green", "Red"];

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white">Стили субтитров</h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors text-xs cursor-pointer">
          Закрыть
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Font Style */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Шрифт</label>
          <div className="grid grid-cols-1 gap-2">
            {fonts.map(font => (
              <button
                key={font}
                onClick={() => setFontStyle(font)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  fontStyle === font
                    ? 'bg-orange-500/10 border-orange-500/30 text-white font-bold'
                    : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-300 hover:bg-[#2C2C2E]/40'
                }`}
              >
                {font}
              </button>
            ))}
          </div>
        </div>

        {/* Font Size */}
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
            onChange={(e) => setFontSize(parseInt(e.target.value))}
            className="w-full accent-orange-500 cursor-pointer h-1 rounded-lg bg-neutral-700"
          />
        </div>

        {/* Font Color */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Цвет текста</label>
          <div className="grid grid-cols-3 gap-2">
            {colors.map(color => (
              <button
                key={color}
                onClick={() => setFontColor(color)}
                className={`px-2 py-2 rounded-lg border text-[10px] font-medium text-center transition-all cursor-pointer ${
                  fontColor === color
                    ? 'bg-orange-500/10 border-orange-500/30 text-white'
                    : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {color === "White" ? "Белый" :
                 color === "Yellow" ? "Желтый" :
                 color === "Cyan" ? "Голубой" :
                 color === "Green" ? "Зеленый" :
                 color === "Red" ? "Красный" : color}
              </button>
            ))}
          </div>
        </div>

        {/* Use Outline Toggle */}
        <div className="flex items-center justify-between p-3 bg-[#2C2C2E]/30 rounded-xl border border-white/5">
          <div>
            <div className="text-xs font-semibold text-white">Обводка текста</div>
            <div className="text-[9px] text-neutral-400 mt-0.5">Черный контур для читаемости</div>
          </div>
          <button
            onClick={() => setUseOutline(!useOutline)}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors relative cursor-pointer ${useOutline ? 'bg-orange-500' : 'bg-neutral-700'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${useOutline ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
