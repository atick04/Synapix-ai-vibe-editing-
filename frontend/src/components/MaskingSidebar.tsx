import React from "react";

interface MaskingSidebarProps {
  activeEdits: any[];
  onEditsChange: (edits: any[]) => void;
  onClose: () => void;
}

export default function MaskingSidebar({ activeEdits, onEditsChange, onClose }: MaskingSidebarProps) {
  // Find current masking edit
  const maskEdit = activeEdits.find(e => e.action === "speaker_masking") || {
    action: "speaker_masking",
    enabled: false,
    effect_type: "behind_text",
    blur_strength: 10
  };

  const handleToggle = (enabled: boolean) => {
    const cleanEdits = activeEdits.filter(e => e.action !== "speaker_masking");
    if (enabled) {
      onEditsChange([...cleanEdits, { ...maskEdit, enabled: true }]);
    } else {
      onEditsChange([...cleanEdits, { ...maskEdit, enabled: false }]);
    }
  };

  const handleEffectChange = (type: string) => {
    const cleanEdits = activeEdits.filter(e => e.action !== "speaker_masking");
    onEditsChange([...cleanEdits, { ...maskEdit, effect_type: type }]);
  };

  const handleBlurChange = (val: number) => {
    const cleanEdits = activeEdits.filter(e => e.action !== "speaker_masking");
    onEditsChange([...cleanEdits, { ...maskEdit, blur_strength: val }]);
  };

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white">ИИ-Маскирование</h3>
        <button onClick={onClose} className="min-h-9 px-2 text-neutral-400 hover:text-white transition-colors text-xs cursor-pointer">
          Закрыть
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Toggle */}
        <div className="flex items-center justify-between p-3.5 bg-[#2C2C2E]/30 rounded-xl border border-white/5">
          <div>
            <div className="text-xs font-semibold text-white mb-0.5">Включить маску</div>
            <div className="text-[10px] text-neutral-400">Отделение спикера от фона</div>
          </div>
          <button
            onClick={() => handleToggle(!maskEdit.enabled)}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors relative cursor-pointer ${maskEdit.enabled ? 'bg-orange-500' : 'bg-neutral-700'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${maskEdit.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {maskEdit.enabled && (
          <>
            {/* Effect selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Эффект отделения</label>
              <div className="space-y-2">
                {[
                  { id: "behind_text", label: "Текст за спикером (3D)", desc: "Субтитры и графика отображаются позади спикера" },
                  { id: "blur_bg", label: "Размытие фона (Боке)", desc: "Размывает задний план, делая фокус на спикере" },
                  { id: "replace_bg", label: "Замена фона", desc: "Убирает фон и заменяет его на глубокий черный цвет" }
                ].map(eff => (
                  <button
                    key={eff.id}
                    onClick={() => handleEffectChange(eff.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      maskEdit.effect_type === eff.id 
                        ? 'bg-orange-500/10 border-orange-500/30 text-white' 
                        : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-300 hover:bg-[#2C2C2E]/40'
                    }`}
                  >
                    <div className="text-xs font-semibold">{eff.label}</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">{eff.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Blur slider */}
            {maskEdit.effect_type === "blur_bg" && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Сила размытия</label>
                  <span className="text-xs text-orange-500 font-semibold">{maskEdit.blur_strength || 10}px</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  value={maskEdit.blur_strength || 10}
                  onChange={(e) => handleBlurChange(parseInt(e.target.value))}
                  className="w-full accent-orange-500 cursor-pointer h-1 rounded-lg bg-neutral-700"
                />
              </div>
            )}
          </>
        )}

        {/* Informational card */}
        <div className="p-3.5 bg-neutral-900/60 rounded-xl border border-white/5 space-y-1.5">
          <div className="text-[10px] font-bold text-orange-500 uppercase tracking-wide">Как это работает?</div>
          <p className="text-[10px] text-neutral-400 leading-relaxed">
            Наш ИИ-сегментатор на базе нейросети автоматически распознает силуэт человека в кадре и строит точную альфа-маску. 
            При рендеринге текст, титры и графика накладываются позади спикера, создавая эффект профессионального кино-монтажа.
          </p>
        </div>
      </div>
    </div>
  );
}
