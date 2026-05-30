"use client";

import { use, useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TimelineEditor from "@/components/TimelineEditor";
import VideoTimeline from "@/components/VideoTimeline";
import ExportModal from "@/components/ExportModal";
import ChatSidebar from "@/components/ChatSidebar";
import ReferencesSidebar from "@/components/ReferencesSidebar";
import SandboxPlayer from "@/components/SandboxPlayer";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const { id } = resolvedParams;
    const searchParams = useSearchParams();
    const filenameParam = searchParams.get('filename');
    const [filename, setFilename] = useState<string | null>(null);
    const router = useRouter();

    // Sync filename state with URL param and localStorage to survive page reloads
    useEffect(() => {
        if (!id) return;
        if (filenameParam) {
            setFilename(filenameParam);
            localStorage.setItem(`filename_${id}`, filenameParam);
        } else {
            const saved = localStorage.getItem(`filename_${id}`);
            if (saved) {
                setFilename(saved);
            }
        }
    }, [id, filenameParam]);

    const [message, setMessage] = useState("");
    const [fontStyle, setFontStyle] = useState("Arial");
    const [fontSize, setFontSize] = useState(100);
    const [fontColor, setFontColor] = useState("White");
    const [useOutline, setUseOutline] = useState(true);
    const [chat, setChat] = useState<{ role: string, text?: string, steps?: any[], variants?: any[] }[]>([]);
    const [transcript, setTranscript] = useState<any>(null);
    const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [hasInitialized, setHasInitialized] = useState(false);
    const [activeEdits, setActiveEdits] = useState<any[]>([]);
    const [multiTrackEdl, setMultiTrackEdl] = useState<{v1: {start: number, end: number}[], a1: {start: number, end: number}[]} | null>(null);
    const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
    const [activeTab, setActiveTab] = useState<'text' | 'video'>('text');
    const [showReferences, setShowReferences] = useState(true);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const hyperframesEdits = activeEdits.filter(e => e.action === 'canvas_overlay' || e.action === 'hyperframes_html' || e.action === 'add_hyperframes_graphics');
    
    const isLoadedRef = useRef(false);

    // Load from localStorage on mount
    useEffect(() => {
        if (!id) return;
        try {
            const savedChat = localStorage.getItem(`chat_${id}`);
            const savedEdits = localStorage.getItem(`activeEdits_${id}`);
            const savedEdl = localStorage.getItem(`multiTrackEdl_${id}`);
            const savedInit = localStorage.getItem(`hasInitialized_${id}`);

            if (savedChat) setChat(JSON.parse(savedChat));
            if (savedEdits) setActiveEdits(JSON.parse(savedEdits));
            if (savedEdl) setMultiTrackEdl(JSON.parse(savedEdl));
            if (savedInit) setHasInitialized(JSON.parse(savedInit));
        } catch (e) {
            console.error("Failed to load state from localStorage:", e);
        } finally {
            isLoadedRef.current = true;
        }
    }, [id]);

    // Save to localStorage when state changes
    useEffect(() => {
        if (!id || !isLoadedRef.current) return;
        localStorage.setItem(`chat_${id}`, JSON.stringify(chat));
    }, [id, chat]);

    useEffect(() => {
        if (!id || !isLoadedRef.current) return;
        localStorage.setItem(`activeEdits_${id}`, JSON.stringify(activeEdits));
    }, [id, activeEdits]);

    useEffect(() => {
        if (!id || !isLoadedRef.current) return;
        localStorage.setItem(`multiTrackEdl_${id}`, JSON.stringify(multiTrackEdl));
    }, [id, multiTrackEdl]);

    useEffect(() => {
        if (!id || !isLoadedRef.current) return;
        localStorage.setItem(`hasInitialized_${id}`, JSON.stringify(hasInitialized));
    }, [id, hasInitialized]);

    // Map abstract add_subtitles edits into word-by-word text overlays using transcript
    const activeEditsWithSubtitles = useMemo(() => {
        let result = [...activeEdits];
        const subEdit = activeEdits.find(e => e.action === 'add_subtitles');
        if (subEdit && transcript?.words) {
            const overlays = transcript.words.map((w: any) => ({
                action: 'add_text_overlay',
                text: w.word,
                start: w.start,
                end: w.end,
                fontsize: subEdit.font_size || 80,
                color: subEdit.font_color || "white",
                use_outline: subEdit.use_outline !== false
            }));
            result = [...result, ...overlays];
        }
        return result;
    }, [activeEdits, transcript]);

    const graphicsHtml = hyperframesEdits.length > 0 ? `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; }
      .clip { position: absolute; }
      #preview-container { width: 1080px; height: 1920px; position: relative; transform-origin: center center; background: transparent; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="preview-container">
      ${hyperframesEdits.map(e => e.html_content).join('\\n')}
    </div>
    <script>
      function resize() {
        const container = document.getElementById('preview-container');
        const scale = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
        container.style.transform = \`scale(\${scale})\`;
      }
      window.addEventListener('resize', resize);
      resize();
      let isSynced = false;
      window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'sync_time') {
              isSynced = true;
              if (window.__timelines && window.__timelines["main"]) {
                  window.__timelines["main"].pause();
                  window.__timelines["main"].seek(event.data.time);
              }
          }
      });
      setTimeout(() => {
        if (!isSynced && window.__timelines && window.__timelines["main"]) {
           const tl = window.__timelines["main"];
           const clips = Array.from(document.querySelectorAll('.clip'));
           if (clips.length > 0) {
               let minStart = Math.min(...clips.map(c => parseFloat(c.getAttribute('data-start') || 0)));
               let maxEnd = Math.max(...clips.map(c => parseFloat(c.getAttribute('data-start') || 0) + parseFloat(c.getAttribute('data-duration') || 0)));
               tl.seek(minStart).play();
               setInterval(() => {
                   if (tl.time() > maxEnd + 0.5) { tl.seek(minStart).play(); }
               }, 100);
           }
        }
      }, 500);
    </script>
  </body>
</html>
` : undefined;

    // Template states
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>("");
    const [showTemplatesDrawer, setShowTemplatesDrawer] = useState<boolean>(false);
    
    // Process States
    const [isAgentTyping, setIsAgentTyping] = useState(false);
    const [isRendering, setIsRendering] = useState(false);
    const isProcessing = isAgentTyping;
    const isRenderingBackground = isRendering;
    const renderInProgressRef = useRef(false);
    const evaluationSentRef = useRef(false);
    const lastUserMessageRef = useRef('');

    // Resizable Timeline State
    const [timelineHeight, setTimelineHeight] = useState(250);
    const [isResizing, setIsResizing] = useState(false);
    
    // Derived Video URLs
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    const videoUrl = filename ? `${API_URL}/uploads/${filename}` : null;
    const currentVideo = videoUrl;

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const iframeOverlayRef = useRef<HTMLIFrameElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const playbackRAF = useRef<number | null>(null);

    // Continuous iframe sync
    useEffect(() => {
        let raf: number;
        const syncIframe = () => {
            if (videoRef.current && iframeOverlayRef.current?.contentWindow) {
                iframeOverlayRef.current.contentWindow.postMessage(
                    { type: 'sync_time', time: videoRef.current.currentTime }, '*'
                );
            }
            raf = requestAnimationFrame(syncIframe);
        };
        raf = requestAnimationFrame(syncIframe);
        return () => cancelAnimationFrame(raf);
    }, []);

    // Load templates
    useEffect(() => {
        fetch(`${API_URL}/api/templates`)
            .then(res => res.json())
            .then(data => setTemplates(data || []))
            .catch(err => console.error("Failed to load templates", err));
    }, []);

    // Audio waveform peaks with precise AudioContext lifecycle management (prevents Web Audio memory leaks)
    useEffect(() => {
        if (!currentVideo) return;
        let active = true;
        let audioCtx: AudioContext | null = null;
        const generatePeaks = async () => {
            try {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioCtx = new AudioContextClass();
                const response = await fetch(currentVideo);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                if (!active) {
                    await audioCtx.close();
                    return;
                }
                const channelData = audioBuffer.getChannelData(0);
                const peaks = [];
                const samples = 1000;
                const blockSize = Math.floor(channelData.length / samples);
                for (let i = 0; i < samples; i++) {
                    let blockStart = blockSize * i;
                    let sum = 0;
                    for (let j = 0; j < blockSize; j++) {
                        sum += Math.abs(channelData[blockStart + j]);
                    }
                    peaks.push(sum / blockSize);
                }
                const maxPeak = Math.max(...peaks);
                const normalizedPeaks = peaks.map(p => (p / maxPeak) * 100);
                if (active) {
                    setAudioPeaks(normalizedPeaks);
                }
            } catch (error) {
                console.error("Failed to generate audio peaks:", error);
                if (active) {
                    setAudioPeaks(Array(100).fill(20));
                }
            } finally {
                if (audioCtx && audioCtx.state !== 'closed') {
                    await audioCtx.close();
                }
            }
        };
        generatePeaks();
        return () => {
            active = false;
            if (audioCtx && audioCtx.state !== 'closed') {
                audioCtx.close();
            }
        };
    }, [currentVideo]);

    // Multi-track EDL playback
    useEffect(() => {
        if (!isPlaying || !multiTrackEdl) return;
        const loop = () => {
            const vRef = videoRef.current;
            const aRef = audioRef.current;
            if (!vRef || !aRef) return;
            const vTime = vRef.currentTime;
            const validV1 = multiTrackEdl.v1.find(k => vTime >= k.start && vTime < k.end);
            if (!validV1) {
                const nextV1 = multiTrackEdl.v1.find(k => k.start >= vTime);
                if (nextV1) { vRef.currentTime = nextV1.start; }
                else { vRef.pause(); aRef.pause(); setIsPlaying(false); return; }
            }
            const validA1 = multiTrackEdl.a1.find(k => vTime >= k.start && vTime < k.end);
            if (!validA1) {
                aRef.muted = true;
            } else {
                aRef.muted = false;
                if (Math.abs(aRef.currentTime - vRef.currentTime) > 0.15) {
                    aRef.currentTime = vRef.currentTime;
                }
            }
            playbackRAF.current = requestAnimationFrame(loop);
        };
        playbackRAF.current = requestAnimationFrame(loop);
        return () => { if (playbackRAF.current) cancelAnimationFrame(playbackRAF.current); };
    }, [isPlaying, multiTrackEdl]);

    // Timeline resizing
    useEffect(() => {
        if (!isResizing) return;
        const handlePointerMove = (e: PointerEvent) => {
            const windowHeight = window.innerHeight;
            let newHeight = windowHeight - e.clientY - 24;
            newHeight = Math.max(150, Math.min(windowHeight * 0.7, newHeight));
            setTimelineHeight(newHeight);
        };
        const handlePointerUp = () => setIsResizing(false);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isResizing]);

    const duration = transcript?.words?.length ? transcript.words[transcript.words.length - 1].end + 0.5 : 0;

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Poll for logs
    useEffect(() => {
        if (!id) return;
        const fetchStatus = async () => {
            try {
                const res = await fetch(`${API_URL}/api/video/${id}/status`);
                const data = await res.json();
                if (data.logs) setLogs(data.logs);
            } catch (e) { }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, [id]);

    // Poll for transcript
    useEffect(() => {
        if (!id || transcript) return;
        const fetchTranscript = async () => {
            try {
                const res = await fetch(`${API_URL}/api/video/${id}/transcript`);
                const data = await res.json();
                if (data.status !== "processing") setTranscript(data);
            } catch (e) { }
        };
        fetchTranscript();
        const interval = setInterval(fetchTranscript, 3000);
        return () => clearInterval(interval);
    }, [id, transcript]);

    // Initial AI greeting
    useEffect(() => {
        if (!id || chat.length > 0 || hasInitialized || !transcript) return;
        setHasInitialized(true);
        handleSend("INIT_PLAN", true);
    }, [id, chat.length, hasInitialized, transcript]);

    const handleSend = async (customMessage?: string, isInitial: boolean = false, forceEdits?: any[]) => {
        const textToSend = customMessage || message;
        if (!textToSend.trim() && !forceEdits) return;

        if (!isInitial && textToSend !== "INIT_PLAN" && !textToSend.startsWith("SYSTEM_EVALUATION")) {
            setChat(prev => [...prev, { role: "user", text: textToSend }]);
            lastUserMessageRef.current = textToSend;
            if (!customMessage) setMessage("");
        }
        
        setTimeout(() => scrollToBottom(), 50);
        setIsAgentTyping(true);
        let willRender = false;

        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    file_id: id, 
                    message: textToSend, 
                    font: fontStyle,
                    font_size: fontSize,
                    font_color: fontColor,
                    use_outline: useOutline,
                    force_edits: forceEdits || null,
                    active_edits: activeEdits,
                    template_id: selectedTemplate || null
                })
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder("utf-8");

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n").filter(line => line.trim() !== "");
                    
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (data.type === "log") {
                                setLogs(prev => [...prev, data.message]);
                                setTimeout(() => scrollToBottom(), 50);
                            } else if (data.type === "reasoning") {
                                setChat(prev => {
                                    const copy = [...prev];
                                    const lastUserIdx = copy.map(m => m.role).lastIndexOf('user');
                                    const lastReasoningIdx = copy.map(m => m.role).lastIndexOf('reasoning');
                                    
                                    if (lastReasoningIdx !== -1 && lastReasoningIdx > lastUserIdx) {
                                        const target = copy[lastReasoningIdx];
                                        const newSteps = [...(target.steps || [])];
                                        const existing = newSteps.find(s => s.step === data.step);
                                        if (existing) { existing.status = data.status; }
                                        else { newSteps.push({ step: data.step, status: data.status }); }
                                        copy[lastReasoningIdx] = { ...target, steps: newSteps };
                                        return copy;
                                    } else {
                                        return [...copy, { role: "reasoning", steps: [{ step: data.step, status: data.status }] }];
                                    }
                                });
                                setTimeout(() => scrollToBottom(), 50);
                            } else if (data.type === "reasoning_event") {
                                setChat(prev => {
                                    const copy = [...prev];
                                    const lastUserIdx = copy.map(m => m.role).lastIndexOf('user');
                                    const lastReasoningIdx = copy.map(m => m.role).lastIndexOf('reasoning');
                                    
                                    const newStep = { 
                                        step: data.step, 
                                        status: data.status,
                                        agent: data.agent,
                                        details: data.details,
                                        progress: data.progress
                                    };
                                    
                                    if (lastReasoningIdx !== -1 && lastReasoningIdx > lastUserIdx) {
                                        const target = copy[lastReasoningIdx];
                                        const newSteps = [...(target.steps || [])];
                                        const existing = newSteps.find(s => s.step === data.step);
                                        if (existing) {
                                            existing.status = data.status;
                                            existing.details = data.details;
                                            existing.progress = data.progress;
                                            existing.agent = data.agent;
                                        } else { newSteps.push(newStep); }
                                        copy[lastReasoningIdx] = { ...target, steps: newSteps };
                                        return copy;
                                    } else {
                                        return [...copy, { role: "reasoning", steps: [newStep] }];
                                    }
                                });
                                setTimeout(() => scrollToBottom(), 50);
                            } else if (data.type === "content_chunk") {
                                if (data.content) {
                                    setChat(prev => {
                                        const copy = [...prev];
                                        const lastUserIdx = copy.map(m => m.role).lastIndexOf('user');
                                        const lastAiIdx = copy.map(m => m.role).lastIndexOf('ai');
                                        
                                        if (lastAiIdx !== -1 && lastAiIdx > lastUserIdx) {
                                            copy[lastAiIdx] = { 
                                                ...copy[lastAiIdx], 
                                                text: (copy[lastAiIdx].text || "") + data.content 
                                            };
                                            return copy;
                                        } else {
                                            return [...copy, { role: "ai", text: data.content, variants: [] }];
                                        }
                                    });
                                }
                                setTimeout(() => scrollToBottom(), 50);
                            } else if (data.type === "result") {
                                if (data.content && data.content.trim() !== "") {
                                    setChat(prev => {
                                        const copy = [...prev];
                                        const lastUserIdx = copy.map(m => m.role).lastIndexOf('user');
                                        const lastAiIdx = copy.map(m => m.role).lastIndexOf('ai');
                                        
                                        if (lastAiIdx !== -1 && lastAiIdx > lastUserIdx) {
                                            const existingText = copy[lastAiIdx].text || "";
                                            const newContent = data.content || "";
                                            const isGeneric = ["готово", "готово.", "done", "done.", "ready", "ready."].includes(newContent.trim().toLowerCase());
                                            const finalSelection = (existingText.trim() && (isGeneric || newContent.trim().length < existingText.trim().length * 0.5)) 
                                                ? existingText 
                                                : (newContent || existingText);

                                            copy[lastAiIdx] = { 
                                                ...copy[lastAiIdx], 
                                                text: finalSelection, 
                                                variants: data.variants || [] 
                                            };
                                            return copy;
                                        } else {
                                            return [...copy, { role: "ai", text: data.content, variants: data.variants || [] }];
                                        }
                                    });
                                }
                                if (data.edits && data.edits.length > 0) {
                                    setActiveEdits((prev: any[]) => {
                                        const newActionTypes = new Set(data.edits.map((e: any) => e.action));
                                        const kept = prev.filter((e: any) => !newActionTypes.has(e.action));
                                        return [...kept, ...data.edits];
                                    });
                                    const dur = duration || 10000;
                                    const cuts = data.edits.filter((e: any) => e.action === "cut_out").sort((a: any, b: any) => a.start - b.start);
                                    if (cuts.length > 0) {
                                        let current = 0;
                                        const keeps = [];
                                        for (const cut of cuts) {
                                            if (cut.start > current) keeps.push({start: current, end: cut.start});
                                            current = Math.max(current, cut.end);
                                        }
                                        if (current < dur) keeps.push({start: current, end: dur});
                                        setMultiTrackEdl({ v1: keeps, a1: keeps });
                                    }
                                }
                                setTimeout(() => scrollToBottom(), 50);
                            } else if (data.type === "error") {
                                setChat(prev => [...prev, { role: "ai", text: "Error: " + data.message }]);
                            }
                        } catch (e) {
                            console.error("Failed to parse chunk:", line);
                        }
                    }
                }
            }
        } catch (error) {
            setChat(prev => [...prev, { role: "ai", text: "Connection error." }]);
        } finally {
            setIsAgentTyping(false);
        }
    };

    const handleDirectRender = async () => {
        try {
            setIsRendering(true);
            setChat((prev: any) => [...prev, { role: "system", text: `🎬 Launching render...` }]);
            await fetch(`${API_URL}/api/chat/render`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    file_id: id, font: fontStyle, font_size: fontSize, font_color: fontColor,
                    use_outline: useOutline, position: "center",
                    edits: activeEdits.length > 0 ? activeEdits : null,
                    edl: multiTrackEdl, template_id: selectedTemplate || null
                })
            });
        } catch (error) {
            setChat(prev => [...prev, { role: "system", text: "❌ Render error." }]);
        }
    };

    return (
        <div className="h-screen bg-background text-foreground flex flex-col font-mono overflow-hidden">
            {/* ── Frosted Glass Header ── */}
            <header
                className="h-[48px] flex items-center px-5 justify-between z-20 shrink-0 select-none"
                style={{ background: "rgba(11,11,15,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                            <path d="M6 8.5C6 7.12 7.12 6 8.5 6H15.5C16.88 6 18 7.12 18 8.5C18 9.88 16.88 11 15.5 11H8.5C7.12 11 6 12.12 6 13.5C6 14.88 7.12 16 8.5 16H15.5C16.88 16 18 14.88 18 13.5" stroke="rgba(59,130,246,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: "#9AA4B2" }}>Synapix Studio</span>
                    {filename && (
                        <span className="text-[10px] font-mono ml-1 truncate max-w-[200px]" style={{ color: "#3A4151" }}>
                            · {filename}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full animate-breathe" style={{ background: "#3B82F6", display: "inline-block" }} />
                        <span className="text-[9px] font-mono" style={{ color: "#5A6478" }}>live</span>
                    </div>
                    <button
                        onClick={() => { window.location.href = '/'; }}
                        className="text-[11px] font-medium transition-colors cursor-pointer px-2 py-1 rounded-lg hover:text-white"
                        style={{ color: "#5A6478" }}
                    >
                        Home
                    </button>
                    <button
                        id="export-btn"
                        onClick={() => setShowExportModal(true)}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer select-none"
                        style={{
                            background: isExporting ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(124,58,237,0.15))",
                            border: isExporting ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(59,130,246,0.3)",
                            color: isExporting ? "#3A4151" : "#F5F7FA",
                        }}
                    >
                        {isExporting ? (
                            <>
                                <div className="w-3 h-3 rounded-full" style={{ border: "1.5px solid rgba(255,255,255,0.15)", borderTopColor: "#3B82F6", animation: "spin 0.9s linear infinite" }} />
                                <span>Exporting...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Export</span>
                            </>
                        )}
                    </button>
                </div>
            </header>

            {showExportModal && (
                <ExportModal
                    id={id as string}
                    API_URL={API_URL}
                    activeEdits={activeEdits}
                    multiTrackEdl={multiTrackEdl}
                    fontStyle={fontStyle}
                    fontSize={fontSize}
                    fontColor={fontColor}
                    useOutline={useOutline}
                    selectedTemplate={selectedTemplate}
                    onClose={() => setShowExportModal(false)}
                    onStatusChange={(status) => setIsExporting(status)}
                />
            )}

            <div className="flex-1 flex overflow-hidden">
                {/* 1. Chat Sidebar */}
                <ChatSidebar 
                    chat={chat} 
                    message={message} 
                    setMessage={setMessage} 
                    handleSend={handleSend} 
                    isProcessing={isProcessing} 
                    isAgentTyping={isAgentTyping} 
                    isRenderingBackground={isRenderingBackground} 
                    logs={logs} 
                    chatEndRef={chatEndRef} 
                />

                {/* 2. Center: Preview + Timeline */}
                <div className="flex-1 flex flex-col min-w-0" style={{ background: "#0B0B0F" }}>
                    {/* Video Preview */}
                    <div
                        className="flex-1 m-3 mb-1 overflow-hidden relative"
                        style={{
                            background: "#000",
                            borderRadius: "20px",
                            border: "1px solid rgba(255,255,255,0.06)",
                            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                        }}
                    >
                        <SandboxPlayer
                            videoSrc={currentVideo}
                            edits={activeEditsWithSubtitles}
                            edl={multiTrackEdl}
                            isPlaying={isPlaying}
                            onTogglePlay={() => {
                                if (videoRef.current) {
                                    if (isPlaying) {
                                        videoRef.current.pause();
                                        audioRef.current?.pause();
                                    } else {
                                        videoRef.current.play();
                                        audioRef.current?.play();
                                    }
                                }
                                setIsPlaying(!isPlaying);
                            }}
                            onTimeUpdate={(t: number) => {
                                if (videoRef.current && Math.abs(videoRef.current.currentTime - t) > 0.5) {
                                    videoRef.current.currentTime = t;
                                }
                            }}
                            duration={duration}
                        />
                    </div>

                    {/* Resizer pill */}
                    <div
                        className="h-4 w-full cursor-row-resize flex items-center justify-center group relative z-50"
                        onPointerDown={(e) => { e.preventDefault(); setIsResizing(true); }}
                    >
                        <div
                            className="w-8 h-1 rounded-full transition-all duration-200"
                            style={{ background: isResizing ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.08)" }}
                        />
                        {isResizing && <div className="fixed inset-0 cursor-row-resize z-[100]" />}
                    </div>

                    {/* Timeline Panel */}
                    <div
                        className="flex-shrink-0 flex flex-col overflow-hidden relative mx-3 mb-3"
                        style={{
                            height: timelineHeight,
                            background: "#111318",
                            borderRadius: "20px",
                            border: "1px solid rgba(255,255,255,0.06)",
                        }}
                    >
                        {/* Timeline toolbar */}
                        <div
                            className="h-11 flex items-center px-4 justify-between shrink-0"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                        >
                            <div className="flex gap-1 items-center">
                                {(['text', 'video'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className="px-3 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer"
                                        style={{
                                            background: activeTab === tab ? "rgba(59,130,246,0.12)" : "transparent",
                                            color: activeTab === tab ? "rgba(59,130,246,0.9)" : "#3A4151",
                                            border: activeTab === tab ? "1px solid rgba(59,130,246,0.2)" : "1px solid transparent",
                                        }}
                                    >
                                        {tab === 'text' ? 'Text Timeline' : 'Track Timeline'}
                                    </button>
                                ))}
                            </div>
                            {activeTab === 'text' && (
                                <button
                                    onClick={handleDirectRender}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium transition-all cursor-pointer"
                                    style={{
                                        background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        color: "#9AA4B2",
                                    }}
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                    </svg>
                                    <span>Render</span>
                                </button>
                            )}
                        </div>

                        <div className="flex-1 p-2 overflow-hidden">
                            {activeTab === 'text' ? (
                                <TimelineEditor 
                                    transcript={transcript} 
                                    activeEdits={activeEdits} 
                                    onEditsChange={setActiveEdits} 
                                />
                            ) : (
                                <VideoTimeline 
                                    duration={duration}
                                    activeEdits={activeEdits}
                                    multiTrackEdl={multiTrackEdl || { v1: [{start: 0, end: duration}], a1: [{start: 0, end: duration}] }}
                                    audioPeaks={audioPeaks}
                                    videoRef={videoRef}
                                    audioRef={audioRef}
                                    isPlaying={isPlaying}
                                    onTogglePlay={() => {
                                        if (!videoRef.current) return;
                                        if (isPlaying) {
                                            videoRef.current.pause();
                                            audioRef.current?.pause();
                                            setIsPlaying(false);
                                        } else {
                                            videoRef.current.play();
                                            audioRef.current?.play();
                                            setIsPlaying(true);
                                        }
                                    }}
                                    onEdlChange={(newEdl: any) => setMultiTrackEdl(newEdl)}
                                    onActiveEditsChange={(newEdits: any) => setActiveEdits(newEdits)}
                                    transcript={transcript}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. Right Sidebar */}
                <div className={`transition-all duration-300 ease-in-out flex shrink-0 ${showReferences ? 'w-[320px] border-l border-white/5' : 'w-0 overflow-hidden border-none'}`}>
                    <ReferencesSidebar 
                        activeEdits={activeEdits} 
                        onActiveEditsChange={setActiveEdits} 
                        duration={duration} 
                        onClose={() => setShowReferences(false)}
                    />
                </div>
            </div>

            {!showReferences && (
                <button
                    onClick={() => setShowReferences(true)}
                    className="fixed right-4 top-20 z-50 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-[0_4px_25px_rgba(0,0,0,0.45)] hover:scale-105 active:scale-95 cursor-pointer bg-black/60"
                    style={{
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: "rgba(255, 255, 255, 0.7)",
                    }}
                    title="Show library"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            )}
        </div>
    );
}
