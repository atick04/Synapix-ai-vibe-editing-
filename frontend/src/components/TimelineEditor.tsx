"use client";

import React from "react";

export default function TimelineEditor({ 
  transcript,
  activeEdits,
  onEditsChange
}: { 
  transcript: any;
  activeEdits: any[];
  onEditsChange: (edits: any[]) => void;
}) {
    if (!transcript || !transcript.words) return <div className="p-6 text-zinc-550 font-mono text-[11px] lowercase">loading transcript timeline...</div>;

    const words = transcript.words;
    if (words.length === 0) return <div className="p-6 text-zinc-550 font-mono text-[11px] lowercase">no words detected in transcript.</div>;

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

    return (
        <div className="flex flex-col gap-3 h-full font-mono">
            <div className="flex justify-between items-center mb-1 sticky top-0 bg-[#08080a] z-10 py-1.5 border-b border-zinc-900/40">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                    </svg>
                    transcript timeline
                </h3>
                <span className="text-[9px] text-zinc-550 bg-zinc-950 px-2 py-0.5 border border-zinc-900 flex items-center gap-1.5 rounded-none">
                    <span className="w-1.5 h-1.5 rounded-none bg-amber-500 inline-block animate-pulse"></span>
                    click word to cut / restore
                </span>
            </div>
            
            <div className="flex-1 overflow-y-auto px-1 group">
                <div className="flex flex-wrap leading-relaxed gap-y-1.5 gap-x-1">
                    {words.map((w: any, idx: number) => {
                        const isCut = activeEdits.some(edit => edit.action === "cut_out" && (w.start >= edit.start - 0.1 && w.end <= edit.end + 0.1));
                        
                        return (
                            <span 
                                key={idx}
                                onClick={() => handleWordClick(w)}
                                className={`
                                    relative cursor-pointer transition-all px-1 py-0.5 rounded-none text-[11px] select-none font-mono lowercase
                                    ${isCut 
                                        ? 'text-zinc-600 bg-zinc-950/60 line-through decoration-zinc-700/60 hover:bg-zinc-900/80' 
                                        : 'text-zinc-350 hover:bg-amber-500/10 hover:text-amber-500'
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
