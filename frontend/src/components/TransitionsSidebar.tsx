import React, { useState } from "react";
import { getApiUrl } from "@/utils/api";

interface TopicBoundary {
  time: number;
  score: number;
  reason?: string;
  from_topic?: string;
  to_topic?: string;
  suggested_type?: string;
}

interface TransitionsSidebarProps {
  activeEdits: any[];
  onEditsChange: (edits: any[]) => void;
  onClose: () => void;
  currentTime?: number;
  fileId?: string;
}

export default function TransitionsSidebar({
  activeEdits,
  onEditsChange,
  onClose,
  currentTime = 0,
  fileId,
}: TransitionsSidebarProps) {
  const [transitionType, setTransitionType] = useState("whoosh");
  const [boundaries, setBoundaries] = useState<TopicBoundary[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState("");

  const transitionAt = (time: number, type: string) => {
    const t = Math.round(time * 10) / 10;
    const cleanEdits = activeEdits.filter(
      (e) =>
        !(
          e.action === "build_transition" &&
          Math.abs((e.start ?? e.start_time ?? 0) - t) < 0.5
        )
    );
    onEditsChange([
      ...cleanEdits,
      {
        action: "build_transition",
        start: t,
        end: Math.round((t + 0.8) * 10) / 10,
        transition_type: type,
      },
    ]);
  };

  const handleApplyTransition = () => {
    transitionAt(currentTime, transitionType);
  };

  const handleDetectTopics = async () => {
    if (!fileId) {
      setDetectError("Нет ID проекта");
      return;
    }
    setIsDetecting(true);
    setDetectError("");
    try {
      const API_URL = getApiUrl();
      const res = await fetch(`${API_URL}/api/video/${fileId}/topic_transitions`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setBoundaries(data.boundaries || []);
      if (!data.boundaries?.length) {
        setDetectError("Смены темы не найдены");
      }
    } catch (e: any) {
      setDetectError(e?.message || "Ошибка детекта");
    } finally {
      setIsDetecting(false);
    }
  };

  const handleApplyAllDetected = () => {
    if (!boundaries.length) return;
    let next = [...activeEdits];
    for (const b of boundaries) {
      const t = Math.round(b.time * 10) / 10;
      const type = b.suggested_type || transitionType;
      next = next.filter(
        (e) =>
          !(
            e.action === "build_transition" &&
            Math.abs((e.start ?? e.start_time ?? 0) - t) < 0.5
          )
      );
      next.push({
        action: "build_transition",
        start: t,
        end: Math.round((t + 0.8) * 10) / 10,
        transition_type: type,
        reason: b.reason,
        from_topic: b.from_topic,
        to_topic: b.to_topic,
      });
    }
    onEditsChange(next);
  };

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white">Переходы склеек</h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors text-xs cursor-pointer">
          Закрыть
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Auto topic detection */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">
            Смены темы
          </label>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            Находит моменты, где спикер меняет тему — туда ставятся монтажные переходы.
          </p>
          <button
            onClick={handleDetectTopics}
            disabled={isDetecting || !fileId}
            className="w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 disabled:opacity-40 transition-all text-xs font-semibold text-white rounded-xl cursor-pointer"
          >
            {isDetecting ? "Ищу смены темы..." : "Найти смены темы"}
          </button>
          {detectError && (
            <div className="text-[11px] text-rose-400">{detectError}</div>
          )}
          {boundaries.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                  Найдено: {boundaries.length}
                </span>
                <button
                  onClick={handleApplyAllDetected}
                  type="button"
                  className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold cursor-pointer"
                >
                  Применить все
                </button>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {boundaries.map((b, i) => (
                  <button
                    key={`${b.time}-${i}`}
                    type="button"
                    onClick={() => transitionAt(b.time, b.suggested_type || transitionType)}
                    className="w-full text-left p-2.5 rounded-xl bg-[#2C2C2E]/25 border border-white/5 hover:border-orange-500/30 transition-all cursor-pointer"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] font-mono text-orange-400">{b.time.toFixed(1)}s</span>
                      <span className="text-[10px] text-neutral-500 uppercase">{b.suggested_type || "whoosh"}</span>
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-1 line-clamp-2">
                      {b.to_topic || b.reason}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Transition types */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold tracking-wide uppercase text-neutral-400">Тип перехода</label>
          <div className="space-y-2">
            {[
              { id: "whoosh", name: "Whoosh (Быстрый сдвиг)", desc: "Динамичный переход с размытием движения" },
              { id: "glitch", name: "Glitch (Глитч)", desc: "Эффект цифровых помех и видео-артефактов" },
              { id: "film", name: "Film Burn (Засветка)", desc: "Эстетичный переход с эффектом кинопленки" },
              { id: "dissolve", name: "Dissolve (Растворение)", desc: "Плавное перетекание одного кадра в другой" }
            ].map(trans => (
              <button
                key={trans.id}
                onClick={() => setTransitionType(trans.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  transitionType === trans.id
                    ? 'bg-orange-500/10 border-orange-500/30 text-white'
                    : 'bg-[#2C2C2E]/20 border-white/5 text-neutral-300 hover:bg-[#2C2C2E]/40'
                }`}
              >
                <div className="text-xs font-semibold">{trans.name}</div>
                <div className="text-[10px] text-neutral-400 mt-0.5">{trans.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Time display info */}
        <div className="p-3 bg-[#2C2C2E]/20 border border-white/5 rounded-xl flex justify-between items-center text-xs">
          <span className="text-neutral-400">Таймкод установки:</span>
          <span className="text-orange-500 font-mono font-semibold">{currentTime.toFixed(2)} сек</span>
        </div>

        {/* Apply button */}
        <button
          onClick={handleApplyTransition}
          className="w-full py-3 bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-xs font-bold text-white rounded-xl shadow-lg shadow-orange-500/20 cursor-pointer"
        >
          Установить переход на склейку
        </button>
      </div>
    </div>
  );
}
