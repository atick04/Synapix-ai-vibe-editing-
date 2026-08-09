import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { AgentReasoning, thoughtsFromReasoningMsg } from '@/components/AgentReasoning';

export default function ChatSidebar({
    chat,
    message,
    setMessage,
    handleSend,
    isProcessing,
    isAgentTyping,
    isRenderingBackground,
    logs,
    chatEndRef,
    isMobile,
    focusedItem,
    onClearFocus,
    isFocusSelectionActive,
    onToggleFocusSelection,
    onStopAgent
}: {
    chat: any[];
    message: string;
    setMessage: (v: string) => void;
    handleSend: (customMessage?: string, isInitial?: boolean, forceEdits?: any[]) => void;
    isProcessing: boolean;
    isAgentTyping: boolean;
    isRenderingBackground: boolean;
    logs: string[];
    chatEndRef: any;
    isMobile: boolean;
    focusedItem?: any;
    onClearFocus?: () => void;
    isFocusSelectionActive?: boolean;
    onToggleFocusSelection?: () => void;
    onStopAgent?: () => void;
    [key: string]: any;
}) {
    const { t } = useLanguage();
    const [input, setInput] = useState('');
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-adjust textarea height based on content volume
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const newHeight = Math.min(textareaRef.current.scrollHeight, 220);
            textareaRef.current.style.height = `${newHeight}px`;
        }
    }, [input]);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isProcessing) {
            setMessage(input);
            handleSend(input);
            setInput('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 120;
        setShowScrollBottom(isFarFromBottom);
    };

    useEffect(() => {
        if (chatEndRef.current && !showScrollBottom) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chat, isAgentTyping, isProcessing]);

    const formatCleanText = (text: string) => {
        if (!text) return "";
        return text
            .replace(/B-roll/gi, "Графика")
            .replace(/add_broll/g, "Сцена")
            .replace(/cut_clip/g, "Нарезка");
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden w-full h-full bg-transparent text-neutral-200 animate-in fade-in duration-300 relative font-sans">
            {/* GlassMorphic Header */}
            <div className="flex items-center justify-between px-5 py-3.5 shrink-0 border-b border-white/[0.08] bg-black/20 backdrop-blur-xl select-none">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-4.5 rounded-full bg-white flex items-center justify-center gap-1 shadow-sm hover:opacity-90 transition-opacity">
                        <span className="w-1 h-1 rounded-full bg-black" />
                        <span className="w-1 h-1 rounded-full bg-black" />
                    </div>
                    <span className="text-xs font-semibold text-white tracking-wide">Synapix Vibe Engine</span>
                </div>
                <div className="flex items-center gap-2">
                    {isProcessing && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-400/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                            <span className="text-[9px] text-sky-400 font-mono tracking-wider uppercase font-bold">{t.processing}</span>
                        </div>
                    )}
                    <span className="text-[9px] text-neutral-500 font-mono">v1.0</span>
                </div>
            </div>

            {/* Chat Messages Log with custom scroll styling */}
            <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scrollbar-track-transparent"
            >
                {chat.length === 0 ? (
                    <div className="space-y-5 animate-in fade-in duration-500 py-2">
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl shadow-lg space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-extrabold tracking-widest text-sky-400 uppercase">{t.assistantTitle}</span>
                            </div>
                            <p className="text-[12px] text-neutral-300 leading-relaxed">
                                {t.welcomeMessage || t.assistantIntro}
                            </p>
                        </div>

                        <div className="space-y-2.5">
                            <div className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">{t.quickStart}</div>
                            <div className="grid gap-2">
                                {t.quickPrompts.map((text, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => setInput(text)}
                                        type="button"
                                        className="w-full text-left p-3 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-sky-400/40 rounded-xl transition-all duration-300 cursor-pointer text-xs text-neutral-300 hover:text-white backdrop-blur-md shadow-sm"
                                    >
                                        {text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {chat.map((msg, index) => {
                            if (msg.role === 'user') {
                                return (
                                    <div key={index} className="flex justify-end animate-in fade-in duration-200">
                                        <div className="max-w-[88%] p-3.5 rounded-2xl bg-white/[0.08] border border-white/10 text-white text-[13px] leading-relaxed shadow-md backdrop-blur-md">
                                            {msg.text}
                                        </div>
                                    </div>
                                );
                            }

                            if (msg.role === 'ai') {
                                // Attach preceding reasoning (since last user) as a collapsible chain
                                let attachedThoughts: ReturnType<typeof thoughtsFromReasoningMsg> = [];
                                for (let i = index - 1; i >= 0; i--) {
                                    if (chat[i].role === 'user') break;
                                    if (chat[i].role === 'reasoning') {
                                        attachedThoughts = [
                                            ...thoughtsFromReasoningMsg(chat[i]),
                                            ...attachedThoughts,
                                        ];
                                    }
                                }
                                // Prefer thoughts stored on the AI message itself (after merge)
                                if (msg.thoughts?.length) {
                                    attachedThoughts = msg.thoughts;
                                }

                                return (
                                    <div key={index} className="space-y-2.5 animate-in fade-in duration-300 w-full">
                                        {attachedThoughts.length > 0 && (
                                            <AgentReasoning
                                                thoughts={attachedThoughts}
                                                live={false}
                                                defaultOpen={false}
                                            />
                                        )}

                                        {msg.text && (
                                            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl shadow-xl space-y-3">
                                                <div className="text-[13px] text-neutral-200 leading-relaxed whitespace-pre-wrap">
                                                    {formatCleanText(msg.text)}
                                                </div>

                                                {msg.variants && msg.variants.length > 0 && (
                                                    <div className="mt-3 space-y-2 border-t border-white/5 pt-2.5 w-full">
                                                        <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">Варианты действий:</div>
                                                        <div className="grid gap-2">
                                                            {msg.variants.map((v: any, vi: number) => (
                                                                <button
                                                                    key={vi}
                                                                    type="button"
                                                                    onClick={() => handleSend(typeof v === 'string' ? v : (v.label || v.text || JSON.stringify(v)))}
                                                                    className="w-full text-left p-2.5 bg-white/[0.03] hover:bg-sky-500/10 border border-white/[0.06] hover:border-sky-400/40 rounded-xl transition-all text-xs text-neutral-300 hover:text-white cursor-pointer"
                                                                >
                                                                    {typeof v === 'string' ? v : (v.label || v.text || 'Вариант')}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            if (msg.role === 'system') {
                                return (
                                    <div key={index} className="flex justify-center animate-in fade-in duration-200">
                                        <div className="max-w-[95%] px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-neutral-400 text-[11px] text-center">
                                            {msg.text}
                                        </div>
                                    </div>
                                );
                            }

                            if (msg.role === 'reasoning') {
                                // Hide once a final AI reply exists after this block — chain moves into dropdown
                                const hasAiAfter = chat.slice(index + 1).some(
                                    (m) => m.role === 'ai' && (m.text || '').trim().length > 0
                                );
                                if (hasAiAfter) return null;

                                const thoughts = thoughtsFromReasoningMsg(msg);
                                if (!thoughts.length) {
                                    // Soft placeholder while waiting for first human thought
                                    if (isProcessing || isAgentTyping) {
                                        return (
                                            <AgentReasoning
                                                key={index}
                                                thoughts={[{ text: 'Thinking… разбираю ваш запрос', status: 'running', phase: 'think' }]}
                                                live
                                            />
                                        );
                                    }
                                    return null;
                                }
                                return (
                                    <AgentReasoning
                                        key={index}
                                        thoughts={thoughts}
                                        live={isProcessing || isAgentTyping}
                                    />
                                );
                            }

                            return null;
                        })}

                        {!chat.some((m) => m.role === 'user') && (
                            <div className="space-y-2.5 pt-1">
                                <div className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">{t.quickStart}</div>
                                <div className="grid gap-2">
                                    {t.quickPrompts.map((text, i) => (
                                        <button 
                                            key={i} 
                                            onClick={() => setInput(text)}
                                            type="button"
                                            className="w-full text-left p-3 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-sky-400/40 rounded-xl transition-all duration-300 cursor-pointer text-xs text-neutral-300 hover:text-white backdrop-blur-md shadow-sm"
                                        >
                                            {text}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isAgentTyping && (
                            <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl w-fit">
                                <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        )}
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>


            {/* Floating Scroll-to-Bottom Button */}
            {showScrollBottom && (
                <button
                    onClick={() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    type="button"
                    className="absolute bottom-24 right-5 p-2.5 rounded-full bg-neutral-900/90 border border-white/10 text-white shadow-2xl hover:bg-neutral-800 transition-all z-20 animate-in fade-in zoom-in-95 cursor-pointer backdrop-blur-xl"
                >
                    <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7-7-7" />
                    </svg>
                </button>
            )}

            {/* GlassMorphic Input Bar */}
            <div className="p-4 bg-black/20 backdrop-blur-xl border-t border-white/[0.08] shrink-0">
                <form onSubmit={onSubmit} className="relative flex flex-col bg-[#161618]/90 border border-white/10 focus-within:border-sky-400/50 rounded-2xl p-3.5 shadow-2xl transition-all duration-300 backdrop-blur-2xl">
                    {focusedItem && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-[10px] text-neutral-300 w-fit mb-2.5">
                            <span className="max-w-[150px] truncate">{focusedItem.name || t.selectedClip}</span>
                            <button onClick={onClearFocus} type="button" className="hover:text-white cursor-pointer">✕</button>
                        </div>
                    )}

                    <textarea 
                        ref={textareaRef}
                        placeholder={t.inputPlaceholder}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                onSubmit(e);
                            }
                        }}
                        disabled={isProcessing}
                        rows={1}
                        className="w-full bg-transparent resize-none text-[13px] text-white placeholder-neutral-500 focus:outline-none leading-relaxed overflow-y-auto max-h-[220px] scrollbar-thin scrollbar-thumb-white/10"
                    />

                    <div className="flex items-center justify-between mt-2.5 shrink-0">
                        <div className="flex items-center gap-2 text-neutral-400">
                            <button 
                                type="button" 
                                onClick={onToggleFocusSelection}
                                className={`p-1 rounded transition-colors cursor-pointer ${isFocusSelectionActive ? 'text-primary' : 'hover:text-white'}`}
                                title="Выбрать клип"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            {isAgentTyping ? (
                                <button 
                                    type="button"
                                    onClick={onStopAgent}
                                    className="w-7 h-7 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg animate-pulse"
                                    title="Остановить"
                                >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                        <rect x="4" y="4" width="16" height="16" rx="2" />
                                    </svg>
                                </button>
                            ) : (
                                <button 
                                    type="submit"
                                    disabled={!input.trim() || isProcessing}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg
                                        ${input.trim() && !isProcessing 
                                            ? "bg-primary text-black hover:scale-105" 
                                            : "bg-white/5 text-neutral-600 cursor-not-allowed"}`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
