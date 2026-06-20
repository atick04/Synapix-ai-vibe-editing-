"use client";

import React, { useState, useEffect } from "react";

export default function TimelineEditor({ 
  transcript,
  activeEdits,
  onEditsChange,
  subtitleChunks = [],
  selectedSubIndices = [],
  onSubSelectionChange
}: { 
  transcript: any;
  activeEdits: any[];
  onEditsChange: (edits: any[]) => void;
  subtitleChunks?: any[];
  selectedSubIndices?: number[];
  onSubSelectionChange?: (indices: number[]) => void;
}) {
    const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
    const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const words = transcript?.words || [];

    const handleWordClick = (word: any) => {
        let cutIndex = -1;
        const isCut = activeEdits.some((edit, idx) => {
            if (edit.action === "cut_out") {
                if ((word.start >= edit.start && word.start < edit.end) || 
                    (word.end > edit.start && word.end <= edit.end) ||
                    (word.start <= edit.start && word.end >= edit.end)
                   ) {
                    cutIndex = idx;
                    return true;
                }
            }
            return false;
        });

        if (isCut) {
            const newEdits = [...activeEdits];
            newEdits.splice(cutIndex, 1);
            onEditsChange(newEdits);
        } else {
            onEditsChange([...activeEdits, { action: "cut_out", start: word.start, end: word.end }]);
        }
    };

    const handlePointerDown = (e: React.PointerEvent, idx: number) => {
        if (e.button !== 0) return; // Only select on left click
        e.preventDefault();
        setDragStartIdx(idx);
        setDragEndIdx(idx);
        setIsDragging(true);
    };

    const handlePointerEnter = (idx: number) => {
        if (isDragging) {
            setDragEndIdx(idx);
        }
    };

    // Global pointerup listener to handle drag release cleanly
    useEffect(() => {
        const handlePointerUp = () => {
            if (isDragging && dragStartIdx !== null && dragEndIdx !== null) {
                const minIdx = Math.min(dragStartIdx, dragEndIdx);
                const maxIdx = Math.max(dragStartIdx, dragEndIdx);
                
                if (minIdx === maxIdx) {
                    // Single click: toggle word cut
                    if (words[minIdx]) {
                        handleWordClick(words[minIdx]);
                    }
                } else {
                    // Dragged range: select overlapping subtitle chunks
                    const selectedWords = words.slice(minIdx, maxIdx + 1);
                    if (selectedWords.length > 0) {
                        const start = selectedWords[0].start;
                        const end = selectedWords[selectedWords.length - 1].end;
                        
                        const overlapping: number[] = [];
                        subtitleChunks.forEach((chunk: any, i: number) => {
                            if (chunk.start < end + 0.01 && chunk.end > start - 0.01) {
                                overlapping.push(i);
                            }
                        });
                        
                        if (onSubSelectionChange) {
                            onSubSelectionChange(overlapping);
                        }
                    }
                }
            }
            setIsDragging(false);
            setDragStartIdx(null);
            setDragEndIdx(null);
        };

        if (isDragging) {
            window.addEventListener("pointerup", handlePointerUp);
        }
        return () => {
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [isDragging, dragStartIdx, dragEndIdx, words, subtitleChunks, onSubSelectionChange]);

    if (!transcript || !transcript.words) return <div className="p-6 text-zinc-550 font-mono text-[12px] lowercase">loading transcript timeline...</div>;
    if (words.length === 0) return <div className="p-6 text-zinc-550 font-mono text-[12px] lowercase">no words detected in transcript.</div>;

    const isWordDragged = (idx: number) => {
        if (dragStartIdx === null || dragEndIdx === null) return false;
        const min = Math.min(dragStartIdx, dragEndIdx);
        const max = Math.max(dragStartIdx, dragEndIdx);
        return idx >= min && idx <= max;
    };

    const isWordInSelectedSubtitle = (w: any) => {
        if (!selectedSubIndices || selectedSubIndices.length === 0) return false;
        return selectedSubIndices.some((chunkIdx: number) => {
            const chunk = subtitleChunks[chunkIdx];
            return chunk && w.start >= chunk.start - 0.01 && w.end <= chunk.end + 0.01;
        });
    };

    return (
        <div className="flex flex-col gap-3 h-full font-sans select-none">
            <div className="flex justify-between items-center mb-2 sticky top-0 bg-transparent z-10 py-1.5 border-b border-black/5 dark:border-white/5">
                <h3 className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <svg className="w-4 h-4 text-neutral-600 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                    </svg>
                    Transcript Timeline
                </h3>
                <span className="text-[12px] text-neutral-600 dark:text-neutral-400 bg-neutral-50/50 dark:bg-neutral-950/50 px-4 py-1 border border-black/5 dark:border-white/5 flex items-center gap-2 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-pulse"></span>
                    Click word to cut | Drag to select subtitles
                </span>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 group">
                <div className="flex flex-wrap leading-relaxed gap-y-1.5 gap-x-1">
                    {words.map((w: any, idx: number) => {
                        const isCut = activeEdits.some(edit => edit.action === "cut_out" && (w.start >= edit.start - 0.1 && w.end <= edit.end + 0.1));
                        const dragged = isWordDragged(idx);
                        const inSelectedSub = isWordInSelectedSubtitle(w);
                        const isHighlighted = dragged || inSelectedSub;

                        return (
                            <span 
                                key={idx}
                                onPointerDown={(e) => handlePointerDown(e, idx)}
                                onPointerEnter={() => handlePointerEnter(idx)}
                                className={`
                                    relative cursor-pointer transition-all px-1 py-0.5 rounded text-[12px] font-mono lowercase select-none
                                    ${isCut 
                                        ? 'text-zinc-650 bg-zinc-950/60 line-through decoration-zinc-700/60 hover:bg-zinc-900/80' 
                                        : isHighlighted
                                            ? 'bg-blue-500/20 text-blue-300 font-bold border-b border-blue-400'
                                            : 'text-zinc-350 hover:bg-blue-500/10 hover:text-blue-400'
                                    }
                                `}
                                title={`start: ${w.start.toFixed(2)}s | end: ${w.end.toFixed(2)}s`}
                            >
                                {w.word}
                            </span>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}
