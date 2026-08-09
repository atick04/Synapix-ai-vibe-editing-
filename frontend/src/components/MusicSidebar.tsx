import React, { useState } from "react";

interface MusicSidebarProps {
  activeEdits: any[];
  onEditsChange: (edits: any[]) => void;
  onClose: () => void;
}

export default function MusicSidebar({ activeEdits, onEditsChange, onClose }: MusicSidebarProps) {
  const [bgmGenre, setBgmGenre] = useState("hiphop");
  const [bgmVolume, setBgmVolume] = useState(0.2);

  // AI Generator state
  const [prompt, setPrompt] = useState("");
  const [genType, setGenType] = useState("music");
  const [genDuration, setGenDuration] = useState(10);

  const handleApplyBgm = () => {
    const cleanEdits = activeEdits.filter(e => e.action !== "select_bgm");
    onEditsChange([...cleanEdits, {
      action: "select_bgm",
      asset_query: bgmGenre,
      volume: bgmVolume
    }]);
  };

  const handleGenerateAudio = () => {
    onEditsChange([...activeEdits, {
      action: "generate_audio",
      prompt: prompt,
      duration: genDuration,
      type: genType
    }]);
    setPrompt("");
  };

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white">Аудио и Музыка</h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors text-xs cursor-pointer">
          Закрыть
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Background Music Section */}
        <div className="space-y-4 pb-4 border-b border-white/5">
          <div className="text-[10px] font-bold text-orange-500 uppercase tracking-wide">Фоновая Музыка</div>
          
          <div className="space-y-2">
            <label className="text-[10px] text-neutral-400">Жанр музыки</label>
            <div className="grid grid-cols-2 gap-2">
              {["hiphop", "electronic", "rock", "ambient"].map(genre => (
                <button
                  key={genre}
                  onClick={() => setBgmGenre(genre)}
                  className={`px-3 py-2 rounded-lg border text-[10px] font-semibold capitalize transition-all cursor-pointer ${
                    bgmGenre === genre
                      ? 'bg-orange-500/10 border-orange-500/30 text-white'
                      : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {genre === "hiphop" ? "Хип-хоп" : genre === "electronic" ? "Электроника" : genre === "rock" ? "Рок" : "Эмбиент"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] text-neutral-400">Громкость</label>
              <span className="text-xs text-orange-500 font-semibold">{Math.round(bgmVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bgmVolume}
              onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
              className="w-full accent-orange-500 cursor-pointer h-1 rounded-lg bg-neutral-700"
            />
          </div>

          <button
            onClick={handleApplyBgm}
            className="w-full py-2.5 bg-[#2C2C2E]/50 border border-white/5 hover:bg-[#2C2C2E] transition-all text-xs font-semibold text-white rounded-xl cursor-pointer"
          >
            Применить фоновую музыку
          </button>
        </div>

        {/* Stable Audio Generator */}
        <div className="space-y-4">
          <div className="text-[10px] font-bold text-orange-500 uppercase tracking-wide">Генератор Stable Audio 2.5</div>
          
          <div className="space-y-2">
            <label className="text-[10px] text-neutral-400 font-semibold">Промпт для генерации</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Например: 80s retro lofi study beat, ambient..."
              className="w-full bg-neutral-900 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] text-neutral-400">Тип звука</label>
            <div className="grid grid-cols-2 gap-2">
              {["music", "sfx"].map(t => (
                <button
                  key={t}
                  onClick={() => setGenType(t)}
                  className={`px-3 py-2 rounded-lg border text-[10px] font-semibold transition-all cursor-pointer ${
                    genType === t
                      ? 'bg-orange-500/10 border-orange-500/30 text-white'
                      : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t === "music" ? "Музыка" : "Эффект (SFX)"}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerateAudio}
            disabled={!prompt}
            className={`w-full py-2.5 text-xs font-bold text-white rounded-xl transition-all cursor-pointer ${
              prompt
                ? 'bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/20'
                : 'bg-neutral-800 text-neutral-500 border border-white/5 cursor-not-allowed'
            }`}
          >
            Сгенерировать трек
          </button>
        </div>
      </div>
    </div>
  );
}
