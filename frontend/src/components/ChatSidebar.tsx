import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ThinkingBar } from "@/components/ui/thinking-bar";
import { Markdown } from "@/components/ui/markdown";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

interface ReasoningStep {
  step: string;
  status: string;
  agent?: string;
  details?: string;
  progress?: number;
}

/* ─────────────────────────────────────────────
   Step icon by status
───────────────────────────────────────────── */
function StepIcon({ status }: { status: string }) {
  if (status === 'done' || status === 'complete') {
    return (
      <svg className="w-3 h-3 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (status === 'thinking' || status === 'active' || status === 'running' || status === 'processing' || status === 'tool' || status === 'tool_call') {
    return (
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse"
        style={{ display: "inline-block" }}
      />
    );
  }
  // default / pending
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0 bg-zinc-800"
      style={{ display: "inline-block" }}
    />
  );
}

/* ─────────────────────────────────────────────
   Live Activity Feed (while isThinking)
───────────────────────────────────────────── */
const STAGES = [
  { id: 'ANALYSIS', label: 'Media & Pacing Analysis' },
  { id: 'PLANNING', label: 'Decomposing Creative Intent' },
  { id: 'EXECUTION', label: 'Timeline Modification Pipeline' },
  { id: 'FINALIZATION', label: 'Compiling Final Master' }
] as const;

function getStepStage(stepName: string): 'ANALYSIS' | 'PLANNING' | 'EXECUTION' | 'FINALIZATION' {
  const clean = stepName.toLowerCase();
  if (
    clean.includes('анализ') ||
    clean.includes('оценка') ||
    clean.includes('инициализация') ||
    clean.includes('context') ||
    clean.includes('transcript') ||
    clean.includes('critic') ||
    clean.includes('критик') ||
    clean.includes('pacing')
  ) {
    return 'ANALYSIS';
  }
  if (
    clean.includes('разбор') ||
    clean.includes('планирование') ||
    clean.includes('director') ||
    clean.includes('agent') ||
    clean.includes('intent') ||
    clean.includes('planning') ||
    clean.includes('decomposing')
  ) {
    return 'PLANNING';
  }
  if (
    clean.includes('вызов') ||
    clean.includes('инструмент') ||
    clean.includes('tool') ||
    clean.includes('pexels') ||
    clean.includes('b-roll') ||
    clean.includes('audio') ||
    clean.includes('graphics') ||
    clean.includes('soundtrack') ||
    clean.includes('subtitles') ||
    clean.includes('zooms') ||
    clean.includes('trimming') ||
    clean.includes('footage') ||
    clean.includes('overrides') ||
    clean.includes('adding') ||
    clean.includes('applying') ||
    clean.includes('scoring') ||
    clean.includes('injecting')
  ) {
    return 'EXECUTION';
  }
  return 'FINALIZATION';
}

function LiveActivityFeed({ steps, logs }: { steps: ReasoningStep[]; logs: string[] }) {
  const stepsByStage = {
    ANALYSIS: [] as ReasoningStep[],
    PLANNING: [] as ReasoningStep[],
    EXECUTION: [] as ReasoningStep[],
    FINALIZATION: [] as ReasoningStep[],
  };

  steps.forEach(step => {
    // Exclude technical/raw step names
    const clean = step.step.trim();
    if (clean.startsWith('{') || clean.includes('"tool_calls"') || clean.includes('ready_to_render')) {
      return;
    }
    const stage = getStepStage(step.step);
    stepsByStage[stage].push(step);
  });

  const stageStatus = STAGES.map(stage => {
    const stageSteps = stepsByStage[stage.id];
    const isPending = stageSteps.length === 0;
    const isCompleted = stageSteps.length > 0 && stageSteps.every(s => s.status === 'done' || s.status === 'complete');
    const isActive = stageSteps.length > 0 && !isCompleted;
    return { id: stage.id, isPending, isCompleted, isActive };
  });

  const activeStageIdx = stageStatus.findIndex(s => s.isActive);
  let lastCompletedStageIdx = -1;
  if (activeStageIdx === -1) {
    for (let i = stageStatus.length - 1; i >= 0; i--) {
      if (stageStatus[i].isCompleted) {
        lastCompletedStageIdx = i;
        break;
      }
    }
  }

  const renderStageSteps = (stageSteps: ReasoningStep[]) => {
    if (stageSteps.length === 0) return null;
    
    const lastStep = stageSteps[stageSteps.length - 1];
    const isLastActive = lastStep.status === 'thinking' || lastStep.status === 'active' || lastStep.status === 'tool' || lastStep.status === 'tool_call' || lastStep.status === 'running' || lastStep.status === 'processing';
    
    let elements: React.ReactNode[] = [];
    
    if (isLastActive) {
      const activeStep = lastStep;
      const completedPrior = stageSteps.slice(0, -1);
      
      if (completedPrior.length > 1) {
        elements.push(
          <div key="collapsed" className="flex items-center gap-2 opacity-40 py-0.5 animate-slide-up pl-5">
            <svg className="w-3 h-3 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[11px] font-mono text-zinc-500">
              {completedPrior.length} steps completed
            </span>
          </div>
        );
        elements.push(
          <div key="last-completed" className="flex items-center gap-2 opacity-50 py-0.5 animate-slide-up pl-5">
            <StepIcon status={completedPrior[completedPrior.length - 1].status} />
            <span className="text-[11px] font-mono text-zinc-400 truncate">
              {completedPrior[completedPrior.length - 1].step}
            </span>
          </div>
        );
      } else {
        completedPrior.forEach((s, idx) => {
          elements.push(
            <div key={`prior-${idx}`} className="flex items-center gap-2 opacity-50 py-0.5 animate-slide-up pl-5">
              <StepIcon status={s.status} />
              <span className="text-[11px] font-mono text-zinc-400 truncate">
                {s.step}
              </span>
            </div>
          );
        });
      }
      
      elements.push(
        <div key="active" className="flex items-center gap-2 py-0.5 animate-slide-up pl-5">
          <StepIcon status={activeStep.status} />
          <span className="text-[11px] font-mono font-medium text-white flex-1 truncate flex items-center gap-1.5">
            {activeStep.step}
            {activeStep.agent && (
              <span className="text-[11px] px-1 py-0.2 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                {activeStep.agent}
              </span>
            )}
          </span>
          {activeStep.progress !== undefined && activeStep.progress < 100 && (
            <div className="shrink-0 h-[2px] w-8 rounded-none overflow-hidden bg-zinc-900 border border-zinc-800">
              <div
                className="h-full transition-all duration-500 bg-white"
                style={{ width: `${activeStep.progress}%` }}
              />
            </div>
          )}
        </div>
      );
    } else {
      if (stageSteps.length > 2) {
        elements.push(
          <div key="collapsed" className="flex items-center gap-2 opacity-40 py-0.5 animate-slide-up pl-5">
            <svg className="w-3 h-3 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[11px] font-mono text-zinc-500">
              {stageSteps.length - 1} steps completed
            </span>
          </div>
        );
        elements.push(
          <div key="last-one" className="flex items-center gap-2 opacity-60 py-0.5 animate-slide-up pl-5">
            <StepIcon status={stageSteps[stageSteps.length - 1].status} />
            <span className="text-[11px] font-mono text-zinc-300 truncate">
              {stageSteps[stageSteps.length - 1].step}
            </span>
          </div>
        );
      } else {
        stageSteps.forEach((s, idx) => {
          elements.push(
            <div key={`step-${idx}`} className="flex items-center gap-2 opacity-60 py-0.5 animate-slide-up pl-5">
              <StepIcon status={s.status} />
              <span className="text-[11px] font-mono text-zinc-300 truncate">
                {s.step}
              </span>
            </div>
          );
        });
      }
    }
    
    return <div className="flex flex-col gap-1.5 mt-1 pb-2 border-l border-zinc-900 ml-[7px] pl-3.5">{elements}</div>;
  };

  return (
    <div className="flex flex-col gap-3 w-full relative">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-glow-white {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; }
        }
        .animate-pulse-glow-white {
          animation: pulse-glow-white 1.5s infinite ease-in-out;
        }
      `}} />
      <div className="absolute left-[7px] top-[10px] bottom-[14px] w-[1px] bg-zinc-900" />
      {STAGES.map((stage, idx) => {
        const stageSteps = stepsByStage[stage.id];
        const isPending = stageSteps.length === 0;
        const isCompleted = stageSteps.length > 0 && stageSteps.every(s => s.status === 'done' || s.status === 'complete');
        const isActive = stageSteps.length > 0 && !isCompleted;
        const shouldExpand = isActive || (isCompleted && idx === lastCompletedStageIdx);
        
        return (
          <div key={stage.id} className="flex flex-col relative z-10">
            <div className="flex items-center gap-3 py-0.5">
              {isCompleted ? (
                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 bg-zinc-900 border border-zinc-800">
                  <svg className="w-2 h-2 text-zinc-300" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              ) : isActive ? (
                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                </div>
              ) : (
                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 bg-zinc-950 border border-zinc-900">
                  <span className="w-1 h-1 rounded-full bg-zinc-850" />
                </div>
              )}
              
              <span
                className="text-[11px] font-mono tracking-wide uppercase"
                style={{
                  color: isActive ? '#FFFFFF' : isCompleted ? '#8E9AAB' : '#3E4656',
                  fontWeight: isActive ? 600 : 400
                }}
              >
                {stage.label}
              </span>
            </div>
            {shouldExpand && renderStageSteps(stageSteps)}
          </div>
        );
      })}

      {/* Last log line — only shown when logs are enabled (handled by parent via props) */}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Collapsed Historical Reasoning
───────────────────────────────────────────── */
function HistoricalReasoning({ steps, index }: { steps: ReasoningStep[]; index: number }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  const doneCount = steps.filter(s => s.status === 'done' || s.status === 'complete').length;

  return (
    <div
      className="w-full rounded-xl overflow-hidden transition-all duration-300"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "rgba(59,130,246,0.5)", display: "inline-block" }}
          />
          <span className="text-[11px] font-mono" style={{ color: "#4A5568" }}>
            reasoning #{index}
          </span>
          <span
            className="text-[11px] px-1 py-0.5 rounded-full font-mono"
            style={{ background: "rgba(59,130,246,0.08)", color: "rgba(59,130,246,0.6)" }}
          >
            {doneCount}/{steps.length} steps
          </span>
        </div>
        <svg
          className="w-3 h-3 transition-transform duration-200"
          style={{ color: "#4A5568", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          viewBox="0 0 24 24" fill="none"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-3 flex flex-col gap-1.5 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <StepIcon status={step.status} />
              <span className="text-[11px] font-mono" style={{ color: "#4A5568" }}>
                {step.step}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Interactive Checklist
───────────────────────────────────────────── */
function InteractiveChecklist({
  rawText,
  onApprove,
  isProcessing,
}: {
  rawText: string;
  onApprove: (approvedJson: string) => void;
  isProcessing: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [intro, setIntro] = useState("");
  const [outro, setOutro] = useState("");
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    const lines = rawText.split('\n');
    const parsedItems: ChecklistItem[] = [];
    const introLines: string[] = [];
    const outroLines: string[] = [];
    let foundChecklist = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^-\s*\[\s*([ xX]?)\s*\]\s*(.*)/);
      if (match) {
        foundChecklist = true;
        parsedItems.push({
          id: Math.random().toString(36).substr(2, 9),
          text: match[2],
          checked: true,
        });
      } else {
        if (!foundChecklist) introLines.push(line);
        else outroLines.push(line);
      }
    });

    setItems(parsedItems);
    setIntro(introLines.join('\n'));
    setOutro(outroLines.join('\n'));
  }, [rawText]);

  const handleToggle = (id: string) =>
    setItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));

  const handleTextChange = (id: string, text: string) =>
    setItems(prev => prev.map(item => item.id === id ? { ...item, text } : item));

  const handleDelete = (id: string) =>
    setItems(prev => prev.filter(item => item.id !== id));

  const handleAddItem = () =>
    setItems(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), text: "New action...", checked: true }]);

  const handleApply = () => {
    const approved = items.filter(item => item.checked).map(item => item.text);
    if (approved.length === 0) return;
    setIsApproved(true);
    onApprove(JSON.stringify(approved, null, 2));
  };

  if (items.length === 0) {
    return <div className="whitespace-pre-wrap leading-relaxed">{rawText}</div>;
  }

  return (
    <div className="flex flex-col gap-2.5 w-full text-[12px] leading-relaxed">
      {intro && (
        <div className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "#9AA4B2" }}>
          {intro}
        </div>
      )}

      <div
        className="flex flex-col gap-1.5 py-3 rounded-xl"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2.5 px-4 py-0.5 group">
            <button
              onClick={() => handleToggle(item.id)}
              disabled={isApproved || isProcessing}
              className="w-3 h-3 rounded-md flex items-center justify-center border transition-all shrink-0 cursor-pointer"
              style={{
                background: item.checked ? "rgba(59,130,246,0.9)" : "transparent",
                borderColor: item.checked ? "rgba(59,130,246,0.9)" : "rgba(255,255,255,0.12)",
              }}
            >
              {item.checked && (
                <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>

            <input
              type="text"
              value={item.text}
              onChange={(e) => handleTextChange(item.id, e.target.value)}
              disabled={isApproved || isProcessing}
              className="flex-1 bg-transparent text-[13px] focus:outline-none border-none"
              style={{ color: item.checked ? "#F5F7FA" : "#3A4151", textDecoration: item.checked ? "none" : "line-through" }}
            />

            {!isApproved && !isProcessing && (
              <button
                onClick={() => handleDelete(item.id)}
                className="opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                style={{ color: "#4A5568" }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        ))}

        {!isApproved && !isProcessing && (
          <button
            onClick={handleAddItem}
            className="flex items-center gap-1.5 text-[15px] font-mono px-4 py-1 mt-1 transition-all cursor-pointer w-fit"
            style={{ color: "#3A4151" }}
          >
            <span>+ add action</span>
          </button>
        )}
      </div>

      {outro && (
        <div className="text-[12px] whitespace-pre-wrap" style={{ color: "#5A6478" }}>{outro}</div>
      )}

      {!isApproved ? (
        <button
          onClick={handleApply}
          disabled={isProcessing || items.filter(i => i.checked).length === 0}
          className="w-full mt-1 py-2 px-3 rounded-lg text-[12px] font-medium transition-all cursor-pointer flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(124,58,237,0.15))",
            border: "1px solid rgba(59,130,246,0.25)",
            color: "#F5F7FA",
          }}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Approve & Execute Plan
        </button>
      ) : (
        <div
          className="flex items-center gap-2 text-[15px] font-mono px-3 py-2 rounded-lg"
          style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", color: "rgba(59,130,246,0.8)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#3B82F6", display: "inline-block" }} />
          Plan approved — executing...
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main ChatSidebar
───────────────────────────────────────────── */
interface ChatSidebarProps {
  chat: { role: string; text?: string; steps?: any[]; variants?: any[] }[];
  message: string;
  setMessage: (msg: string) => void;
  handleSend: (customMessage?: string, isInitial?: boolean, forceEdits?: any[]) => void;
  isProcessing: boolean;
  isAgentTyping: boolean;
  isRenderingBackground: boolean;
  logs: string[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  isMobile?: boolean;
  focusedItem?: any;
  onClearFocus?: () => void;
  isFocusSelectionActive?: boolean;
  onToggleFocusSelection?: () => void;
}

export default function ChatSidebar({
  chat, message, setMessage, handleSend, isProcessing,
  isAgentTyping, isRenderingBackground, logs, chatEndRef, isMobile,
  focusedItem, onClearFocus, isFocusSelectionActive = false, onToggleFocusSelection
}: ChatSidebarProps) {

  const [sidebarWidth, setSidebarWidth] = useState(290);
  const [isResizingWidth, setIsResizingWidth] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showTechnicalLogs, setShowTechnicalLogs] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resizing Horizontal Handler - moved inline with pointer capture

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isProcessing) {
        handleSend(inputValue.trim());
        setInputValue('');
      }
    }
  };

  const handleSubmit = () => {
    if (inputValue.trim() && !isProcessing) {
      handleSend(inputValue.trim());
      setInputValue('');
    }
  };

  const [visibleSteps, setVisibleSteps] = useState<any[]>([]);

  // Extract, deduplicate, and memoize only the current turn's latest reasoning steps
  const uniqueActiveSteps = useMemo(() => {
    const lastUserIdx = chat.map(m => m.role).lastIndexOf('user');
    const activeReasoningSteps = chat
      .slice(lastUserIdx + 1)
      .filter(m => m.role === 'reasoning')
      .flatMap(m => m.steps || []);

    const uniqueStepsMap = new Map<string, any>();
    activeReasoningSteps.forEach(step => {
      uniqueStepsMap.set(step.step, step);
    });
    return Array.from(uniqueStepsMap.values());
  }, [chat]);

  useEffect(() => {
    if (!isAgentTyping) {
      if (visibleSteps.length > 0) {
        setVisibleSteps([]);
      }
      return;
    }
    
    // Find steps in uniqueActiveSteps that are not yet in visibleSteps
    const pending = uniqueActiveSteps.filter(
      us => !visibleSteps.some(vs => vs.step === us.step)
    );
    
    if (pending.length > 0) {
      const timer = setTimeout(() => {
        setVisibleSteps(prev => {
          const next = pending[0];
          const idx = prev.findIndex(s => s.step === next.step);
          if (idx !== -1) {
            const copy = [...prev];
            copy[idx] = next;
            return copy;
          }
          return [...prev, next];
        });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      const hasUpdate = uniqueActiveSteps.some(us => {
        const vs = visibleSteps.find(v => v.step === us.step);
        return vs && (vs.status !== us.status || vs.progress !== us.progress || vs.details !== us.details);
      });
      if (hasUpdate) {
        setVisibleSteps(uniqueActiveSteps.map(us => {
          const vs = visibleSteps.find(v => v.step === us.step);
          return vs ? { ...vs, status: us.status, progress: us.progress, details: us.details } : us;
        }));
      }
    }
  }, [uniqueActiveSteps, isAgentTyping, visibleSteps]);

  // Count historical reasoning blocks
  let reasoningBlockIndex = 0;

  return (
    <div
      style={{
        width: isMobile ? "100%" : `${sidebarWidth}px`,
        background: "rgba(20,20,20,0.65)", backdropFilter: "blur(20px)",
        borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.06)",
      }}
      className="shrink-0 flex flex-col overflow-hidden relative w-full h-full"
    >
      {/* Resize handle */}
      {!isMobile && (
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsResizingWidth(true);
          }}
          onPointerMove={(e) => {
            if (!isResizingWidth) return;
            const newWidth = Math.max(240, Math.min(520, e.clientX));
            setSidebarWidth(newWidth);
          }}
          onPointerUp={(e) => {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch (err) {}
            setIsResizingWidth(false);
          }}
          className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-40 transition-all ${isResizingWidth ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
          style={{ background: "rgba(59,130,246,0.3)" }}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-3 h-3 rounded-md flex items-center justify-center"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)" }}
          >
            <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="rgba(59,130,246,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-[12px] font-medium" style={{ color: "#9AA4B2", letterSpacing: "0.02em" }}>
            AI Editor
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTechnicalLogs(v => !v)}
            className="text-[11px] font-mono px-1.5 py-0.5 rounded-md border transition-all cursor-pointer select-none"
            style={{
              background: showTechnicalLogs ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.02)",
              borderColor: showTechnicalLogs ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.08)",
              color: showTechnicalLogs ? "#3B82F6" : "#4A5568",
            }}
          >
            {showTechnicalLogs ? "Logs: ON" : "Logs: OFF"}
          </button>
          
          {isAgentTyping && (
            <div className="flex items-center gap-1.5 shrink-0">
              {[0, 0.15, 0.3].map((delay, i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full animate-dot-pulse"
                  style={{
                    background: "#3B82F6",
                    display: "inline-block",
                    animationDelay: `${delay}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 flex flex-col">
        {chat.length === 0 ? (
          <div className="flex-1 flex flex-col items-start justify-center my-auto space-y-3 animate-fade-blur">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center mb-1"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="rgba(59,130,246,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h3 className="text-[13px] font-medium mb-1" style={{ color: "#F5F7FA" }}>
                Synapix Cinematic Studio
              </h3>
              <p className="text-[11px] leading-relaxed" style={{ color: "#5A6478" }}>
                Type a prompt to start the editing pipeline.
              </p>
            </div>
          </div>
        ) : (
          <>
            {chat.map((msg, idx) => {
              /* ── Reasoning block (historical) ── */
              if (msg.role === 'reasoning') {
                const blockIdx = ++reasoningBlockIndex;
                if (!showTechnicalLogs) return null;
                return (
                  <HistoricalReasoning
                    key={idx}
                    steps={msg.steps || []}
                    index={blockIdx}
                  />
                );
              }

              /* ── User message ── */
              if (msg.role === 'user') {
                let displayText = msg.text || '';
                let badge = '';
                if (displayText.startsWith('[Plan]')) { displayText = displayText.replace('[Plan]', '').trim(); badge = 'plan'; }
                else if (displayText.startsWith('[Think]')) { displayText = displayText.replace('[Think]', '').trim(); badge = 'think'; }
                else if (displayText.startsWith('[Canvas]')) { displayText = displayText.replace('[Canvas]', '').trim(); badge = 'graphics'; }
                else if (displayText.startsWith('[ApprovedPlan]')) { displayText = 'Editing plan approved.'; badge = 'approved'; }

                return (
                  <div
                    key={idx}
                    className="flex flex-col items-end w-full animate-slide-up"
                    style={{ animationDelay: `${idx * 0.02}s` }}
                  >
                    {badge && (
                      <span
                        className="text-[11px] font-mono uppercase tracking-widest mb-1 px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(59,130,246,0.1)", color: "rgba(59,130,246,0.7)", border: "1px solid rgba(59,130,246,0.15)" }}
                      >
                        {badge}
                      </span>
                    )}
                    <div
                      className="max-w-[88%] px-3 py-2 rounded-[16px] rounded-tr-sm text-[13px] leading-relaxed"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#F5F7FA",
                      }}
                    >
                      {displayText}
                    </div>
                  </div>
                );
              }

              /* ── AI message ── */
              if (msg.role === 'ai') {
                const isChecklist = msg.text && msg.text.includes('- [ ]');
                const isLastMsg = idx === chat.length - 1;
                const showCursor = isLastMsg && isAgentTyping;
                return (
                  <div
                    key={idx}
                    className="flex flex-col items-start w-full animate-slide-up"
                    style={{ animationDelay: `${idx * 0.02}s` }}
                  >
                    <style dangerouslySetInnerHTML={{ __html: `
                      @keyframes pulse-cursor {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                      }
                      .animate-pulse-cursor {
                        animation: pulse-cursor 0.8s infinite;
                      }
                    `}} />
                    <div
                      className="w-full text-[13px] leading-relaxed pr-2"
                      style={{ color: "#C4CCD8" }}
                    >
                      {isChecklist ? (
                        <InteractiveChecklist
                          rawText={msg.text || ''}
                          onApprove={(approvedJson) => handleSend("[ApprovedPlan] " + approvedJson)}
                          isProcessing={isProcessing}
                        />
                      ) : (
                        <div className="relative">
                          {msg.text ? (
                            <Markdown 
                              className="text-[13px] text-[#C4CCD8] font-sans leading-[1.6] whitespace-pre-wrap"
                              showCursor={showCursor}
                            >
                              {msg.text}
                            </Markdown>
                          ) : showCursor ? (
                            <span className="inline-block w-1.5 h-3.5 bg-blue-500 animate-pulse-cursor align-middle" />
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* Live reasoning while agent is typing — full pipeline (Logs ON) */}
            {isAgentTyping && visibleSteps.length > 0 && showTechnicalLogs && (
              <div
                className="w-full rounded-lg px-3 py-2 animate-fade-blur"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(59,130,246,0.1)",
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: "#3B82F6", display: "inline-block" }}
                    />
                    <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "rgba(59,130,246,0.6)" }}>
                      reasoning pipeline
                    </span>
                  </div>
                  <button
                    onClick={() => setShowTechnicalLogs(false)}
                    className="text-zinc-500 hover:text-zinc-300 border-zinc-700 hover:border-zinc-500 border-b border-dotted text-[15px] font-mono transition-colors focus:outline-none select-none cursor-pointer"
                  >
                    Hide logs
                  </button>
                </div>
                <LiveActivityFeed steps={visibleSteps} logs={logs} />
              </div>
            )}

            {/* Minimal thinking indicator — Logs OFF */}
            {isAgentTyping && !showTechnicalLogs && (
              <div className="w-full animate-fade-blur py-1">
                <ThinkingBar 
                  text="Analyzing video & compiling timeline" 
                  onClick={() => setShowTechnicalLogs(true)}
                />
              </div>
            )}

            {/* Typing shimmer with steps loading — Logs ON only */}
            {isAgentTyping && visibleSteps.length === 0 && showTechnicalLogs && (
              <div className="w-full animate-fade-blur py-1">
                <ThinkingBar 
                  text="Initializing pipeline..." 
                  onStop={() => setShowTechnicalLogs(false)}
                  stopLabel="Hide logs"
                />
              </div>
            )}
          </>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div
        className="shrink-0 p-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {/* Dynamic Focus Mode Glassmorphic Badge */}
        {focusedItem && (
          <div 
            className="mb-3 p-2 rounded-[16px] border transition-all duration-300 animate-fade-blur"
            style={{
              background: focusedItem.type === 'broll' ? "rgba(6, 182, 212, 0.04)" :
                          focusedItem.type === 'music' ? "rgba(16, 185, 129, 0.04)" :
                          focusedItem.type === 'sfx' ? "rgba(245, 158, 11, 0.04)" :
                          focusedItem.type === 'subtitles' ? "rgba(59, 130, 246, 0.04)" :
                          focusedItem.type === 'scene' ? "rgba(168, 85, 247, 0.04)" : "rgba(255, 255, 255, 0.02)",
              borderColor: focusedItem.type === 'broll' ? "rgba(6, 182, 212, 0.15)" :
                           focusedItem.type === 'music' ? "rgba(16, 185, 129, 0.15)" :
                           focusedItem.type === 'sfx' ? "rgba(245, 158, 11, 0.15)" :
                           focusedItem.type === 'subtitles' ? "rgba(59, 130, 246, 0.15)" :
                           focusedItem.type === 'scene' ? "rgba(168, 85, 247, 0.15)" : "rgba(255, 255, 255, 0.06)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 max-w-[85%]">
                <span 
                  className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                  style={{
                    background: focusedItem.type === 'broll' ? "#06B6D4" :
                                focusedItem.type === 'music' ? "#10B981" :
                                focusedItem.type === 'sfx' ? "#F59E0B" :
                                focusedItem.type === 'subtitles' ? "#3B82F6" :
                                focusedItem.type === 'scene' ? "#A855F7" : "#FFFFFF",
                    boxShadow: `0 0 6px ${focusedItem.type === 'broll' ? "#06B6D4" :
                                         focusedItem.type === 'music' ? "#10B981" :
                                         focusedItem.type === 'sfx' ? "#F59E0B" :
                                         focusedItem.type === 'subtitles' ? "#3B82F6" :
                                         focusedItem.type === 'scene' ? "#A855F7" : "#FFFFFF"}`
                  }}
                />
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-550">
                  фокус:
                </span>
                <span className="text-[12px] font-sans font-bold text-white truncate max-w-[120px] md:max-w-[160px]">
                  {focusedItem.label}
                </span>
                <span className="text-[11px] font-mono font-bold bg-white/5 border border-white/5 rounded px-1 text-zinc-400 select-none">
                  {focusedItem.start.toFixed(1)}s - {focusedItem.end.toFixed(1)}s
                </span>
              </div>
              <button 
                onClick={onClearFocus}
                className="text-zinc-500 hover:text-white text-[11px] font-bold h-4 w-4 rounded-lg flex items-center justify-center cursor-pointer transition-all hover:bg-white/5"
                title="Сбросить фокус"
              >
                ✕
              </button>
            </div>
            <div className="text-[11px] font-sans text-zinc-500 mt-1 pl-3">
              ИИ применит ваши правки только к этому фрагменту
            </div>
          </div>
        )}

        <div
          className="flex flex-col rounded-[16px] overflow-hidden transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: isFocusSelectionActive 
              ? "1px solid rgba(59, 130, 246, 0.4)" 
              : "1px solid rgba(255,255,255,0.08)",
            boxShadow: isFocusSelectionActive ? "0 0 15px rgba(59, 130, 246, 0.08)" : "none"
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            placeholder={
              isAgentTyping
                ? 'AI is thinking...'
                : focusedItem
                  ? 'Что сделать с этим моментом? (например: "сделай громче", "удали", "замени текст")...'
                  : isFocusSelectionActive
                    ? 'Выберите фрагмент клипа на таймлайне...'
                    : 'Describe an edit...'
            }
            rows={3}
            className="w-full bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed resize-none focus:outline-none"
            style={{
              color: "#F5F7FA",
              caretColor: "#3B82F6",
            }}
          />
          <div
            className="flex items-center justify-between px-3 pb-2 pt-1"
          >
            <div className="flex items-center gap-2.5">
              {!isMobile && (
                <span className="hidden sm:inline text-[11px] font-mono text-zinc-600" style={{ color: "#3A4151" }}>
                  ↵ send · shift+↵ newline
                </span>
              )}
              {onToggleFocusSelection && (
                <button
                  onClick={onToggleFocusSelection}
                  className="p-1 rounded-lg border flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 hover:text-white"
                  style={{
                    background: isFocusSelectionActive 
                      ? "rgba(59, 130, 246, 0.15)" 
                      : "rgba(255, 255, 255, 0.02)",
                    borderColor: isFocusSelectionActive 
                      ? "rgba(59, 130, 246, 0.4)" 
                      : "rgba(255, 255, 255, 0.06)",
                    color: isFocusSelectionActive ? "#60A5FA" : "#4E5668",
                    boxShadow: isFocusSelectionActive ? "0 0 8px rgba(59,130,246,0.15)" : "none"
                  }}
                  title={isFocusSelectionActive ? "Режим выбора активен — кликните фрагмент на таймлайне" : "Выбрать клип на таймлайне (Focus Mode)"}
                >
                  <svg className={`w-3 h-3 ${isFocusSelectionActive ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={handleSubmit}
              disabled={isProcessing || !inputValue.trim()}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium transition-all cursor-pointer"
              style={{
                background: inputValue.trim() && !isProcessing
                  ? "rgba(59,130,246,0.2)"
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${inputValue.trim() && !isProcessing ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"}`,
                color: inputValue.trim() && !isProcessing ? "#F5F7FA" : "#3A4151",
              }}
            >
              {isAgentTyping ? (
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    border: "1.5px solid rgba(59,130,246,0.3)",
                    borderTopColor: "#3B82F6",
                    animation: "spin 0.9s linear infinite",
                  }}
                />
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">

                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              <span>{isAgentTyping ? 'thinking' : 'send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
