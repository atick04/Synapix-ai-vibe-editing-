"use client";

import { use, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getApiUrl } from "@/utils/api";
import { useRouter, useSearchParams } from "next/navigation";
import TimelineEditor from "@/components/TimelineEditor";
import VideoTimeline from "@/components/VideoTimeline";
import ExportModal from "@/components/ExportModal";
import ChatSidebar from "@/components/ChatSidebar";
import ReferencesSidebar from "@/components/ReferencesSidebar";
import SandboxPlayer from "@/components/SandboxPlayer";
import AccessKeyModal from "@/components/AccessKeyModal";
import MaskingSidebar from "@/components/MaskingSidebar";
import TextSidebar from "@/components/TextSidebar";
import GraphicsSidebar from "@/components/GraphicsSidebar";
import MusicSidebar from "@/components/MusicSidebar";
import TransitionsSidebar from "@/components/TransitionsSidebar";
import { VibeProvider } from "@/context/VibeContext";
import { useLanguage } from "@/context/LanguageContext";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const { id } = resolvedParams;
    const { t } = useLanguage();
    const searchParams = useSearchParams();
    const filenameParam = searchParams.get('filename');
    const [filename, setFilename] = useState<string | null>(null);
    const router = useRouter();

    // Sync filename state with URL param and localStorage to survive page reloads
    useEffect(() => {
        if (!id) return;
        localStorage.setItem('last_project_id', id);
        if (filenameParam) {
            let fn = filenameParam;
            const ext = fn.split('.').pop()?.toLowerCase();
            if (ext && ['mov', 'avi', 'mkv'].includes(ext)) {
                fn = fn.substring(0, fn.lastIndexOf('.')) + '.mp4';
            }
            setFilename(fn);
            localStorage.setItem(`filename_${id}`, fn);
            if (!fn.includes('_rendered') && !fn.includes('_rvm_preview')) {
                localStorage.setItem(`original_filename_${id}`, fn);
            }
        } else {
            const saved = localStorage.getItem(`filename_${id}`);
            if (saved) {
                let fn = saved;
                const ext = fn.split('.').pop()?.toLowerCase();
                if (ext && ['mov', 'avi', 'mkv'].includes(ext)) {
                    fn = fn.substring(0, fn.lastIndexOf('.')) + '.mp4';
                }
                setFilename(fn);
            }
        }
    }, [id, filenameParam]);

    const API_URL = getApiUrl();
    const [message, setMessage] = useState("");
    const [fontStyle, setFontStyle] = useState("Arial");
    const [fontSize, setFontSize] = useState(100);
    const [fontColor, setFontColor] = useState("White");
    const [useOutline, setUseOutline] = useState(true);
    const [chat, setChat] = useState<{ role: string, text?: string, steps?: any[], variants?: any[], thoughts?: any[] }[]>([]);
    const [transcript, setTranscript] = useState<any>(null);
    const [mediaLibrary, setMediaLibrary] = useState<any[]>([]);

    const mainVideoDuration = useMemo(() => {
        return transcript?.words?.length ? transcript.words[transcript.words.length - 1].end + 0.5 : 0;
    }, [transcript]);

    const [multiTrackEdl, setMultiTrackEdl] = useState<{v1: {start: number, end: number}[], a1: {start: number, end: number}[]} | null>(null);

    const timelineDuration = useMemo(() => {
        if (!multiTrackEdl || !multiTrackEdl.v1 || multiTrackEdl.v1.length === 0) {
            return mainVideoDuration || 10;
        }
        return multiTrackEdl.v1.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    }, [multiTrackEdl, mainVideoDuration]);

    const duration = timelineDuration;
    const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [hasInitialized, setHasInitialized] = useState(false);
    const [activeEdits, setActiveEdits] = useState<any[]>([]);
    const activeVibeConfig = useMemo(() => {
        const vibeEdit = activeEdits.find(e => e.action === 'set_vibe_config');
        return vibeEdit?.vibe_config || null;
    }, [activeEdits]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const historyRef = useRef<{ activeEdits: any[]; multiTrackEdl: any }[]>([]);
    const historyIndexRef = useRef<number>(-1);
    const isUndoingRedoingRef = useRef<boolean>(false);
    const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
    const [activeTab, setActiveTab] = useState<'text' | 'video'>('text');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isMaskingOpen, setIsMaskingOpen] = useState(false);
    const [isTextOpen, setIsTextOpen] = useState(false);
    const [isGraphicsOpen, setIsGraphicsOpen] = useState(false);
    const [isMusicOpen, setIsMusicOpen] = useState(false);
    const [isTransitionsOpen, setIsTransitionsOpen] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const hyperframesEdits = activeEdits.filter(e => e.action === 'canvas_overlay' || e.action === 'hyperframes_html' || e.action === 'add_hyperframes_graphics');

    // Access key auth
    const [accessKeyReady, setAccessKeyReady] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [accessLogin, setAccessLogin] = useState('');
    const [accessKey, setAccessKey] = useState('');
    const [accessKeyError, setAccessKeyError] = useState('');

    useEffect(() => {
        setIsMounted(true);
        const savedKey = localStorage.getItem('vibe_access_key');
        const savedLogin = localStorage.getItem('vibe_user_login');
        if (savedKey) {
            setAccessKeyReady(true);
        }
        if (savedKey && savedLogin) {
            setAccessKey(savedKey);
            setAccessLogin(savedLogin);
            
            // Validate key immediately on mount
            const validateOnMount = async () => {
                try {
                    const res = await fetch(`${API_URL}/api/admin/validate-key?key=${encodeURIComponent(savedKey)}&login=${encodeURIComponent(savedLogin)}`);
                    const data = await res.json();
                    if (data.valid) {
                        setAccessKeyReady(true);
                    } else {
                        handleAuthError(data.reason || 'access_key_invalid');
                    }
                } catch (err) {
                    setAccessKeyReady(true);
                }
            };
            validateOnMount();
        }
    }, [API_URL]);

    const handleAccessKeySuccess = (login: string, key: string) => {
        setAccessLogin(login);
        setAccessKey(key);
        setAccessKeyError('');
        setAccessKeyReady(true);
    };

    const handleAuthError = (detail: string) => {
        localStorage.removeItem('vibe_access_key');
        localStorage.removeItem('vibe_user_login');
        
        const reasons: Record<string, string> = {
            access_key_required: 'Доступ отклонен: Требуется ключ доступа.',
            access_key_invalid: 'Доступ отклонен: Неверный ключ или логин.',
            access_key_expired: 'Доступ отклонен: Срок действия ключа истёк.',
            access_key_revoked: 'Доступ отклонен: Ключ был отозван администратором.',
            access_key_limit_reached: 'Доступ отклонен: Исчерпан лимит токенов.',
        };
        
        const errorMsg = reasons[detail] || 'Доступ отклонен. Проверьте данные для входа.';
        setAccessKeyError(errorMsg);
        setAccessKeyReady(false);
    };

    // Periodic check to detect token expiration while the editor is open
    useEffect(() => {
        if (!accessKeyReady) return;
        const interval = setInterval(async () => {
            const savedKey = localStorage.getItem('vibe_access_key');
            const savedLogin = localStorage.getItem('vibe_user_login');
            if (savedKey && savedLogin) {
                try {
                    const res = await fetch(`${API_URL}/api/admin/validate-key?key=${encodeURIComponent(savedKey)}&login=${encodeURIComponent(savedLogin)}`);
                    const data = await res.json();
                    if (!data.valid) {
                        handleAuthError(data.reason || 'access_key_invalid');
                    }
                } catch (err) {
                    // Ignore network error to avoid false positives
                }
            }
        }, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, [accessKeyReady, API_URL]);
    
    // Manual Format Control
    const [targetFormat, setTargetFormat] = useState<'auto' | '16:9' | '9:16'>('auto');

    // Brand custom assets
    const [brandId, setBrandId] = useState<string>("default");
    const [brandAssets, setBrandAssets] = useState<{ fonts: any[]; luts: any[]; music?: any[] }>({ fonts: [], luts: [], music: [] });
    const handleBrandAssetsChange = useCallback((id: string, assets: any) => {
        setBrandId(id);
        setBrandAssets(assets);
    }, []);

    // Focus / Context Selection
    const [focusedClipId, setFocusedClipId] = useState<string | null>(null);
    const [selectedSubIndices, setSelectedSubIndices] = useState<number[]>([]);
    const [isFocusSelectionActive, setIsFocusSelectionActive] = useState(false);
    const [draggingAssetType, setDraggingAssetType] = useState<string | null>(null);

    useEffect(() => {
        if (focusedClipId && focusedClipId.startsWith('T1-Sub-')) {
            const idx = parseInt(focusedClipId.replace('T1-Sub-', ''), 10);
            if (!selectedSubIndices.includes(idx)) {
                setSelectedSubIndices([idx]);
            }
        } else if (!focusedClipId || !focusedClipId.startsWith('T1-Sub-')) {
            setSelectedSubIndices([]);
        }
    }, [focusedClipId]);
    
    const subtitleChunks = useMemo(() => {
        if (!transcript?.words) return [];
        const cuts = activeEdits.filter(e => e.action === 'cut_out');
        const sortedCuts = [...cuts].sort((a, b) => (a.start || 0) - (b.start || 0));
        const inCut = (start: number, end: number) => {
            return sortedCuts.some(c => start < (c.end || 0) && end > (c.start || 0));
        };

        // Respect max_words from the AI's build_kinetic_typography tool call
        const subEdit = activeEdits.find(e => e.action === 'add_subtitles');
        const maxWordsPerChunk = (subEdit as any)?.max_words || 3;

        const chunks: any[] = [];
        let curChunk: any[] = [];
        transcript.words.forEach((w: any) => {
            if (inCut(w.start, w.end)) {
                if (curChunk.length > 0) {
                    chunks.push(curChunk);
                    curChunk = [];
                }
                return;
            }
            curChunk.push(w);
            if (curChunk.length === maxWordsPerChunk) {
                chunks.push(curChunk);
                curChunk = [];
            }
        });
        if (curChunk.length > 0) {
            chunks.push(curChunk);
        }

        return chunks.map((chunk, index) => {
            const rawStart = chunk[0].start;
            const rawEnd = chunk[chunk.length - 1].end;
            return {
                index,
                start: rawStart,
                end: rawEnd,
                words: chunk
            };
        });
    }, [transcript, activeEdits]);


    const focusedItem = useMemo(() => {
        if (!focusedClipId) return null;

        // 1. V2-Broll-
        if (focusedClipId.startsWith("V2-Broll-")) {
            const brollIdx = parseInt(focusedClipId.replace("V2-Broll-", ""), 10);
            const brolls = activeEdits.filter(e => e.action === 'add_broll');
            const target = brolls[brollIdx];
            if (target) {
                return {
                    id: focusedClipId,
                    type: 'broll',
                    label: `📹 B-Roll: "${(target.query || 'stock').toLowerCase()}"`,
                    start: target.start != null ? target.start : 0,
                    end: target.end != null ? target.end : duration,
                    editIndex: activeEdits.indexOf(target)
                };
            }
        }

        // 2. M1-Music-
        if (focusedClipId.startsWith("M1-Music-")) {
            const assetIdx = parseInt(focusedClipId.replace("M1-Music-", ""), 10);
            const target = activeEdits[assetIdx];
            if (target && target.action === 'add_asset') {
                return {
                    id: focusedClipId,
                    type: 'music',
                    label: `🎵 Music: "${(target.query || target.asset_query || 'music').toLowerCase()}"`,
                    start: target.start != null ? target.start : 0,
                    end: target.end != null ? target.end : duration,
                    editIndex: assetIdx
                };
            }
        }

        // 3. SFX-Asset-
        if (focusedClipId.startsWith("SFX-Asset-")) {
            const assetIdx = parseInt(focusedClipId.replace("SFX-Asset-", ""), 10);
            const target = activeEdits[assetIdx];
            if (target && target.action === 'add_asset') {
                return {
                    id: focusedClipId,
                    type: 'sfx',
                    label: `🔊 SFX: "${(target.query || target.asset_query || 'asset').toLowerCase()}"`,
                    start: target.start != null ? target.start : 0,
                    end: target.end != null ? target.end : (target.start != null ? target.start + 2 : 2),
                    editIndex: assetIdx
                };
            }
        }

        // 4. S1-Scene-
        if (focusedClipId.startsWith("S1-Scene-")) {
            const editIdx = parseInt(focusedClipId.replace("S1-Scene-", ""), 10);
            const target = activeEdits[editIdx];
            if (target && (target.action === 'scene_override' || target.action === 'semantic_scene')) {
                return {
                    id: focusedClipId,
                    type: 'scene',
                    label: `🎬 Scene Override: "${(target.style || 'override').toLowerCase()}"`,
                    start: target.start != null ? target.start : 0,
                    end: target.end != null ? target.end : duration,
                    editIndex: editIdx
                };
            }
        }

        // 5. T1-Sub-
        if (focusedClipId.startsWith("T1-Sub-")) {
            const subIdx = parseInt(focusedClipId.replace("T1-Sub-", ""), 10);
            const chunk = subtitleChunks[subIdx];
            if (chunk) {
                const overrideEdits = activeEdits.filter(e => e.action === 'subtitle_override');
                const overrideForChunk = overrideEdits.find(e => e.chunk_index === subIdx);
                
                const spokenText = chunk.words.map((w: any) => w.word).join(' ');
                const label = overrideForChunk?.text || spokenText || 'subtitles';

                return {
                    id: focusedClipId,
                    type: 'subtitles',
                    label: `💬 Subtitle: "${label}"`,
                    start: chunk.start,
                    end: chunk.end,
                    subIdx: subIdx,
                    editIndex: overrideForChunk ? activeEdits.indexOf(overrideForChunk) : -1
                };
            }
        }

        // 6. G1-Graphic-
        if (focusedClipId.startsWith("G1-Graphic-")) {
            const parts = focusedClipId.split('-');
            const gIdx = parseInt(parts[parts.length - 1], 10);
            const graphicClips: any[] = [];
            activeEdits.forEach((e, idx) => {
                const isGraphic = e.action === "canvas_overlay" || e.action === "hyperframes_html" ||
                                  e.action === 'add_hyperframes_graphics' || e.action === 'add_motion_graphic' ||
                                  e.action === 'add_dynamic_graphic' || e.action === 'add_text_overlay';
                if (!isGraphic) return;
                let start = e.start != null ? e.start : 0;
                let end = e.end != null ? e.end : start + 3;
                let label = "graphics";
                if (e.action === 'add_motion_graphic') label = `motion (${e.style || 'style'})`;
                else if (e.action === 'add_dynamic_graphic') label = `dynamic (${e.elements?.length || 0} el)`;
                else if (e.action === 'add_text_overlay') label = `text: "${e.text || ''}"`;
                else if (e.action === 'add_hyperframes_graphics') label = "canvas graphic";
                else if (e.action === 'canvas_overlay' || e.action === 'hyperframes_html') {
                    label = e.style ? `graphics (${e.style})` : "graphics";
                }
                graphicClips.push({
                    start,
                    end,
                    id: e.id || `${e.action}-${idx}`,
                    label,
                    rawIndex: idx
                });
            });

            const targetClip = graphicClips[gIdx];
            if (targetClip) {
                return {
                    id: focusedClipId,
                    type: 'graphics',
                    label: `✨ Graphic: ${targetClip.label}`,
                    start: targetClip.start,
                    end: targetClip.end,
                    editIndex: targetClip.rawIndex
                };
            }
        }

        // 7. V1-Video-
        if (focusedClipId.startsWith("V1-Video-")) {
            const idx = parseInt(focusedClipId.replace("V1-Video-", ""), 10);
            if (multiTrackEdl && multiTrackEdl.v1 && multiTrackEdl.v1[idx]) {
                const clip = multiTrackEdl.v1[idx];
                return {
                    id: focusedClipId,
                    type: 'video',
                    label: `🎞️ Main Video Segment ${idx + 1}`,
                    start: clip.start,
                    end: clip.end,
                    editIndex: idx
                };
            }
        }

        // 8. A1-Audio-
        if (focusedClipId.startsWith("A1-Audio-")) {
            const idx = parseInt(focusedClipId.replace("A1-Audio-", ""), 10);
            if (multiTrackEdl && multiTrackEdl.a1 && multiTrackEdl.a1[idx]) {
                const clip = multiTrackEdl.a1[idx];
                return {
                    id: focusedClipId,
                    type: 'audio',
                    label: `🔊 Main Audio Segment ${idx + 1}`,
                    start: clip.start,
                    end: clip.end,
                    editIndex: idx
                };
            }
        }

        // 9. C1-Color-
        if (focusedClipId.startsWith("C1-Color-")) {
            const idx = parseInt(focusedClipId.replace("C1-Color-", ""), 10);
            const colors = activeEdits.filter(ae => ae.action === 'color_correction');
            const target = colors[idx];
            if (target) {
                return {
                    id: focusedClipId,
                    type: 'color',
                    label: `🎨 Цветокоррекция: пресет "${target.lut || 'cinema'}"`,
                    start: target.start != null ? target.start : 0,
                    end: target.end != null ? target.end : duration,
                    editIndex: activeEdits.indexOf(target)
                };
            }
        }

        return null;
    }, [focusedClipId, activeEdits, multiTrackEdl, transcript, duration, subtitleChunks]);

    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        if (!id) return;
        try {
            const savedChat = localStorage.getItem(`chat_${id}`);
            const savedEdits = localStorage.getItem(`activeEdits_${id}`);
            const savedEdl = localStorage.getItem(`multiTrackEdl_${id}`);
            const savedInit = localStorage.getItem(`hasInitialized_${id}`);

            if (savedChat) {
                const parsed = JSON.parse(savedChat);
                setChat(Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ role: "ai", text: t.welcomeMessage }]);
            } else {
                setChat([{ role: "ai", text: t.welcomeMessage }]);
            }
            if (savedEdits) setActiveEdits(JSON.parse(savedEdits));
            if (savedEdl) setMultiTrackEdl(JSON.parse(savedEdl));
            if (savedInit) setHasInitialized(JSON.parse(savedInit));
        } catch (e) {
            console.error("Failed to load state from localStorage:", e);
            setChat([{ role: "ai", text: t.welcomeMessage }]);
        } finally {
            setIsLoaded(true);
        }
    }, [id, t.welcomeMessage]);

    // Save to localStorage when state changes
    useEffect(() => {
        if (!id || !isLoaded) return;
        localStorage.setItem(`chat_${id}`, JSON.stringify(chat));
    }, [id, chat, isLoaded]);

    useEffect(() => {
        if (!id || !isLoaded) return;
        localStorage.setItem(`activeEdits_${id}`, JSON.stringify(activeEdits));
    }, [id, activeEdits, isLoaded]);

    useEffect(() => {
        if (!id || !isLoaded) return;
        localStorage.setItem(`multiTrackEdl_${id}`, JSON.stringify(multiTrackEdl));
    }, [id, multiTrackEdl, isLoaded]);

    useEffect(() => {
        if (!id || !isLoaded) return;
        localStorage.setItem(`hasInitialized_${id}`, JSON.stringify(hasInitialized));
    }, [id, hasInitialized, isLoaded]);

    // History callbacks
    const handleUndo = useCallback(() => {
        if (historyIndexRef.current > 0) {
            isUndoingRedoingRef.current = true;
            historyIndexRef.current -= 1;
            const entry = historyRef.current[historyIndexRef.current];
            setActiveEdits(entry.activeEdits);
            setMultiTrackEdl(entry.multiTrackEdl);
            setCanUndo(historyIndexRef.current > 0);
            setCanRedo(true);
        }
    }, []);

    const handleRedo = useCallback(() => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
            isUndoingRedoingRef.current = true;
            historyIndexRef.current += 1;
            const entry = historyRef.current[historyIndexRef.current];
            setActiveEdits(entry.activeEdits);
            setMultiTrackEdl(entry.multiTrackEdl);
            setCanUndo(true);
            setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
        }
    }, []);

    // Track state updates and push to history stack
    useEffect(() => {
        if (!isLoaded) return;
        if (isUndoingRedoingRef.current) {
            isUndoingRedoingRef.current = false;
            return;
        }

        const currentEntry = historyRef.current[historyIndexRef.current];
        if (currentEntry) {
            const editsChanged = JSON.stringify(currentEntry.activeEdits) !== JSON.stringify(activeEdits);
            const edlChanged = JSON.stringify(currentEntry.multiTrackEdl) !== JSON.stringify(multiTrackEdl);
            if (!editsChanged && !edlChanged) {
                return;
            }
        }

        const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        nextHistory.push({ activeEdits, multiTrackEdl });
        if (nextHistory.length > 50) {
            nextHistory.shift();
        }
        historyRef.current = nextHistory;
        historyIndexRef.current = nextHistory.length - 1;

        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(false);
    }, [activeEdits, multiTrackEdl, isLoaded]);

    // Handle global keyboard shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            const isCtrl = e.ctrlKey || e.metaKey;
            if (isCtrl) {
                if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        handleRedo();
                    } else {
                        handleUndo();
                    }
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    handleRedo();
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleUndo, handleRedo]);


    // Template states
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>("");
    const [showTemplatesDrawer, setShowTemplatesDrawer] = useState<boolean>(false);
    const templateParam = searchParams.get('template');

    useEffect(() => {
        if (templateParam) {
            setSelectedTemplate(templateParam);
        }
    }, [templateParam]);
    
    // Process States
    const [isAgentTyping, setIsAgentTyping] = useState(false);
    const [isRendering, setIsRendering] = useState(false);
    const isProcessing = isAgentTyping;
    const isRenderingBackground = isRendering;
    const renderInProgressRef = useRef(false);
    const evaluationSentRef = useRef(false);
    const lastUserMessageRef = useRef('');

    // Resizable Timeline State
    const [timelineHeight, setTimelineHeight] = useState(420);
    const [isResizing, setIsResizing] = useState(false);

    // Responsive Mobile Views State
    const [activeMobileTab, setActiveMobileTab] = useState<'chat' | 'editor' | 'library'>('editor');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        handleResize();
        window.addEventListener('resize', handleResize);

        const handleSelectFocus = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail) {
                setFocusedClipId(detail);
                setIsLibraryOpen(true);
            }
        };
        window.addEventListener('select_clip_focus', handleSelectFocus);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('select_clip_focus', handleSelectFocus);
        };
    }, []);

    // Map abstract add_subtitles edits into 3-word text overlays using transcript
    const activeEditsWithSubtitles = useMemo(() => {
        let result = [...activeEdits];
        if (transcript?.words) {
            const subEdit = activeEdits.find(e => e.action === 'add_subtitles');
            
            if (subEdit) {
                // Deduplicate: filter out any add_text_overlay in the original activeEdits that are part of transcript subtitles
                result = result.filter(e => {
                    if (e.action !== 'add_text_overlay') return true;
                    if (e.is_subtitle) return true;
                    const eStart = e.start ?? 0;
                    const eEnd = e.end ?? 0;
                    
                    // Find transcript words overlapping in time
                    const overlapping = transcript.words.filter((w: any) => 
                        Math.max(eStart, w.start) < Math.min(eEnd, w.end)
                    );
                    if (overlapping.length === 0) return true;
                    
                    // Check if text is similar
                    const wordsTxt = overlapping.map((w: any) => w.word.toLowerCase().trim()).join(' ');
                    const eTxt = (e.text || '').toLowerCase().trim();
                    const isMatch = wordsTxt.includes(eTxt) || eTxt.includes(wordsTxt);
                    return !isMatch;
                });

                const overrideEdits = activeEdits.filter(e => e.action === 'subtitle_override');
                const overlays: any[] = [];
                
                const activeTemplateObj = templates.find(t => t.id === selectedTemplate);
                
                subtitleChunks.forEach((chunk, i) => {
                    const overrideForChunk = overrideEdits.find(e => e.chunk_index === i);
                    
                    const templateFont = activeTemplateObj?.subtitles?.font_management?.base_sans_font;
                    const templateAccentFont = activeTemplateObj?.subtitles?.font_management?.accent_serif_font;
                    const templateColor = activeTemplateObj?.subtitles?.color_palette?.text_main;
                    const templateAccentColor = activeTemplateObj?.subtitles?.color_palette?.text_accent;
                    const templateFontSize = activeTemplateObj?.subtitles?.font_management?.font_size_px;
                    const templateUseShadow = activeTemplateObj?.subtitles?.layout?.use_shadow;
                    const templateShadowBlur = activeTemplateObj?.subtitles?.layout?.shadow_blur_px;
                    const templateTextCase = activeTemplateObj?.subtitles?.layout?.text_case;
                    const templateUseOutline = activeTemplateObj?.subtitles?.layout ? false : undefined;
                    
                    const userFont = subEdit?.font;
                    const userFontSize = subEdit?.font_size;
                    const userColor = subEdit?.font_color;
                    const userAccentColor = subEdit?.accent_color;
                    const userUseShadow = subEdit?.use_shadow;
                    const userShadowBlur = subEdit?.shadow_blur;
                    const userTextCase = subEdit?.text_case;
                    const userPosition = subEdit?.position;
                    const userX = subEdit?.x;
                    const userY = subEdit?.y;

                    const activeFont = overrideForChunk?.font || userFont || templateFont || "Montserrat-ExtraBold";
                    const activeFontSize = overrideForChunk?.font_size || userFontSize || templateFontSize || 80;
                    const activeColor = overrideForChunk?.font_color || userColor || templateColor || "#FFFFFF";
                    const activeAccentColor = userAccentColor || templateAccentColor || "#FACC15";
                    const activeUseShadow = userUseShadow !== undefined ? userUseShadow : (templateUseShadow !== undefined ? templateUseShadow : true);
                    const activeShadowBlur = userShadowBlur !== undefined ? userShadowBlur : (templateShadowBlur || 18);
                    const activeTextCase = userTextCase || templateTextCase || "UPPER";
                    const activePosition = overrideForChunk?.position || userPosition || "bottom";
                    const activeX = overrideForChunk?.x !== undefined ? overrideForChunk.x : userX;
                    const activeY = overrideForChunk?.y !== undefined ? overrideForChunk.y : userY;
                    const activeWidth = overrideForChunk?.width !== undefined ? overrideForChunk.width : subEdit?.width;
                    const activeHeight = overrideForChunk?.height !== undefined ? overrideForChunk.height : subEdit?.height;

                    const activeFontPairing = overrideForChunk?.font_pairing || subEdit?.font_pairing || templateAccentFont || "";
                    const activeWordStyles = overrideForChunk?.word_styles || subEdit?.word_styles || null;
                    const activeInactiveOpacity = overrideForChunk?.inactive_opacity !== undefined ? overrideForChunk?.inactive_opacity : subEdit?.inactive_opacity;
                    const activeActiveScale = overrideForChunk?.active_scale !== undefined ? overrideForChunk?.active_scale : subEdit?.active_scale;
                    const activeLetterSpacing = overrideForChunk?.letter_spacing !== undefined ? overrideForChunk?.letter_spacing : subEdit?.letter_spacing;
                    const activeLineSpacing = overrideForChunk?.line_spacing !== undefined ? overrideForChunk?.line_spacing : subEdit?.line_spacing;
                    const activeAnimation = overrideForChunk?.animation_style || subEdit?.animation_style || "pop";

                    if (overrideForChunk) {
                        if (overrideForChunk.deleted) return;
                        overlays.push({
                            action: 'add_text_overlay',
                            is_subtitle: true,
                            chunk_index: i,
                            text: overrideForChunk.text,
                            start: overrideForChunk.start != null ? overrideForChunk.start : chunk.start,
                            end: overrideForChunk.end != null ? overrideForChunk.end : chunk.end,
                            fontsize: activeFontSize,
                            color: activeColor,
                            font: activeFont,
                            accent_font: templateAccentFont || "",
                            accent_color: activeAccentColor,
                            use_shadow: activeUseShadow,
                            shadow_blur: activeShadowBlur,
                            text_case: activeTextCase,
                            position: activePosition,
                            x: activeX,
                            y: activeY,
                            width: activeWidth,
                            height: activeHeight,
                            use_outline: overrideForChunk.use_outline !== undefined 
                                ? overrideForChunk.use_outline 
                                : (templateUseOutline !== undefined ? templateUseOutline : (subEdit?.use_outline !== false)),
                            font_pairing: activeFontPairing,
                            word_styles: activeWordStyles,
                            inactive_opacity: activeInactiveOpacity,
                            active_scale: activeActiveScale,
                            letter_spacing: activeLetterSpacing,
                            line_spacing: activeLineSpacing,
                            animation_style: activeAnimation
                        });
                    } else {
                        const text = chunk.words.map((w: any) => w.word).join(' ');
                        overlays.push({
                            action: 'add_text_overlay',
                            is_subtitle: true,
                            chunk_index: i,
                            text: text,
                            start: chunk.start,
                            end: chunk.end,
                            fontsize: activeFontSize,
                            color: activeColor,
                            font: activeFont,
                            accent_font: templateAccentFont || "",
                            accent_color: activeAccentColor,
                            use_shadow: activeUseShadow,
                            shadow_blur: activeShadowBlur,
                            text_case: activeTextCase,
                            position: activePosition,
                            x: activeX,
                            y: activeY,
                            width: activeWidth,
                            height: activeHeight,
                            use_outline: templateUseOutline !== undefined ? templateUseOutline : (subEdit?.use_outline !== false),
                            font_pairing: activeFontPairing,
                            word_styles: activeWordStyles,
                            inactive_opacity: activeInactiveOpacity,
                            active_scale: activeActiveScale,
                            letter_spacing: activeLetterSpacing,
                            line_spacing: activeLineSpacing,
                            animation_style: activeAnimation
                        });
                    }
                });
                result = [...result, ...overlays];
            }
        }
        return result;
    }, [activeEdits, transcript, subtitleChunks, templates, selectedTemplate]);
 
    // ── Subtitle config for SandboxPlayer word-by-word renderer ─────
    const sandboxSubtitleConfig = useMemo(() => {
        const subEdit = activeEdits.find((e: any) => e.action === 'add_subtitles');
        if (!subEdit && !selectedTemplate) return null;
 
        const activeTemplateObj = templates.find((t: any) => t.id === selectedTemplate);
        const tplSub = activeTemplateObj?.subtitles;
 
        return {
            font: subEdit?.font ||
                  tplSub?.font_management?.base_sans_font?.replace(/-Medium\.ttf$/, '').replace(/\.ttf$/, '') ||
                  'Montserrat-ExtraBold',
            font_size: subEdit?.font_size ||
                       tplSub?.font_management?.font_size_px || 80,
            color: subEdit?.font_color ||
                   tplSub?.color_palette?.text_main || '#FFFFFF',
            accent_color: subEdit?.accent_color ||
                           tplSub?.color_palette?.text_accent || '#FACC15',
            position: subEdit?.position || 'bottom',
            behind_speaker: !!(subEdit?.behind_speaker || subEdit?.position === 'behind_speaker'),
            x: subEdit?.x,
            y: subEdit?.y,
            use_shadow: subEdit?.use_shadow ?? tplSub?.layout?.use_shadow ?? true,
            shadow_blur: subEdit?.shadow_blur ?? tplSub?.layout?.shadow_blur_px ?? 18,
            text_case: subEdit?.text_case ?? tplSub?.layout?.text_case ?? 'UPPER',
            max_words: subEdit?.max_words ?? tplSub?.layout?.max_words_per_screen ?? 3,
            font_pairing: subEdit?.font_pairing || tplSub?.font_management?.accent_serif_font?.replace(/-Italic\.ttf$/, '').replace(/\.ttf$/, '') || 'Lobster',
            word_styles: subEdit?.word_styles || null,
            inactive_opacity: subEdit?.inactive_opacity ?? null,
            active_scale: subEdit?.active_scale ?? null,
            letter_spacing: subEdit?.letter_spacing,
            line_spacing: subEdit?.line_spacing,
            width: subEdit?.width,
            height: subEdit?.height,
        };
    }, [activeEdits, templates, selectedTemplate]);

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
      #preview-container { width: 1920px; height: 1080px; position: relative; transform-origin: center center; background: transparent; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="preview-container">
      ${hyperframesEdits.map(e => e.html_content).join('\n')}
    </div>
    <script>
      function resize() {
        const container = document.getElementById('preview-container');
        const isLandscape = window.innerWidth >= window.innerHeight;
        const dw = isLandscape ? 1920 : 1080;
        const dh = isLandscape ? 1080 : 1920;
        container.style.width = dw + 'px';
        container.style.height = dh + 'px';
        const scale = Math.min(window.innerWidth / dw, window.innerHeight / dh);
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

    // Derived Video URLs
    const originalFilename = useMemo(() => {
        // 1. Try media library
        const mainAsset = mediaLibrary.find((item: any) => item.id === "main");
        if (mainAsset && mainAsset.path) {
            return mainAsset.path.split('/').pop() || null;
        }
        // 2. Try localStorage
        if (typeof window !== 'undefined') {
            const savedOrig = localStorage.getItem(`original_filename_${id}`);
            if (savedOrig) return savedOrig;
        }
        // 3. Fallback to current filename if it doesn't contain _rendered
        if (filename && !filename.includes('_rendered')) {
            return filename;
        }
        return null;
    }, [mediaLibrary, filename, id]);

    const videoUrl = filename ? `${API_URL}/uploads/${filename}` : null;
    const currentVideo = videoUrl;

    // Revert to original video if edits change (so they can see live updates on original video)
    const lastEditsJsonRef = useRef("");
    useEffect(() => {
        const editsJson = JSON.stringify({ activeEdits, multiTrackEdl });
        if (!lastEditsJsonRef.current) {
            lastEditsJsonRef.current = editsJson;
            return;
        }
        if (lastEditsJsonRef.current !== editsJson) {
            lastEditsJsonRef.current = editsJson;
            // Switch back to original video after full export only (keep RVM preview)
            if (originalFilename && filename && filename.includes('_rendered') && !filename.includes('_rvm')) {
                setFilename(originalFilename);
            }
        }
    }, [activeEdits, multiTrackEdl, originalFilename, filename]);

    // RVM live preview: alpha cutout for behind-speaker / layered text, or baked composite for plain bg remove
    const [rotoProcessing, setRotoProcessing] = useState(false);
    const [rvmAlphaFilename, setRvmAlphaFilename] = useState<string | null>(null);
    const [rvmMaskFilename, setRvmMaskFilename] = useState<string | null>(null);
    const [rotoReadyFlash, setRotoReadyFlash] = useState(false);
    const rotoKeyDoneRef = useRef<string>("");
    const rotoRequest = useMemo(() => {
        const bgEdit = activeEdits.find(
            (ed: any) => ed.action === "remove_background" || ed.action === "set_video_background"
        );
        const subEdit = activeEdits.find((ed: any) => ed.action === "add_subtitles");
        const behindSubs = !!(subEdit?.behind_speaker || subEdit?.position === "behind_speaker");

        // Layered mode: keep original video + mask matte so text stays editable behind
        if (behindSubs || bgEdit?.action === "set_video_background") {
            return {
                action: bgEdit?.action || "behind_speaker",
                mode: "alpha" as const,
                asset_version: 3,
                bg_color: bgEdit?.bg_color || "#0a0a14",
                text: bgEdit?.text || null,
                text_color: bgEdit?.text_color || "white",
                text_opacity: bgEdit?.text_opacity ?? 0.18,
                font_size: bgEdit?.font_size || 220,
                gradient_color2: bgEdit?.gradient_color2 || null,
                bg_video_query: bgEdit?.bg_video_query || null,
            };
        }

        if (bgEdit?.action === "remove_background") {
            return {
                action: "remove_background",
                mode: "composite" as const,
                asset_version: 3,
                bg_color: bgEdit.bg_color && bgEdit.bg_color !== "transparent" ? bgEdit.bg_color : "#0a0a14",
                text: null,
                text_color: "white",
                text_opacity: 0.12,
                font_size: 220,
                gradient_color2: bgEdit.gradient_color2 || null,
                bg_video_query: bgEdit.bg_video_query || null,
            };
        }
        return null;
    }, [activeEdits]);

    useEffect(() => {
        if (!id) return;

        if (!rotoRequest) {
            rotoKeyDoneRef.current = "";
            setRvmAlphaFilename(null);
            setRvmMaskFilename(null);
            if (filename && filename.includes("_rvm_preview") && originalFilename) {
                setFilename(originalFilename);
            }
            setRotoProcessing(false);
            return;
        }

        const requestKey = JSON.stringify(rotoRequest);
        if (rotoKeyDoneRef.current === requestKey) {
            setRotoProcessing(false);
            return;
        }

        let cancelled = false;
        const authHeaders = () => {
            const accessKey = localStorage.getItem("vibe_access_key") || "";
            const accessLogin = localStorage.getItem("vibe_user_login") || "";
            return {
                "Content-Type": "application/json",
                "X-Access-Key": accessKey,
                "X-User-Login": encodeURIComponent(accessLogin),
            };
        };

        const applyResult = (data: { filename?: string; mode?: string; mask_filename?: string; alpha_filename?: string }) => {
            if (!data.filename && !data.mask_filename) return;
            rotoKeyDoneRef.current = requestKey;
            if (data.mode === "alpha" || data.filename?.includes("_rvm_mask") || data.filename?.includes("_rvm_alpha") || data.mask_filename) {
                const maskName = data.mask_filename
                    || (data.filename?.includes("_rvm_mask") ? data.filename : null)
                    || (id ? `${id}_rvm_mask.mp4` : null);
                // Mask is the supported preview path; only keep WebM alpha if server still advertises it
                // (backend omits alpha_filename when the file is missing).
                const alphaName = maskName
                    ? (data.alpha_filename || null)
                    : (data.alpha_filename
                        || (data.filename?.includes("_rvm_alpha") ? data.filename : null));
                setRvmMaskFilename(maskName);
                setRvmAlphaFilename(alphaName);
                if (filename?.includes("_rvm_preview") && originalFilename) {
                    setFilename(originalFilename);
                }
                setRotoReadyFlash(true);
                setTimeout(() => setRotoReadyFlash(false), 4000);
            } else {
                setRvmMaskFilename(null);
                setRvmAlphaFilename(null);
                if (data.filename) setFilename(data.filename);
            }
            setRotoProcessing(false);
        };

        const run = async () => {
            setRotoProcessing(true);
            try {
                const startRes = await fetch(`${API_URL}/api/video/${id}/roto_preview`, {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify(rotoRequest),
                });
                if (!startRes.ok) {
                    console.warn("[RVM] preview start failed", startRes.status);
                    if (!cancelled) setRotoProcessing(false);
                    return;
                }
                const startData = await startRes.json();
                if (startData.status === "ready" && (startData.filename || startData.mask_filename)) {
                    if (!cancelled) applyResult(startData);
                    return;
                }

                // Full-HD RVM can take 15–40 min on CPU — keep polling (was 6 min and gave up)
                for (let i = 0; i < 1200 && !cancelled; i++) {
                    await new Promise((r) => setTimeout(r, i < 120 ? 2000 : 3000));
                    const st = await fetch(`${API_URL}/api/video/${id}/roto_status`, {
                        headers: authHeaders(),
                    });
                    if (!st.ok) continue;
                    const data = await st.json();
                    if (data.status === "ready" && (data.filename || data.mask_filename)) {
                        if (!cancelled) applyResult(data);
                        return;
                    }
                    if (data.status === "error") {
                        console.warn("[RVM] preview error:", data.message);
                        if (!cancelled) setRotoProcessing(false);
                        return;
                    }
                }
                console.warn("[RVM] preview poll timed out — will keep checking in background");
            } catch (err) {
                console.warn("[RVM] preview failed", err);
            }
            if (!cancelled) setRotoProcessing(false);
        };

        run();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, API_URL, rotoRequest, originalFilename]);

    // If poll timed out / page reloaded while mask already exists on server — pick it up
    useEffect(() => {
        if (!id || !rotoRequest || rvmMaskFilename || rvmAlphaFilename) return;
        if (rotoProcessing) return;

        let cancelled = false;
        const authHeaders = () => {
            const accessKey = localStorage.getItem("vibe_access_key") || "";
            const accessLogin = localStorage.getItem("vibe_user_login") || "";
            return {
                "X-Access-Key": accessKey,
                "X-User-Login": encodeURIComponent(accessLogin),
            };
        };

        const check = async () => {
            try {
                const st = await fetch(`${API_URL}/api/video/${id}/roto_status`, { headers: authHeaders() });
                if (!st.ok || cancelled) return;
                const data = await st.json();
                if (data.status !== "ready" || (!data.filename && !data.mask_filename)) return;
                const maskName = data.mask_filename
                    || (data.filename?.includes("_rvm_mask") ? data.filename : null)
                    || (id ? `${id}_rvm_mask.mp4` : null);
                // Don't attach missing legacy WebM when mask is available
                const alphaName = data.alpha_filename || null;
                if (data.mode === "alpha" || maskName) {
                    rotoKeyDoneRef.current = JSON.stringify(rotoRequest);
                    setRvmMaskFilename(maskName);
                    setRvmAlphaFilename(alphaName);
                    setRotoReadyFlash(true);
                    setTimeout(() => setRotoReadyFlash(false), 4000);
                    setRotoProcessing(false);
                } else if (data.filename) {
                    rotoKeyDoneRef.current = JSON.stringify(rotoRequest);
                    setFilename(data.filename);
                    setRotoProcessing(false);
                }
            } catch {
                /* ignore */
            }
        };

        check();
        const timer = setInterval(check, 5000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [id, API_URL, rotoRequest, rvmMaskFilename, rvmAlphaFilename, rotoProcessing]);

    const rvmAlphaSrc = rvmAlphaFilename ? `${API_URL}/uploads/${rvmAlphaFilename}` : null;
    const rvmMaskSrc = rvmMaskFilename ? `${API_URL}/uploads/${rvmMaskFilename}` : null;
    // Initialize filename to originalFilename once media library loads and if it's currently unset
    useEffect(() => {
        if (!filename && originalFilename) {
            setFilename(originalFilename);
        }
    }, [filename, originalFilename]);

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

    // Synchronize soundtrack audio playback state with main playing state
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const isRenderedVideo = currentVideo ? currentVideo.includes('_rendered') : false;
        if (isPlaying && !isRenderedVideo) {
            audio.play().catch(e => console.error("Soundtrack playback failed to start:", e));
        } else {
            audio.pause();
        }
    }, [isPlaying, currentVideo]);

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
                console.warn("Failed to generate audio peaks (using fallback):", error);
                if (active) {
                    setAudioPeaks(Array(100).fill(20));
                }
            } finally {
                if (audioCtx && audioCtx.state !== 'closed') {
                    try {
                        await audioCtx.close();
                    } catch (e) {}
                }
            }
        };
        generatePeaks();
        return () => {
            active = false;
            if (audioCtx && audioCtx.state !== 'closed') {
                audioCtx.close().catch(() => {});
            }
        };
    }, [currentVideo]);

    // Prefer companion .mp3 for waveform peaks (more reliable than decoding mp4 after reload)
    useEffect(() => {
        if (!id || !API_URL) return;
        let active = true;
        let audioCtx: AudioContext | null = null;
        const generateFromMp3 = async () => {
            const mp3Url = `${API_URL}/uploads/${id}.mp3`;
            try {
                const head = await fetch(mp3Url, { method: "HEAD" });
                if (!head.ok || !active) return;
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContextClass) return;
                audioCtx = new AudioContextClass();
                const response = await fetch(mp3Url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                if (!active) return;
                const channelData = audioBuffer.getChannelData(0);
                const peaks: number[] = [];
                const samples = 1000;
                const blockSize = Math.max(1, Math.floor(channelData.length / samples));
                for (let i = 0; i < samples; i++) {
                    let sum = 0;
                    const blockStart = blockSize * i;
                    for (let j = 0; j < blockSize; j++) sum += Math.abs(channelData[blockStart + j] || 0);
                    peaks.push(sum / blockSize);
                }
                const maxPeak = Math.max(...peaks, 1e-6);
                if (active) setAudioPeaks(peaks.map((p) => (p / maxPeak) * 100));
            } catch {
                /* keep whatever peaks the main video effect produced */
            } finally {
                if (audioCtx && audioCtx.state !== "closed") {
                    try { await audioCtx.close(); } catch { /* ignore */ }
                }
            }
        };
        generateFromMp3();
        return () => {
            active = false;
            if (audioCtx && audioCtx.state !== "closed") audioCtx.close().catch(() => {});
        };
    }, [id, API_URL]);

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

    // Timeline resizing - moved inline with pointer capture

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Poll for logs and rendering status
    useEffect(() => {
        if (!id) return;
        const fetchStatus = async () => {
            try {
                const res = await fetch(`${API_URL}/api/video/${id}/status`);
                const data = await res.json();
                if (data.logs) setLogs(data.logs);
                if (data.status === "ready") {
                    setIsRendering(false);
                    if (data.filename) {
                        setFilename(data.filename);
                    }
                } else if (data.status === "processing") {
                    setIsRendering(true);
                } else {
                    setIsRendering(false);
                }
            } catch (e) { }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, [id, API_URL]);

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

    // Fetch project media library
    useEffect(() => {
        if (!id) return;
        const fetchMediaLibrary = async () => {
            try {
                const res = await fetch(`${API_URL}/api/video/${id}/media_library`);
                const data = await res.json();
                if (Array.isArray(data)) {
                    setMediaLibrary(data);
                }
            } catch (e) {
                console.error("Failed to fetch media library:", e);
            }
        };
        fetchMediaLibrary();
    }, [id, API_URL]);

    // After reload, URL/localStorage may hold the original upload name (e.g. reeelas.mov → reeelas.mp4)
    // while the server stores {projectId}.mp4 — heal filename from media library.
    useEffect(() => {
        if (!id || !mediaLibrary.length) return;
        const main = mediaLibrary.find((item: any) => item.id === "main");
        const fromPath = main?.path ? String(main.path).split(/[/\\]/).pop() : null;
        const canonical =
            (fromPath && fromPath !== "Original Video" && fromPath.includes("."))
                ? fromPath
                : `${id}.mp4`;

        setFilename((prev) => {
            const looksWrong = !prev || (!prev.includes(id) && !prev.includes("_rendered") && !prev.includes("_rvm"));
            if (!looksWrong && prev) return prev;
            try {
                localStorage.setItem(`filename_${id}`, canonical);
                if (!canonical.includes("_rendered") && !canonical.includes("_rvm_preview")) {
                    localStorage.setItem(`original_filename_${id}`, canonical);
                }
            } catch { /* ignore */ }
            return canonical;
        });
    }, [id, mediaLibrary]);

    // Dynamic two-way sync of activeEdits to multiTrackEdl
    useEffect(() => {
        if (!mainVideoDuration) return;
        
        const cuts = activeEdits.filter(e => e.action === "cut_out").sort((a, b) => a.start - b.start);
        const stitches = activeEdits.filter(e => e.action === "stitch_clip");

        // 1. Build main video keeps
        let current = 0;
        const mainKeeps: { start: number; end: number; source: string }[] = [];
        for (const cut of cuts) {
            const cutStart = cut.start ?? 0;
            const cutEnd = cut.end ?? 0;
            if (cutStart > current) {
                mainKeeps.push({ start: current, end: cutStart, source: "main" });
            }
            current = Math.max(current, cutEnd);
        }
        if (current < mainVideoDuration) {
            mainKeeps.push({ start: current, end: mainVideoDuration, source: "main" });
        }

        // 2. Append stitched clips
        const stitchedKeeps = stitches.map(s => ({
            start: s.start ?? 0,
            end: s.end ?? 5,
            source: s.source || "main"
        }));

        const newEdl = {
            v1: [...mainKeeps, ...stitchedKeeps],
            a1: [...mainKeeps, ...stitchedKeeps]
        };

        const currentEdlStr = JSON.stringify(multiTrackEdl);
        const newEdlStr = JSON.stringify(newEdl);
        if (currentEdlStr !== newEdlStr) {
            setMultiTrackEdl(newEdl);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeEdits, mainVideoDuration]);

    const handleUpdateSubtitleGlobal = (field: string, value: any) => {
        setActiveEdits(prev => {
            const exists = prev.some(e => e.action === 'add_subtitles');
            if (exists) {
                return prev.map(e => {
                    if (e.action === 'add_subtitles') {
                        return { ...e, [field]: value };
                    }
                    return e;
                });
            } else {
                const newSubEdit = {
                    action: 'add_subtitles',
                    font: 'Arial',
                    font_size: 100,
                    font_color: 'White',
                    use_outline: true,
                    position: 'bottom',
                    animation_style: 'fade',
                    [field]: value
                };
                return [...prev, newSubEdit];
            }
        });
    };

    const handleUpdateSubtitleGlobalMultiple = (fields: Record<string, any>) => {
        setActiveEdits(prev => {
            const exists = prev.some(e => e.action === 'add_subtitles');
            if (exists) {
                return prev.map(e => {
                    if (e.action === 'add_subtitles') {
                        return { ...e, ...fields };
                    }
                    return e;
                });
            } else {
                const newSubEdit = {
                    action: 'add_subtitles',
                    font: 'Arial',
                    font_size: 100,
                    font_color: 'White',
                    use_outline: true,
                    position: 'bottom',
                    animation_style: 'fade',
                    ...fields
                };
                return [...prev, newSubEdit];
            }
        });
    };

    const handleUpdateSubtitleChunk = (chunkIndex: number, newText: string) => {
        setActiveEdits(prev => {
            const overrideExists = prev.some(e => e.action === 'subtitle_override' && e.chunk_index === chunkIndex);
            let base = prev;
            if (!overrideExists) {
                base = [...prev, { action: 'subtitle_override', chunk_index: chunkIndex, deleted: true }];
            }

            const chunkWords = transcript?.words?.filter((w: any) => w.chunk_index === chunkIndex) || [];
            const start = chunkWords[0]?.start ?? 0;
            const end = chunkWords[chunkWords.length - 1]?.end ?? (start + 1.5);
            
            const textOverlayId = `G1-Graphic-Sub-${chunkIndex}`;
            const existingOverlayIdx = base.findIndex((e: any) => e.action === 'add_text_overlay' && e.id === textOverlayId);

            const newOverlay = {
                action: 'add_text_overlay',
                id: textOverlayId,
                start,
                end,
                text: newText,
                is_subtitle: true,
                font_size: sandboxSubtitleConfig?.font_size ?? 38,
                font: sandboxSubtitleConfig?.font ?? 'Inter',
                font_color: sandboxSubtitleConfig?.color ?? '#FFFFFF',
                position: sandboxSubtitleConfig?.position ?? 'bottom',
                animation_style: 'fade',
                x: sandboxSubtitleConfig?.x ?? 50,
                y: sandboxSubtitleConfig?.y ?? 78,
                width: sandboxSubtitleConfig?.width ?? 80,
                height: sandboxSubtitleConfig?.height ?? 15
            };

            if (existingOverlayIdx !== -1) {
                const updated = [...base];
                updated[existingOverlayIdx] = { ...updated[existingOverlayIdx], text: newText };
                return updated;
            } else {
                return [...base, newOverlay];
            }
        });
    };

    const handleUpdateEditByIndex = (index: number, updates: Record<string, any>) => {
        setActiveEdits(prev => {
            if (index < 0 || index >= prev.length) return prev;
            const updated = [...prev];
            updated[index] = { ...updated[index], ...updates };
            return updated;
        });
    };

    const handleEdlChange = (newEdl: any) => {
        setMultiTrackEdl(newEdl);
        
        // Find which track actually changed compared to current multiTrackEdl to avoid overriding edits
        let baseTrack = newEdl.v1;
        if (multiTrackEdl) {
            const v1Changed = JSON.stringify(newEdl.v1) !== JSON.stringify(multiTrackEdl.v1);
            const a1Changed = JSON.stringify(newEdl.a1) !== JSON.stringify(multiTrackEdl.a1);
            if (a1Changed && !v1Changed) {
                baseTrack = newEdl.a1;
            }
        }

        // Sync trimmed/dragged segments back to activeEdits
        const newStitchClips = baseTrack.filter((seg: any) => seg.source && seg.source !== "main");
        const mainKeeps = baseTrack.filter((seg: any) => !seg.source || seg.source === "main");
        
        const newCuts: any[] = [];
        let prevEnd = 0;
        for (const keep of mainKeeps) {
            if (keep.start > prevEnd) {
                newCuts.push({
                    action: "cut_out",
                    start: prevEnd,
                    end: keep.start,
                    reason: "Пауза / Обрезка"
                });
            }
            prevEnd = keep.end;
        }
        if (prevEnd < mainVideoDuration) {
            newCuts.push({
                action: "cut_out",
                start: prevEnd,
                end: mainVideoDuration,
                reason: "Пауза / Обрезка"
            });
        }

        const otherEdits = activeEdits.filter(e => e.action !== "cut_out" && e.action !== "stitch_clip");
        const stitchEdits = newStitchClips.map((seg: any) => ({
            action: "stitch_clip",
            source: seg.source,
            start: seg.start,
            end: seg.end
        }));

        const newActiveEdits = [...otherEdits, ...newCuts, ...stitchEdits];
        if (JSON.stringify(activeEdits) !== JSON.stringify(newActiveEdits)) {
            setActiveEdits(newActiveEdits);
        }
    };

    // Initial AI greeting
    useEffect(() => {
        if (!id || chat.length > 0 || hasInitialized || !transcript) return;
        setHasInitialized(true);
        handleSend("INIT_PLAN", true);
    }, [id, chat.length, hasInitialized, transcript]);

    const handleStopAgent = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsAgentTyping(false);
        setChat(prev => {
            const copy = [...prev];
            const lastReasoningIdx = copy.map(m => m.role).lastIndexOf('reasoning');
            if (lastReasoningIdx !== -1) {
                const target = copy[lastReasoningIdx];
                const steps = [...(target.steps || [])];
                if (steps.length > 0) {
                    const lastStep = steps[steps.length - 1];
                    lastStep.status = 'error';
                    lastStep.details = '⏹️ Выполнение прервано пользователем.';
                }
                copy[lastReasoningIdx] = { ...target, steps };
            }
            return [...copy, { role: "system", text: "⏹️ Операция прервана пользователем." }];
        });
    }, []);

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
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;

            const currentAccessKey = typeof window !== 'undefined' ? localStorage.getItem('vibe_access_key') || '' : '';
            const currentAccessLogin = typeof window !== 'undefined' ? localStorage.getItem('vibe_user_login') || '' : '';

            const response = await fetch(`${API_URL}/api/chat`, {
                method: "POST",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", "X-Access-Key": currentAccessKey, "X-User-Login": encodeURIComponent(currentAccessLogin) },
                body: JSON.stringify({ 
                    file_id: id, 
                    message: textToSend, 
                    font: fontStyle,
                    font_size: fontSize,
                    font_color: fontColor,
                    use_outline: useOutline,
                    force_edits: forceEdits || null,
                    active_edits: activeEdits,
                    template_id: selectedTemplate || null,
                    target_format: targetFormat,
                    focused_item: focusedItem || null
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 403) {
                    handleAuthError(errorData.detail || 'access_key_invalid');
                } else {
                    setChat(prev => [...prev, { role: "system", text: `❌ Ошибка сервера: ${response.status}` }]);
                }
                setIsAgentTyping(false);
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder("utf-8");

            if (reader) {
                let streamBuffer = "";
                
                const processParsedData = (data: any) => {
                    if (data.type === "log") {
                        setLogs(prev => [...prev, data.message]);
                        setTimeout(() => scrollToBottom(), 50);
                    } else if (data.type === "reasoning" || data.type === "reasoning_event") {
                        // Hide technical junk (budget counters, ENG checklists, etc.)
                        if (data.user_visible === false) {
                            return;
                        }
                        setChat(prev => {
                            const copy = [...prev];
                            const lastUserIdx = copy.map(m => m.role).lastIndexOf('user');
                            const lastReasoningIdx = copy.map(m => m.role).lastIndexOf('reasoning');
                            const newStep = {
                                step: data.step,
                                status: data.status,
                                details: data.details,
                                agent: data.agent,
                                progress: data.progress,
                                thought: data.thought,
                                phase: data.phase,
                                user_visible: data.user_visible !== false,
                            };

                            // Prefer matching by thought text so narrative lines update in place
                            const matchKey = (s: any) =>
                                (s.thought || s.step || "").slice(0, 48);

                            if (lastReasoningIdx !== -1 && lastReasoningIdx > lastUserIdx) {
                                const target = copy[lastReasoningIdx];
                                const newSteps = [...(target.steps || [])];
                                const existing = newSteps.find(
                                    s => s.step === data.step || (data.thought && matchKey(s) === matchKey(newStep))
                                );
                                if (existing) {
                                    existing.status = data.status;
                                    if (data.details != null) existing.details = data.details;
                                    if (data.agent != null) existing.agent = data.agent;
                                    if (data.progress != null) existing.progress = data.progress;
                                    if (data.thought != null) existing.thought = data.thought;
                                    if (data.phase != null) existing.phase = data.phase;
                                    existing.user_visible = true;
                                } else {
                                    newSteps.push(newStep);
                                }
                                copy[lastReasoningIdx] = { ...target, steps: newSteps };
                                return copy;
                            }
                            return [...copy, { role: "reasoning", steps: [newStep] }];
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

                                // Snapshot reasoning chain onto the AI message, then it collapses in UI
                                const thoughts: any[] = [];
                                for (let i = copy.length - 1; i > lastUserIdx; i--) {
                                    if (copy[i].role !== 'reasoning') continue;
                                    for (const s of (copy[i].steps || [])) {
                                        if (s.user_visible === false) continue;
                                        const text = s.thought || (s.details || '').split('\n')[0] || '';
                                        if (!text) continue;
                                        thoughts.unshift({
                                            text,
                                            status: 'done',
                                            phase: s.phase,
                                        });
                                    }
                                }
                                
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
                                        variants: data.variants || [],
                                        thoughts: thoughts.length ? thoughts : copy[lastAiIdx].thoughts,
                                    };
                                    return copy;
                                } else {
                                    return [...copy, {
                                        role: "ai",
                                        text: data.content,
                                        variants: data.variants || [],
                                        thoughts: thoughts.length ? thoughts : undefined,
                                    }];
                                }
                            });
                        }
                        if (data.edits && data.edits.length > 0) {
                            const hasUndo = data.edits.some((e: any) => e.action === "undo");
                            const hasRedo = data.edits.some((e: any) => e.action === "redo");

                            if (hasUndo) {
                                handleUndo();
                            } else if (hasRedo) {
                                handleRedo();
                            } else {
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
                        }
                        setTimeout(() => scrollToBottom(), 50);
                    } else if (data.type === "error") {
                        setChat(prev => [...prev, { role: "ai", text: "Error: " + data.message }]);
                    }
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    streamBuffer += decoder.decode(value, { stream: true });
                    const lines = streamBuffer.split("\n");
                    streamBuffer = lines.pop() || "";
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        try {
                            const data = JSON.parse(trimmed);
                            processParsedData(data);
                        } catch (e) {
                            console.warn("Stream line partial JSON buffer:", trimmed);
                        }
                    }
                }

                if (streamBuffer.trim()) {
                    try {
                        const data = JSON.parse(streamBuffer.trim());
                        processParsedData(data);
                    } catch (e) {
                        console.warn("Remaining stream buffer parse fallback:", streamBuffer.trim());
                    }
                }
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("Chat execution aborted by user.");
            } else {
                setChat(prev => [...prev, { role: "ai", text: "Connection error." }]);
            }
        } finally {
            setIsAgentTyping(false);
            abortControllerRef.current = null;
        }
    };

    const handleDirectRender = async () => {
        try {
            setIsRendering(true);
            setChat((prev: any) => [...prev, { role: "system", text: `🎬 Launching render...` }]);
            const currentAccessKey = typeof window !== 'undefined' ? localStorage.getItem('vibe_access_key') || '' : '';
            const currentAccessLogin = typeof window !== 'undefined' ? localStorage.getItem('vibe_user_login') || '' : '';

            const response = await fetch(`${API_URL}/api/chat/render`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Access-Key": currentAccessKey, "X-User-Login": encodeURIComponent(currentAccessLogin) },
                body: JSON.stringify({ 
                    file_id: id, font: fontStyle, font_size: fontSize, font_color: fontColor,
                    use_outline: useOutline, position: "center",
                    edits: activeEdits.length > 0 ? activeEdits : null,
                    edl: multiTrackEdl, 
                    template_id: selectedTemplate || null,
                    brand_id: null
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 403) {
                    handleAuthError(errorData.detail || 'access_key_invalid');
                } else {
                    setChat(prev => [...prev, { role: "system", text: `❌ Ошибка рендера: ${response.status}` }]);
                }
                setIsRendering(false);
                return;
            }
        } catch (error) {
            setChat(prev => [...prev, { role: "system", text: "❌ Render connection error." }]);
        }
    };

    return (
        <div className="h-screen w-full bg-[#111111] text-neutral-200 flex flex-col font-sans overflow-hidden">
            {isMounted && !accessKeyReady && <AccessKeyModal onSuccess={handleAccessKeySuccess} initialError={accessKeyError} />}
            
            {/* ── Top Navigation Bar ── */}
            <header className="h-[56px] flex items-center px-6 justify-between z-20 shrink-0 select-none bg-[#1C1C1E] border-b border-white/5">
                {/* Left: Project Info */}
                <div className="flex items-center gap-6">
                    <button className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white transition-colors">
                        Мой проект
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    <div className="flex items-center gap-2 text-xs text-neutral-500 ml-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Сохранено в 12:48
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-4">

                    {/* Undo/Redo History Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleUndo}
                            disabled={!canUndo}
                            className={`p-1.5 rounded transition-colors ${canUndo ? 'text-neutral-300 hover:text-white hover:bg-white/10' : 'text-neutral-600 cursor-not-allowed'}`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={!canRedo}
                            className={`p-1.5 rounded transition-colors ${canRedo ? 'text-neutral-300 hover:text-white hover:bg-white/10' : 'text-neutral-600 cursor-not-allowed'}`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                            </svg>
                        </button>
                    </div>

                    <div className="h-4 w-px bg-white/10 mx-1" />

                    <button className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition-colors border border-white/10">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Предпросмотр
                    </button>

                    <button
                        onClick={() => setShowExportModal(true)}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-semibold text-black bg-orange-500 hover:bg-orange-400 transition-colors shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                    >
                        {isExporting ? "Экспорт..." : "Экспорт"}
                    </button>

                    {/* Format Toggle UI */}
                    <div className="flex items-center gap-1 bg-[#2C2C2E] rounded p-1 border border-white/5">
                        <select 
                            value={targetFormat} 
                            onChange={(e) => setTargetFormat(e.target.value as any)}
                            className="bg-transparent text-sm text-neutral-200 outline-none cursor-pointer pl-1 pr-4 appearance-none"
                            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23ffffff'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")", backgroundPosition: "right 0.2rem center", backgroundRepeat: "no-repeat", backgroundSize: "1em" }}
                        >
                            <option value="auto" className="bg-[#2C2C2E]">Auto</option>
                            <option value="16:9" className="bg-[#2C2C2E]">16:9</option>
                            <option value="9:16" className="bg-[#2C2C2E]">9:16</option>
                        </select>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 border border-white/20 overflow-hidden">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-full h-full object-cover" />
                    </div>
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
                    brandId={brandId}
                />
            )}

            <div className="flex-1 flex overflow-hidden flex-row min-h-0 relative">
                {/* Main Content Area */}
                <div className="flex-1 flex overflow-hidden flex-row relative p-1.5 md:p-3 gap-1.5 md:gap-3 min-h-0">
                
                {/* 2. Center: Preview + Timeline */}
                {(!isMobile || activeMobileTab === 'editor') && (
                    <div className="flex-1 flex flex-col min-w-0 h-full gap-3 min-h-0">
                        {/* Video Preview */}
                        <div
                            className="flex-1 overflow-hidden relative rounded-2xl bg-black/5 dark:bg-white/5 shadow-sm border border-black/5 dark:border-white/10"
                        >
                            <VibeProvider currentConfig={activeVibeConfig}>
                                <SandboxPlayer
                                    ref={videoRef}
                                    videoSrc={currentVideo}
                                    rvmAlphaSrc={rvmAlphaSrc}
                                    rvmMaskSrc={rvmMaskSrc}
                                    edits={activeEditsWithSubtitles}
                                    edl={multiTrackEdl}
                                    isPlaying={isPlaying}
                                    targetFormat={targetFormat}
                                    onTogglePlay={() => setIsPlaying(!isPlaying)}
                                    onTimeUpdate={(t: number) => {
                                        // time updates are already handled by SandboxPlayer internally
                                    }}
                                    duration={duration}
                                    mediaLibrary={mediaLibrary}
                                    transcript={transcript}
                                    subtitleConfig={sandboxSubtitleConfig}
                                    focusedClipId={focusedClipId}
                                    onUpdateEdit={handleUpdateEditByIndex}
                                    onUpdateSubtitleGlobal={handleUpdateSubtitleGlobal}
                                    onUpdateSubtitleGlobalMultiple={handleUpdateSubtitleGlobalMultiple}
                                    onUpdateSubtitleChunk={handleUpdateSubtitleChunk}
                                    brandId={brandId}
                                    brandAssets={brandAssets}
                                    selectedTemplate={selectedTemplate}
                                />
                                {rotoProcessing && (
                                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                                        <div className="px-3 py-1.5 rounded-full bg-black/70 border border-fuchsia-500/40 text-[11px] text-fuchsia-200 shadow-lg backdrop-blur-sm">
                                            RVM: вырезаю спикера для текста за ним…
                                        </div>
                                    </div>
                                )}
                                {!rotoProcessing && rotoReadyFlash && (
                                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                                        <div className="px-3 py-1.5 rounded-full bg-black/70 border border-emerald-500/40 text-[11px] text-emerald-200 shadow-lg backdrop-blur-sm">
                                            RVM готов — текст за спикером
                                        </div>
                                    </div>
                                )}
                            </VibeProvider>
                        </div>

                        {/* Quick Actions Row */}
                        <div className="flex items-center justify-center gap-2 mb-1 z-20">
                            {[
                                { icon: "✨", label: "Auto Edit", primary: true, prompt: "Сделай авто-монтаж ролика: добавь музыку, динамичные зумы, переходы и субтитры" },
                                { icon: "🎨", label: "Графика", prompt: "Добавь красивую 3D инфографику (A-roll) по смыслу видео на ключевых моментах с Three.js и Remotion" },
                                { icon: "🎬", label: "B-roll", prompt: "Добавь стоковые видео-перебивки B-roll по теме видео на ключевых моментах" },
                                { icon: "📝", label: "Субтитры", prompt: "Настрой стиль субтитров (крупный шрифт Montserrat, тени, караоке-анимация pop)" },
                                { icon: "🎵", label: "Музыка", prompt: "Подбери фоновую музыку под настроение ролика" },
                                { icon: "⚡", label: "Улучшить", prompt: "Проведи критический аудит ролика и добавь недостающие зумы или перебивки" },
                            ].map((btn, i) => (
                                <button 
                                    key={i}
                                    onClick={() => handleSend(btn.prompt)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-colors border ${
                                        btn.primary 
                                            ? "bg-[#2A1D15] text-orange-500 border-orange-500/30 hover:bg-[#36251A]" 
                                            : "bg-[#1C1C1E] text-neutral-300 border-white/5 hover:bg-[#2C2C2E]"
                                    }`}
                                >
                                    <span>{btn.icon}</span>
                                    {btn.label}
                                </button>
                            ))}
                            <button className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#1C1C1E] border border-white/5 hover:bg-[#2C2C2E] text-neutral-400 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                                </svg>
                            </button>
                        </div>

                        {/* Statically fixed timeline panel */}

                        {/* Timeline Panel */}
                        <div
                            className="flex-shrink-0 flex flex-col overflow-hidden relative bg-[#161618] border border-white/5 rounded-2xl"
                            style={{ height: isMobile ? "220px" : timelineHeight }}
                        >
                            {/* Timeline toolbar */}
                            <div className="h-10 flex items-center px-4 justify-between shrink-0 border-b border-white/5 bg-[#1C1C1E]">
                                <div className="flex bg-[#161618] p-1 rounded-lg border border-white/5 gap-1">
                                    {(['text', 'video'] as const).map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`px-3 py-1 rounded-md text-[10px] font-semibold tracking-wide uppercase transition-all ${
                                                activeTab === tab 
                                                    ? "bg-[#2C2C2E] text-white shadow-sm" 
                                                    : "text-neutral-500 hover:text-neutral-300"
                                            }`}
                                        >
                                            {tab === 'text' ? 'Текст' : 'Медиа'}
                                        </button>
                                    ))}
                                </div>
                                {activeTab === 'text' && (
                                    <button
                                        onClick={handleDirectRender}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500/20 transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <span>Рендер</span>
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 overflow-hidden">
                                {activeTab === 'text' ? (
                                    <TimelineEditor 
                                        transcript={transcript} 
                                        activeEdits={activeEdits} 
                                        onEditsChange={setActiveEdits} 
                                        subtitleChunks={subtitleChunks}
                                        selectedSubIndices={selectedSubIndices}
                                        onSubSelectionChange={(indices) => {
                                            setSelectedSubIndices(indices);
                                            if (indices.length > 0) {
                                                setFocusedClipId(`T1-Sub-${indices[0]}`);
                                            }
                                        }}
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
                                        onTogglePlay={() => setIsPlaying(!isPlaying)}
                                        onEdlChange={handleEdlChange}
                                        onActiveEditsChange={(newEdits: any) => setActiveEdits(newEdits)}
                                        transcript={transcript}
                                        selectedClipId={focusedClipId}
                                        onSelectedClipChange={setFocusedClipId}
                                        isFocusSelectionActive={isFocusSelectionActive}
                                        onFocusSelectionActiveChange={setIsFocusSelectionActive}
                                        draggingAssetType={draggingAssetType}
                                        selectedSubIndices={selectedSubIndices}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Right Sidebars Area ── */}
                {isChatOpen && (
                    <div className="rainbow-glow-container w-full md:w-[330px] h-full min-h-0 flex-shrink-0 transition-all duration-300 z-10">
                        <div className="w-full h-full rounded-[15px] rainbow-glass-panel overflow-hidden flex flex-col">
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
                                isMobile={isMobile}
                                focusedItem={focusedItem}
                                onClearFocus={() => setFocusedClipId(null)}
                                isFocusSelectionActive={isFocusSelectionActive}
                                onToggleFocusSelection={() => setIsFocusSelectionActive(prev => !prev)}
                                onStopAgent={handleStopAgent}
                            />
                        </div>
                    </div>
                )}

                {isLibraryOpen && (
                    <div className="rainbow-glow-container w-full md:w-[330px] h-full min-h-0 flex-shrink-0 transition-all duration-300 z-10">
                        <div className="w-full h-full rounded-[15px] rainbow-glass-panel overflow-hidden flex flex-col">
                            <ReferencesSidebar 
                                activeEdits={activeEdits} 
                                onActiveEditsChange={setActiveEdits} 
                                duration={duration} 
                                onClose={isMobile ? undefined : () => setIsLibraryOpen(false)}
                                isMobile={isMobile}
                                fileId={id as string}
                                mediaLibrary={mediaLibrary}
                                onMediaLibraryChange={setMediaLibrary}
                                focusedClipId={focusedClipId}
                                focusedItem={focusedItem}
                                onClearFocus={() => setFocusedClipId(null)}
                                multiTrackEdl={multiTrackEdl}
                                onEdlChange={handleEdlChange}
                                onDragStateChange={setDraggingAssetType}
                                onStitchClip={(assetId: string, assetDuration: number) => {
                                    setActiveEdits(prev => [
                                        ...prev,
                                        { action: "stitch_clip", source: assetId, start: 0, end: assetDuration }
                                    ]);
                                }}
                                videoRef={videoRef}
                                selectedSubIndices={selectedSubIndices}
                                subtitleChunks={subtitleChunks}
                                onBrandAssetsChange={handleBrandAssetsChange}
                                onUpdateSubtitleGlobal={handleUpdateSubtitleGlobal}
                            />
                        </div>
                    </div>
                )}

                {isTextOpen && (
                    <div className="rainbow-glow-container w-full md:w-[330px] h-full min-h-0 flex-shrink-0 transition-all duration-300 z-10">
                        <div className="w-full h-full rounded-[15px] rainbow-glass-panel overflow-hidden flex flex-col">
                            <TextSidebar
                                fontStyle={fontStyle}
                                setFontStyle={setFontStyle}
                                fontSize={fontSize}
                                setFontSize={setFontSize}
                                fontColor={fontColor}
                                setFontColor={setFontColor}
                                useOutline={useOutline}
                                setUseOutline={setUseOutline}
                                onClose={() => setIsTextOpen(false)}
                            />
                        </div>
                    </div>
                )}

                {isGraphicsOpen && (
                    <div className="rainbow-glow-container w-full md:w-[330px] h-full min-h-0 flex-shrink-0 transition-all duration-300 z-10">
                        <div className="w-full h-full rounded-[15px] rainbow-glass-panel overflow-hidden flex flex-col">
                            <GraphicsSidebar
                                activeEdits={activeEdits}
                                onEditsChange={setActiveEdits}
                                onClose={() => setIsGraphicsOpen(false)}
                                currentTime={videoRef.current ? videoRef.current.currentTime : 0}
                            />
                        </div>
                    </div>
                )}

                {isMusicOpen && (
                    <div className="rainbow-glow-container w-full md:w-[330px] h-full min-h-0 flex-shrink-0 transition-all duration-300 z-10">
                        <div className="w-full h-full rounded-[15px] rainbow-glass-panel overflow-hidden flex flex-col">
                            <MusicSidebar
                                activeEdits={activeEdits}
                                onEditsChange={setActiveEdits}
                                onClose={() => setIsMusicOpen(false)}
                            />
                        </div>
                    </div>
                )}

                {isMaskingOpen && (
                    <div className="rainbow-glow-container w-full md:w-[330px] h-full min-h-0 flex-shrink-0 transition-all duration-300 z-10">
                        <div className="w-full h-full rounded-[15px] rainbow-glass-panel overflow-hidden flex flex-col">
                            <MaskingSidebar
                                activeEdits={activeEdits}
                                onEditsChange={setActiveEdits}
                                onClose={() => setIsMaskingOpen(false)}
                            />
                        </div>
                    </div>
                )}

                {isTransitionsOpen && (
                    <div className="rainbow-glow-container w-full md:w-[330px] h-full min-h-0 flex-shrink-0 transition-all duration-300 z-10">
                        <div className="w-full h-full rounded-[15px] rainbow-glass-panel overflow-hidden flex flex-col">
                            <TransitionsSidebar
                                activeEdits={activeEdits}
                                onEditsChange={setActiveEdits}
                                onClose={() => setIsTransitionsOpen(false)}
                                currentTime={videoRef.current ? videoRef.current.currentTime : 0}
                                fileId={id}
                            />
                        </div>
                    </div>
                )}
                </div>

                {/* ── Right Tool Navigation (matches global Sidebar style) ── */}
                <div className="hidden md:flex flex-col w-[64px] hover:w-[200px] m-2 p-3 rounded-[16px] bg-neutral-900/70 backdrop-blur-[20px] border border-white/[0.07] shadow-lg z-20 shrink-0 h-auto self-start transition-all duration-300 group overflow-hidden">

                    {/* Tool buttons */}
                    {[
                        {
                            id: "chat",
                            label: "Чат",
                            isOpen: isChatOpen,
                            badge: true,
                            onClick: () => { setIsChatOpen(!isChatOpen); setIsLibraryOpen(false); setIsTextOpen(false); setIsGraphicsOpen(false); setIsMusicOpen(false); setIsMaskingOpen(false); setIsTransitionsOpen(false); },
                            icon: (
                                <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                            )
                        },
                        {
                            id: "library",
                            label: "Медиа",
                            isOpen: isLibraryOpen,
                            onClick: () => { setIsLibraryOpen(!isLibraryOpen); setIsChatOpen(false); setIsTextOpen(false); setIsGraphicsOpen(false); setIsMusicOpen(false); setIsMaskingOpen(false); setIsTransitionsOpen(false); },
                            icon: (
                                <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            )
                        },
                        {
                            id: "text",
                            label: "Текст",
                            isOpen: isTextOpen,
                            onClick: () => { setIsTextOpen(!isTextOpen); setIsChatOpen(false); setIsLibraryOpen(false); setIsGraphicsOpen(false); setIsMusicOpen(false); setIsMaskingOpen(false); setIsTransitionsOpen(false); },
                            icon: (
                                <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16m-7 6h7" />
                                </svg>
                            )
                        },
                        {
                            id: "graphics",
                            label: "Графика",
                            isOpen: isGraphicsOpen,
                            onClick: () => { setIsGraphicsOpen(!isGraphicsOpen); setIsChatOpen(false); setIsLibraryOpen(false); setIsTextOpen(false); setIsMusicOpen(false); setIsMaskingOpen(false); setIsTransitionsOpen(false); },
                            icon: (
                                <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                                </svg>
                            )
                        },
                        {
                            id: "music",
                            label: "Музыка",
                            isOpen: isMusicOpen,
                            onClick: () => { setIsMusicOpen(!isMusicOpen); setIsChatOpen(false); setIsLibraryOpen(false); setIsTextOpen(false); setIsGraphicsOpen(false); setIsMaskingOpen(false); setIsTransitionsOpen(false); },
                            icon: (
                                <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                            )
                        },
                        {
                            id: "masking",
                            label: "Маскинг",
                            isOpen: isMaskingOpen,
                            onClick: () => { setIsMaskingOpen(!isMaskingOpen); setIsChatOpen(false); setIsLibraryOpen(false); setIsTextOpen(false); setIsGraphicsOpen(false); setIsMusicOpen(false); setIsTransitionsOpen(false); },
                            icon: (
                                <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            )
                        },
                        {
                            id: "transitions",
                            label: "Переходы",
                            isOpen: isTransitionsOpen,
                            onClick: () => { setIsTransitionsOpen(!isTransitionsOpen); setIsChatOpen(false); setIsLibraryOpen(false); setIsTextOpen(false); setIsGraphicsOpen(false); setIsMusicOpen(false); setIsMaskingOpen(false); },
                            icon: (
                                <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                            )
                        },
                    ].map((item) => (
                        <button
                            key={item.id}
                            onClick={item.onClick}
                            className={`relative flex items-center gap-3.5 px-2.5 py-2.5 rounded-[12px] text-[13px] font-medium transition-all duration-200 w-full text-left mb-1 ${
                                item.isOpen
                                    ? "bg-orange-500/15 text-orange-400 border border-orange-500/20"
                                    : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100 border border-transparent"
                            }`}
                        >
                            <span className="relative shrink-0">
                                {item.icon}
                                {item.badge && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-500 rounded-full border border-neutral-900" />
                                )}
                            </span>
                            <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[13px]">
                                {item.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 4. Bottom Mobile Navigation Bar */}
            {isMobile && (
                <div 
                    className="h-[60px] border-t border-white/5 flex items-center justify-around shrink-0 z-30 font-sans shadow-lg"
                    style={{
                        background: "rgba(20,20,20,0.65)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                    }}
                >
                    <button
                        onClick={() => {
                            setActiveMobileTab('chat');
                            setIsChatOpen(true);
                        }}
                        className="flex flex-col items-center justify-center gap-1 py-1 cursor-pointer transition-all active:scale-95 flex-1"
                        style={{ color: activeMobileTab === 'chat' ? '#3B82F6' : '#5A6478' }}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span className="text-[13px] font-semibold uppercase tracking-wider">ИИ Чат</span>
                    </button>
                    <button
                        onClick={() => setActiveMobileTab('editor')}
                        className="flex flex-col items-center justify-center gap-1 py-1 cursor-pointer transition-all active:scale-95 flex-1"
                        style={{ color: activeMobileTab === 'editor' ? '#3B82F6' : '#5A6478' }}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 022 2z" />
                        </svg>
                        <span className="text-[13px] font-semibold uppercase tracking-wider">Монтаж</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveMobileTab('library');
                            setIsLibraryOpen(true);
                        }}
                        className="flex flex-col items-center justify-center gap-1 py-1 cursor-pointer transition-all active:scale-95 flex-1"
                        style={{ color: activeMobileTab === 'library' ? '#3B82F6' : '#5A6478' }}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <span className="text-[13px] font-semibold uppercase tracking-wider">Библиотека</span>
                    </button>
                </div>
            )}


        </div>
    );
}
