import React, { useState } from "react";

interface GraphicsSidebarProps {
  activeEdits: any[];
  onEditsChange: (edits: any[]) => void;
  onClose: () => void;
  currentTime?: number;
}

export default function GraphicsSidebar({ activeEdits, onEditsChange, onClose, currentTime = 0 }: GraphicsSidebarProps) {
  // Tabs: 'scenes' or 'motion'
  const [activeTab, setActiveTab] = useState<"scenes" | "motion">("scenes");

  // Scenes state
  const [template, setTemplate] = useState("comparison");
  const [mood, setMood] = useState("analytical");
  const [concept, setConcept] = useState("");

  // 3D Motion graphics state
  const [mgStyle, setMgStyle] = useState("cinematic");
  const [mgText, setMgText] = useState("");
  const [mgSubtext, setMgSubtext] = useState("");
  const [accentColor, setAccentColor] = useState("#a78bfa"); // default violet

  const handleAddScene = () => {
    // Add create_scene edit to timeline
    const newEdit = {
      action: "create_scene",
      start_time: Math.round(currentTime * 10) / 10,
      duration: 5.0,
      scene_template: template,
      mood: mood,
      energy: 0.6,
      concept_prompt: concept || "Пояснение ключевой мысли спикера"
    };
    onEditsChange([...activeEdits, newEdit]);
  };

  const handleAddMotionGraphic = () => {
    // Add add_motion_graphic edit to timeline
    const newEdit = {
      action: "add_motion_graphic",
      start: Math.round(currentTime * 10) / 10,
      end: (Math.round(currentTime * 10) / 10) + 3.0, // 3s default duration
      text: mgText || "ЗАГОЛОВОК",
      subtext: mgSubtext || "",
      style: mgStyle,
      accent_color: accentColor,
      position: "center"
    };
    onEditsChange([...activeEdits, newEdit]);
  };

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white">Инфографика и 3D Графика</h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors text-xs cursor-pointer">
          Закрыть
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex px-4 pt-4 border-b border-white/[0.03]">
        <button
          onClick={() => setActiveTab("scenes")}
          className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "scenes"
              ? "border-orange-500 text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
          }`}
        >
          2D Инфографика
        </button>
        <button
          onClick={() => setActiveTab("motion")}
          className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "motion"
              ? "border-orange-500 text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
          }`}
        >
          3D Motion Graphics
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === "scenes" ? (
          <>
            {/* Templates */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Шаблон инфографики</label>
              <div className="space-y-2">
                {[
                  { id: "comparison", name: "Comparison (Сравнение)", desc: "Таблица со сравнением двух понятий" },
                  { id: "concept_explainer", name: "Concept Explainer (Описание концепта)", desc: "Визуальная карточка с иконкой и описанием" },
                  { id: "vertical_stack", name: "Vertical Stack (Вертикальный список)", desc: "Вертикальный стек шагов или тезисов" }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      template === t.id
                        ? 'bg-orange-500/10 border-orange-500/30 text-white'
                        : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-300 hover:bg-[#2C2C2E]/40'
                    }`}
                  >
                    <div className="text-xs font-semibold">{t.name}</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Concept Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Что показать (концепт)</label>
              <textarea
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Например: Сравнение монолита и микросервисов..."
                className="w-full h-20 bg-neutral-900 border border-white/5 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-orange-500 resize-none"
              />
            </div>

            {/* Mood select */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Визуальный стиль/настроение</label>
              <div className="grid grid-cols-2 gap-2">
                {["analytical", "energetic", "cozy", "dark"].map(m => (
                  <button
                    key={m}
                    onClick={() => setMood(m)}
                    className={`px-3 py-2 rounded-lg border text-[10px] font-semibold capitalize transition-all cursor-pointer ${
                      mood === m
                        ? 'bg-orange-500/10 border-orange-500/30 text-white'
                        : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {m === "cozy" ? "Уютный" : m === "analytical" ? "Аналитический" : m === "energetic" ? "Энергичный" : "Темный"}
                  </button>
                ))}
              </div>
            </div>

            {/* Apply Button */}
            <button
              onClick={handleAddScene}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-xs font-bold text-white rounded-xl shadow-lg shadow-orange-500/20 cursor-pointer"
            >
              Добавить инфографику
            </button>
          </>
        ) : (
          <>
            {/* 3D Motion Graphic Styles */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">3D-Сцена (Three.js)</label>
              <div className="space-y-2">
                {[
                  { id: "cinematic", name: "Cinematic (Премиум-сфера)", desc: "Золотое 3D-кольцо Torus Knot с наездом камеры" },
                  { id: "blueprint", name: "Blueprint (Техно-куб)", desc: "Неоновый куб, сетка координат, технические надписи" },
                  { id: "liquid", name: "Liquid (Волна частиц)", desc: "3D-волна из анимированных светящихся точек" }
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => setMgStyle(s.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      mgStyle === s.id
                        ? 'bg-orange-500/10 border-orange-500/30 text-white'
                        : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-300 hover:bg-[#2C2C2E]/40'
                    }`}
                  >
                    <div className="text-xs font-semibold">{s.name}</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Title text */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Главный текст (Титр)</label>
              <input
                type="text"
                value={mgText}
                onChange={(e) => setMgText(e.target.value)}
                placeholder="Введите текст титра..."
                className="w-full bg-neutral-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Subtext */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Подзаголовок (Необязательно)</label>
              <input
                type="text"
                value={mgSubtext}
                onChange={(e) => setMgSubtext(e.target.value)}
                placeholder="Введите подстрочник..."
                className="w-full bg-neutral-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Color Presets */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Акцентный цвет (Неон)</label>
              <div className="flex gap-2">
                {[
                  { name: "Фиолетовый", color: "#a78bfa" },
                  { name: "Бирюзовый", color: "#06b6d4" },
                  { name: "Розовый", color: "#ec4899" },
                  { name: "Золотой", color: "#f59e0b" }
                ].map(c => (
                  <button
                    key={c.color}
                    onClick={() => setAccentColor(c.color)}
                    className={`flex-1 py-1 rounded text-[10px] border font-medium cursor-pointer transition-all ${
                      accentColor === c.color
                        ? "text-white"
                        : "text-neutral-400 border-white/5 hover:text-neutral-200"
                    }`}
                    style={{ backgroundColor: c.color + "15", borderColor: accentColor === c.color ? c.color : undefined }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Apply Button */}
            <button
              onClick={handleAddMotionGraphic}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-xs font-bold text-white rounded-xl shadow-lg shadow-orange-500/20 cursor-pointer"
            >
              Добавить 3D motion graphic
            </button>
          </>
        )}
      </div>
    </div>
  );
}
