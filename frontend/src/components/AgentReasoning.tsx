"use client";

import React, { useEffect, useMemo, useState } from "react";

export type ThoughtItem = {
    id?: string;
    text: string;
    status?: "running" | "done" | "error" | string;
    phase?: string;
    step?: string;
    details?: string;
};

type AgentReasoningProps = {
    thoughts: ThoughtItem[];
    /** Live mode: expanded chain while the agent is working */
    live?: boolean;
    /** After final reply: collapsed by default, expands on click */
    defaultOpen?: boolean;
    className?: string;
};

const PHASE_HINT: Record<string, string> = {
    think: "Thinking",
    analyze: "Analyzing",
    plan: "Planning",
    create: "Creating",
    polish: "Polishing",
    audio: "Sound",
    execute: "Editing",
    review: "Reviewing",
};

function uniqueThoughts(items: ThoughtItem[]): ThoughtItem[] {
    const out: ThoughtItem[] = [];
    const seen = new Set<string>();
    for (const item of items) {
        const text = (item.text || item.details || "").trim();
        if (!text) continue;
        // Collapse near-duplicates (same first 48 chars)
        const key = text.slice(0, 48).toLowerCase();
        if (seen.has(key)) {
            // Prefer newer status on the existing line
            const prev = out.find((t) => (t.text || "").slice(0, 48).toLowerCase() === key);
            if (prev && item.status) prev.status = item.status;
            continue;
        }
        seen.add(key);
        out.push({ ...item, text });
    }
    return out;
}

export function AgentReasoning({
    thoughts,
    live = false,
    defaultOpen = false,
    className = "",
}: AgentReasoningProps) {
    const chain = useMemo(() => uniqueThoughts(thoughts), [thoughts]);
    const [open, setOpen] = useState(live ? true : defaultOpen);
    const running = chain.find((t) => t.status === "running") || (live ? chain[chain.length - 1] : null);
    const phaseLabel = running?.phase ? (PHASE_HINT[running.phase] || "Thinking") : "Thinking";

    useEffect(() => {
        if (live) setOpen(true);
    }, [live, chain.length]);

    if (!chain.length) return null;

    // Collapsed summary chip (post-reply)
    if (!live && !open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`group w-full flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] px-3 py-2 transition-colors cursor-pointer ${className}`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400/40" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400/80" />
                    </span>
                    <span className="text-[11px] text-neutral-400 group-hover:text-neutral-200 truncate">
                        Рассуждение · {chain.length} {chain.length === 1 ? "шаг" : chain.length < 5 ? "шага" : "шагов"}
                    </span>
                </div>
                <svg className="w-3.5 h-3.5 text-neutral-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
        );
    }

    return (
        <div
            className={`rounded-xl border border-violet-400/15 bg-gradient-to-b from-violet-500/[0.07] to-white/[0.02] overflow-hidden ${className}`}
        >
            <button
                type="button"
                onClick={() => !live && setOpen(false)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-left ${live ? "cursor-default" : "cursor-pointer hover:bg-white/[0.03]"}`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {live ? (
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
                        </span>
                    ) : (
                        <span className="w-2 h-2 rounded-full bg-violet-400/80 shrink-0" />
                    )}
                    <span className="text-[11px] font-medium text-violet-100/90 truncate">
                        {live ? (
                            <span className="inline-flex items-center gap-1.5">
                                <span className="text-sky-200/90 animate-pulse">{phaseLabel}…</span>
                                <span className="text-neutral-500 font-normal normal-case">
                                    {(running?.text || "анализирую запрос").slice(0, 42)}
                                    {(running?.text || "").length > 42 ? "…" : ""}
                                </span>
                            </span>
                        ) : (
                            `Рассуждение · ${chain.length} шагов`
                        )}
                    </span>
                </div>
                {!live && (
                    <svg className="w-3.5 h-3.5 text-neutral-500 shrink-0 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </button>

            <div className="px-3 pb-3 space-y-2.5 border-t border-white/[0.05]">
                <div className="pt-2.5 space-y-2 max-h-64 overflow-y-auto pr-1">
                    {chain.map((t, i) => {
                        const isRun = t.status === "running" || (live && i === chain.length - 1 && t.status !== "done");
                        return (
                            <div
                                key={t.id || `${i}-${t.text.slice(0, 24)}`}
                                className="flex gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300"
                                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                            >
                                <div className="mt-1.5 shrink-0">
                                    {isRun ? (
                                        <span className="block w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                                    ) : t.status === "error" ? (
                                        <span className="block w-1.5 h-1.5 rounded-full bg-rose-400" />
                                    ) : (
                                        <span className="block w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                                    )}
                                </div>
                                <p className={`text-[12.5px] leading-relaxed ${isRun ? "text-sky-50" : "text-neutral-300"}`}>
                                    {t.text}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** Collect human thoughts from a reasoning chat message's steps */
export function thoughtsFromReasoningMsg(msg: any): ThoughtItem[] {
    if (!msg?.steps?.length) return [];
    return msg.steps
        .filter((s: any) => s.user_visible !== false && (s.thought || s.details || s.step))
        .map((s: any, i: number) => ({
            id: s.id || `t-${i}-${(s.thought || s.step || "").slice(0, 16)}`,
            text: s.thought || (s.details || "").split("\n")[0] || (s.step?.split(":", 2)[1] || s.step || "").trim(),
            status: s.status,
            phase: s.phase,
            step: s.step,
            details: s.details,
        }))
        .filter((t: ThoughtItem) => !!t.text);
}
