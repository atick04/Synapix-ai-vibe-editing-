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
            let fn = filenameParam;
            const ext = fn.split('.').pop()?.toLowerCase();
            if (ext && ['mov', 'avi', 'mkv'].includes(ext)) {
                fn = fn.substring(0, fn.lastIndexOf('.')) + '.mp4';
            }
            setFilename(fn);
            localStorage.setItem(`filename_${id}`, fn);
            if (!fn.includes('_rendered')) {
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
    const [chat, setChat] = useState<{ role: string, text?: string, steps?: any[], variants?: any[], done?: boolean }[]>([]);
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
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const historyRef = useRef<{ activeEdits: any[]; multiTrackEdl: any }[]>([]);
    const historyIndexRef = useRef<number>(-1);
    const isUndoingRedoingRef = useRef<boolean>(false);
    const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
    const [activeTab, setActiveTab] = useState<'text' | 'video'>('text');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const hyperframesEdits = activeEdits.filter(e => e.action === 'canvas_overlay' || e.action === 'hyperframes_html' || e.action === 'add_hyperframes_graphics');
    
    // Manual Format Control
    const [targetFormat, setTargetFormat] = useState<'auto' | '16:9' | '9:16'>('auto');

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

            if (savedChat) setChat(JSON.parse(savedChat));
            if (savedEdits) setActiveEdits(JSON.parse(savedEdits));
            if (savedEdl) setMultiTrackEdl(JSON.parse(savedEdl));
            if (savedInit) setHasInitialized(JSON.parse(savedInit));
        } catch (e) {
            console.error("Failed to load state from localStorage:", e);
        } finally {
            setIsLoaded(true);
        }
    }, [id]);

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
    const autoComposeTriggeredRef = useRef(false);

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
    const [timelineHeight, setTimelineHeight] = useState(200);
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

                    const activeFont = overrideForChunk?.font || userFont || templateFont || "Arial";
                    const activeFontSize = overrideForChunk?.font_size || userFontSize || templateFontSize || 80;
                    const activeColor = overrideForChunk?.font_color || userColor || templateColor || "White";
                    const activeAccentColor = userAccentColor || templateAccentColor || "#F2E16A";
                    const activeUseShadow = userUseShadow !== undefined ? userUseShadow : (templateUseShadow || false);
                    const activeShadowBlur = userShadowBlur !== undefined ? userShadowBlur : (templateShadowBlur || 0);
                    const activeTextCase = userTextCase || templateTextCase || "Sentence_Case";
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
                    const activeAnimation = overrideForChunk?.animation_style || subEdit?.animation_style || "fade";

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
                  'Inter',
            font_size: subEdit?.font_size ||
                       tplSub?.font_management?.font_size_px || 58,
            color: subEdit?.font_color ||
                   tplSub?.color_palette?.text_main || '#F5F5F7',
            accent_color: subEdit?.accent_color ||
                           tplSub?.color_palette?.text_accent || '#F2E16A',
            position: subEdit?.position || 'bottom',
            x: subEdit?.x,
            y: subEdit?.y,
            use_shadow: subEdit?.use_shadow ?? tplSub?.layout?.use_shadow ?? true,
            shadow_blur: subEdit?.shadow_blur ?? tplSub?.layout?.shadow_blur_px ?? 18,
            text_case: subEdit?.text_case ?? tplSub?.layout?.text_case ?? 'Sentence_Case',
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
      #preview-container { width: 1080px; height: 1920px; position: relative; transform-origin: center center; background: transparent; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="preview-container">
      ${hyperframesEdits.map(e => e.html_content).join('\n')}
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
            // Switch back to original video
            if (originalFilename && filename && filename.includes('_rendered')) {
                setFilename(originalFilename);
            }
        }
    }, [activeEdits, multiTrackEdl, originalFilename, filename]);

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
                console.error("Failed to generate audio peaks:", error);
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

    // Automatic AI Composer trigger when template query parameter is specified
    useEffect(() => {
        if (!id || !selectedTemplate || autoComposeTriggeredRef.current) return;
        
        // Wait until both Whisper transcript and Visual analysis are completed
        const isVisualDone = logs.some(l => l.includes("Визуальный анализ готов") || l.includes("Визуальный анализ пропущен"));
        if (transcript && isVisualDone) {
            const runAutoCompose = async () => {
                autoComposeTriggeredRef.current = true;
                setChat(prev => [...prev, { 
                    role: "system", 
                    text: `🪄 Инициализирую шаблон «${selectedTemplate}». Запускаю автокомпозитор для подбора саундтрека и SFX...` 
                }]);
                
                try {
                    const res = await fetch(`${API_URL}/api/video/${id}/auto_compose`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ template_id: selectedTemplate })
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        setChat(prev => [...prev, { 
                            role: "ai", 
                            text: `✅ Автоподбор завершен! Создан и наложен саундтрек «${data.bgm_filename}». Звуковые эффекты переходов синхронизированы с видеорядом.` 
                        }]);
                        
                        // Add edits (BGM and SFX) to timeline
                        if (data.edits) {
                            setActiveEdits(prev => {
                                const base = prev.filter(e => e.action !== "add_asset" && e.action !== "scene_override" && e.action !== "add_subtitles");
                                return [...base, ...data.edits];
                            });
                        }
                        
                        // Refresh media library
                        const libRes = await fetch(`${API_URL}/api/video/${id}/media_library`);
                        if (libRes.ok) {
                            const libData = await libRes.json();
                            setMediaLibrary(libData);
                        }
                    } else {
                        console.error("Auto-compose request failed");
                    }
                } catch (e) {
                    console.error("Error running auto-compose:", e);
                }
            };
            runAutoCompose();
        }
    }, [id, selectedTemplate, transcript, logs, API_URL]);

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
    }, [activeEdits, mainVideoDuration, multiTrackEdl]);

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
        
        // Sync trimmed/dragged segments back to activeEdits
        const newStitchClips = newEdl.v1.filter((seg: any) => seg.source && seg.source !== "main");
        const mainKeeps = newEdl.v1.filter((seg: any) => !seg.source || seg.source === "main");
        
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
                    template_id: selectedTemplate || null,
                    target_format: targetFormat,
                    focused_item: focusedItem || null
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
                            } else if (data.type === "thinking_chunk") {
                                // Accumulate AI's internal reasoning for contextual display
                                setChat(prev => {
                                    const copy = [...prev];
                                        const lastUserIdx = copy.map(m => m.role).lastIndexOf('user');
                                        const lastReasoningIdx = copy.map(m => m.role).lastIndexOf('reasoning');
                                        
                                        if (lastReasoningIdx !== -1 && lastReasoningIdx > lastUserIdx) {
                                            copy[lastReasoningIdx] = { 
                                                ...copy[lastReasoningIdx], 
                                                text: (copy[lastReasoningIdx].text || "") + "\n" + data.content,
                                                done: data.done || false
                                            };
                                            return copy;
                                        } else {
                                            return [...copy, { role: "reasoning", text: data.content, done: data.done || false, steps: [] }];
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
        <div className="flex-1 h-full bg-[#f8f9fa] dark:bg-[#090a0b] text-neutral-800 dark:text-neutral-200 flex flex-col font-sans overflow-hidden">
            {/* ── Soft Glass Header ── */}
            <header
                className="h-[44px] flex items-center px-4 justify-between z-20 shrink-0 select-none bg-white/40 dark:bg-black/20 backdrop-blur-2xl border-b border-black/5 dark:border-white/5"
            >
                <div className="flex items-center gap-3">
                    {/* Brand elements removed as requested */}
                </div>
                <div className="flex items-center gap-3">
                    <div
                        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white/50 dark:bg-neutral-800/50"
                    >
                        <span className="w-1.5 h-1.5 rounded-full animate-breathe bg-blue-500" style={{ display: "inline-block" }} />
                        <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">live</span>
                    </div>

                    {/* Header toggles removed as requested (now in Left Navigation Dock) */}

                    {/* Undo/Redo History Controls */}
                    <div className="flex items-center gap-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 border border-neutral-200 dark:border-neutral-700">
                        <button
                            onClick={handleUndo}
                            disabled={!canUndo}
                            className={`p-1 text-[11px] rounded-md transition-all flex items-center justify-center cursor-pointer select-none ${
                                canUndo 
                                    ? 'text-neutral-700 dark:text-neutral-200 hover:bg-white dark:hover:bg-neutral-700 active:scale-95' 
                                    : 'text-neutral-400 dark:text-neutral-600 opacity-40 cursor-not-allowed'
                            }`}
                            title="Undo (Ctrl+Z)"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={!canRedo}
                            className={`p-1 text-[11px] rounded-md transition-all flex items-center justify-center cursor-pointer select-none ${
                                canRedo 
                                    ? 'text-neutral-700 dark:text-neutral-200 hover:bg-white dark:hover:bg-neutral-700 active:scale-95' 
                                    : 'text-neutral-400 dark:text-neutral-600 opacity-40 cursor-not-allowed'
                            }`}
                            title="Redo (Ctrl+Y)"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                            </svg>
                        </button>
                    </div>

                    {/* Format Toggle UI */}
                    <div className="hidden sm:flex items-center gap-1 mx-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 border border-neutral-200 dark:border-neutral-700">
                        {(['auto', '16:9', '9:16'] as const).map(fmt => (
                            <button
                                key={fmt}
                                onClick={() => setTargetFormat(fmt)}
                                className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all uppercase tracking-wider ${
                                    targetFormat === fmt 
                                        ? 'bg-blue-500 text-white shadow-sm' 
                                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-white dark:hover:bg-neutral-700'
                                }`}
                            >
                                {fmt}
                            </button>
                        ))}
                    </div>

                    <button
                        id="export-btn"
                        onClick={() => setShowExportModal(true)}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer select-none"
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

            <div className="flex-1 flex overflow-hidden flex-row min-h-0">
                {/* ── Desktop Left Side Navigation Bar ── */}
                <div className="hidden md:flex flex-col w-[64px] border-r border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-2xl py-4 items-center gap-4 shrink-0 z-20">
                    <button
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group ${
                            isChatOpen 
                                ? 'bg-zinc-950 text-amber-500 border border-white/10 shadow-sm' 
                                : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/5 border border-transparent'
                        }`}
                        title="AI Editor"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <div className="absolute left-14 scale-0 group-hover:scale-100 transition-all duration-150 origin-left bg-zinc-900 border border-white/10 text-white text-[10px] font-semibold tracking-wider px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                            AI Editor
                        </div>
                    </button>

                    <button
                        onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group ${
                            isLibraryOpen 
                                ? 'bg-zinc-950 text-amber-500 border border-white/10 shadow-sm' 
                                : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/5 border border-transparent'
                        }`}
                        title="Media Library"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                            <circle cx="9" cy="9" r="2"/>
                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                        </svg>
                        <div className="absolute left-14 scale-0 group-hover:scale-100 transition-all duration-150 origin-left bg-zinc-900 border border-white/10 text-white text-[10px] font-semibold tracking-wider px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                            Media Library
                        </div>
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex overflow-hidden flex-col md:flex-row relative p-1.5 md:p-3 gap-1.5 md:gap-3 min-h-0">
                
                {/* 1. Left Sidebar: Chat Assistant */}
                {(!isMobile || activeMobileTab === 'chat') && isChatOpen && (
                    <div className="w-full md:w-[290px] h-full min-h-0 flex-shrink-0 rounded-2xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-neutral-900/40 backdrop-blur-2xl transition-all duration-300 z-10 shadow-sm overflow-hidden flex flex-col">
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
                            transcript={transcript}
                            activeEdits={activeEditsWithSubtitles}
                            mediaLibrary={mediaLibrary}
                            videoUrl={currentVideo}
                        />
                    </div>
                )}
                {/* 2. Center: Preview + Timeline */}
                {(!isMobile || activeMobileTab === 'editor') && (
                    <div className="flex-1 flex flex-col min-w-0 h-full gap-3 min-h-0">
                        {/* Video Preview */}
                        <div
                            className="flex-1 overflow-hidden relative rounded-2xl bg-black/5 dark:bg-white/5 shadow-sm border border-black/5 dark:border-white/10"
                        >
                            <SandboxPlayer
                                ref={videoRef}
                                videoSrc={currentVideo}
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
                            />
                        </div>

                        {/* Resizer pill */}
                        {!isMobile && (
                            <div
                                className="h-4 w-full cursor-row-resize flex items-center justify-center group relative z-50"
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    setIsResizing(true);
                                }}
                                onPointerMove={(e) => {
                                    if (!isResizing) return;
                                    const windowHeight = window.innerHeight;
                                    let newHeight = windowHeight - e.clientY - 24;
                                    newHeight = Math.max(150, Math.min(windowHeight * 0.7, newHeight));
                                    setTimelineHeight(newHeight);
                                }}
                                onPointerUp={(e) => {
                                    try {
                                        e.currentTarget.releasePointerCapture(e.pointerId);
                                    } catch (err) {}
                                    setIsResizing(false);
                                }}
                            >
                                <div
                                    className="w-8 h-1 rounded-full transition-all duration-200"
                                    style={{ background: isResizing ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.08)" }}
                                />
                                {isResizing && <div className="fixed inset-0 cursor-row-resize z-[100]" />}
                            </div>
                        )}

                        {/* Timeline Panel */}
                        <div
                            className="flex-shrink-0 flex flex-col overflow-hidden relative bg-white/60 dark:bg-neutral-900/40 backdrop-blur-2xl shadow-sm"
                            style={{
                                height: isMobile ? "220px" : timelineHeight,
                                borderRadius: "1rem", /* rounded-2xl */
                                border: "1px solid rgba(0,0,0,0.05)",
                            }}
                        >
                            {/* Timeline toolbar */}
                            <div
                                className="h-9 flex items-center px-3 justify-between shrink-0 border-b border-black/5 dark:border-white/5"
                            >
                                <div className="flex gap-1 items-center">
                                    {(['text', 'video'] as const).map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className="px-2 py-0.5 rounded-md text-[11px] font-mono transition-all cursor-pointer"
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
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer"
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

                {/* 3. Right Sidebar: Asset Library */}
                {(!isMobile || activeMobileTab === 'library') && isLibraryOpen && (
                    <div className="w-full md:w-[290px] h-full min-h-0 flex-shrink-0 rounded-2xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-neutral-900/40 backdrop-blur-2xl transition-all duration-300 z-10 shadow-sm overflow-hidden flex flex-col">
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
                        />
                    </div>
                )}
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
                        <span className="text-[13px] font-semibold uppercase tracking-wider">AI Editor</span>
                    </button>
                    <button
                        onClick={() => setActiveMobileTab('editor')}
                        className="flex flex-col items-center justify-center gap-1 py-1 cursor-pointer transition-all active:scale-95 flex-1"
                        style={{ color: activeMobileTab === 'editor' ? '#3B82F6' : '#5A6478' }}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 022 2z" />
                        </svg>
                        <span className="text-[13px] font-semibold uppercase tracking-wider">Edit</span>
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
                        <span className="text-[13px] font-semibold uppercase tracking-wider">Library</span>
                    </button>
                </div>
            )}


        </div>
    );
}
