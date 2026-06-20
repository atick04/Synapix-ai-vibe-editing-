import React, { useState, useEffect, useRef, useMemo } from "react";

type KeepSegment = { start: number; end: number; source?: string };

export default function VideoTimeline({ 
  duration,
  activeEdits,
  multiTrackEdl,
  audioPeaks,
  videoRef,
  audioRef,
  isPlaying,
  onTogglePlay,
  onEdlChange,
  onActiveEditsChange,
  transcript,
  selectedClipId: externalSelectedClipId,
  onSelectedClipChange,
  isFocusSelectionActive = false,
  onFocusSelectionActiveChange,
  draggingAssetType,
  selectedSubIndices
}: { 
  duration: number;
  activeEdits: any[];
  multiTrackEdl: { v1: KeepSegment[], a1: KeepSegment[] };
  audioPeaks?: number[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onEdlChange: (edl: { v1: KeepSegment[], a1: KeepSegment[] }) => void;
  onActiveEditsChange?: (edits: any[]) => void;
  transcript?: any;
  selectedClipId?: string | null;
  onSelectedClipChange?: (clipId: string | null) => void;
  isFocusSelectionActive?: boolean;
  onFocusSelectionActiveChange?: (active: boolean) => void;
  draggingAssetType?: string | null;
  selectedSubIndices?: number[];
}) {
    const [timelineTime, setTimelineTime] = useState(0);
    const [localSelectedClipId, setLocalSelectedClipId] = useState<string | null>(null);
    const selectedClipId = externalSelectedClipId !== undefined ? externalSelectedClipId : localSelectedClipId;
    const setSelectedClipId = (id: string | null) => {
        setLocalSelectedClipId(id);
        onSelectedClipChange?.(id);
        if (id) {
            onFocusSelectionActiveChange?.(false);
        }
    };

    const [activeTool, setActiveTool] = useState<'pointer' | 'razor'>('pointer');
    const [editingChunk, setEditingChunk] = useState<{index: number; text: string} | null>(null);
    const [zoom, setZoom] = useState(100);
    const editInputRef = useRef<HTMLInputElement>(null);

    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (editingChunk && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingChunk]);
    const subtitleChunks = useMemo(() => {
        if (!transcript?.words) return [];
        const cuts = activeEdits.filter(e => e.action === 'cut_out');
        const sortedCuts = [...cuts].sort((a, b) => (a.start || 0) - (b.start || 0));
        const inCut = (start: number, end: number) => {
            return sortedCuts.some(c => start < (c.end || 0) && end > (c.start || 0));
        };

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
            if (curChunk.length === 3) {
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

    const [animStyle, setAnimStyle] = useState<string>(
        () => activeEdits.find(e => e.action === 'add_subtitles')?.animation_style || 'fade'
    );

    useEffect(() => {
        const subEdit = activeEdits.find(e => e.action === 'add_subtitles');
        if (subEdit?.animation_style && subEdit.animation_style !== animStyle) {
            setAnimStyle(subEdit.animation_style);
        }
    }, [activeEdits]);

    const setAndSaveAnimStyle = (style: string) => {
        setAnimStyle(style);
        if (onActiveEditsChange) {
            const updated = activeEdits.map(e =>
                e.action === 'add_subtitles' ? { ...e, animation_style: style } : e
            );
            onActiveEditsChange(updated);
        }
    };
    
    const [trimState, setTrimState] = useState<{ 
        track: 'v1' | 'a1' | 't1' | 'v2' | 'm1' | 'sfx' | 'c1',
        clipIndex: number, 
        type: 'left' | 'right', 
        startX: number, 
        initialTime: number,
        pointerId: number
    } | null>(null);
    const [previewTrim, setPreviewTrim] = useState<{time: number} | null>(null);

    // NEW State for horizontal clip dragging
    const [dragState, setDragState] = useState<{
        track: 'v1' | 'a1' | 't1' | 'v2' | 'm1' | 'sfx' | 'g1' | 's1' | 'c1',
        clipIndex: number,
        startX: number,
        initialStart: number,
        initialEnd: number,
        pointerId: number
    } | null>(null);
    const [previewDrag, setPreviewDrag] = useState<{ start: number, end: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const [dragOverTrack, setDragOverTrack] = useState<string | null>(null);

    const handleDragOver = (e: React.DragEvent, track: string) => {
        e.preventDefault();
        setDragOverTrack(track);
    };

    const handleDragLeave = () => {
        setDragOverTrack(null);
    };

    const handleDrop = (e: React.DragEvent, track: string) => {
        e.preventDefault();
        setDragOverTrack(null);
        
        try {
            const assetType = e.dataTransfer.getData("assetType");
            const assetDataStr = e.dataTransfer.getData("assetData");
            if (!assetDataStr) return;
            const assetData = JSON.parse(assetDataStr);

            // Calculate drop time relative to the track's width
            const rect = e.currentTarget.getBoundingClientRect();
            const dropX = e.clientX - rect.left;
            const percent = Math.max(0, Math.min(1, dropX / rect.width));
            const dropTime = Number((percent * duration).toFixed(2));

            let newEdit: any = null;
            if (track === 'v2' && assetType === 'broll') {
                newEdit = {
                    action: "add_broll",
                    start: dropTime,
                    end: Math.min(dropTime + 3.0, duration),
                    query: assetData.query,
                    broll_url: assetData.url
                };
            } else if (track === 'v2' && assetType === 'stitch') {
                newEdit = {
                    action: "add_broll",
                    start: dropTime,
                    end: Math.min(dropTime + (assetData.duration || 3.0), duration),
                    query: assetData.filename,
                    resolved_path: assetData.path
                };
            } else if (track === 'sfx' && assetType === 'sfx') {
                newEdit = {
                    action: "add_asset",
                    start: dropTime,
                    end: Math.min(dropTime + 1.5, duration),
                    asset_query: assetData.name,
                    resolved_path: assetData.rel_path,
                    asset_type: "audio",
                    volume: -10
                };
            } else if (track === 'm1' && assetType === 'music') {
                newEdit = {
                    action: "add_asset",
                    start: dropTime,
                    end: duration,
                    asset_query: assetData.name,
                    resolved_path: assetData.rel_path,
                    asset_type: "audio",
                    volume: -22
                };
            } else if (track === 'g1' && assetType === 'graphics') {
                newEdit = {
                    action: "canvas_overlay",
                    start: dropTime,
                    end: Math.min(dropTime + 3.0, duration),
                    style: assetData.style,
                    html_content: assetData.html
                };
            } else if (track === 's1' && assetType === 'graphics') {
                newEdit = {
                    action: "semantic_scene",
                    start: dropTime,
                    end: Math.min(dropTime + 3.0, duration),
                    scene_data: {
                        scene_template: "concept_explainer",
                        mood: "neutral",
                        energy: 0.5,
                        entities: [{id: "txt1", type: "headline", text: "Graphic", visual_role: "title"}],
                        relations: []
                    }
                };
            } else if ((track === 'v1' || track === 'a1') && assetType === 'stitch') {
                newEdit = {
                    action: "stitch_clip",
                    source: assetData.id,
                    start: 0,
                    end: assetData.duration || 3.0
                };
            } else if (track === 'c1' && assetType === 'color') {
                newEdit = {
                    action: "color_correction",
                    start: dropTime,
                    end: Math.min(dropTime + 3.0, duration),
                    preset: assetData.id,
                    lut: assetData.id,
                    brightness: 100,
                    contrast: 100,
                    saturation: 100,
                    hue: 0
                };
            }

            if (newEdit && onActiveEditsChange) {
                onActiveEditsChange([...activeEdits, newEdit]);
            }
        } catch (err) {
            console.error("Failed to drop asset:", err);
        }
    };

    useEffect(() => {
        let rafId: number;
        const loop = () => {
            if (videoRef?.current) {
                setTimelineTime(videoRef.current.currentTime);
            }
            rafId = requestAnimationFrame(loop);
        }
        loop();
        return () => cancelAnimationFrame(rafId);
    }, [videoRef]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }
            if (e.key.toLowerCase() === 'v') {
                setActiveTool('pointer');
                return;
            }
            if (e.key.toLowerCase() === 'c') {
                setActiveTool('razor');
                return;
            }
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedClipId && !trimState && !dragState) {
                if (selectedClipId.startsWith('V2-Broll-')) {
                    const idx = parseInt(selectedClipId.replace('V2-Broll-', ''), 10);
                    if (onActiveEditsChange) {
                        const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                        const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                        onActiveEditsChange([...others, ...brolls.filter((_, i) => i !== idx)]);
                    }
                } else if (selectedClipId.startsWith('M1-Music-')) {
                    const idx = parseInt(selectedClipId.replace('M1-Music-', ''), 10);
                    if (onActiveEditsChange) {
                        onActiveEditsChange(activeEdits.filter((_, i) => i !== idx));
                    }
                } else if (selectedClipId.startsWith('SFX-Asset-')) {
                    const idx = parseInt(selectedClipId.replace('SFX-Asset-', ''), 10);
                    if (onActiveEditsChange) {
                        onActiveEditsChange(activeEdits.filter((_, i) => i !== idx));
                    }
                } else if (selectedClipId.startsWith('T1-Sub-')) {
                    const idx = parseInt(selectedClipId.replace('T1-Sub-', ''), 10);
                    const newEdl = { ...multiTrackEdl, v1: multiTrackEdl.v1.filter((_, i) => i !== idx) };
                    onEdlChange(newEdl);
                } else if (selectedClipId.startsWith('G1-Graphic-')) {
                    const parts = selectedClipId.split('-');
                    const idx = parseInt(parts[parts.length - 1], 10);
                    if (onActiveEditsChange) {
                        let gIndex = 0;
                        const updated = activeEdits.filter(ae => {
                            const isGraphic = ae.action === "canvas_overlay" || ae.action === "hyperframes_html" ||
                                              ae.action === 'add_hyperframes_graphics' || ae.action === 'add_motion_graphic' ||
                                              ae.action === 'add_dynamic_graphic' || ae.action === 'add_text_overlay';
                            if (isGraphic) {
                                const keep = gIndex !== idx;
                                gIndex++;
                                return keep;
                            }
                            return true;
                        });
                        onActiveEditsChange(updated);
                    }
                } else if (selectedClipId.startsWith('S1-Scene-')) {
                    const parts = selectedClipId.split('-');
                    const idx = parseInt(parts[parts.length - 1], 10);
                    const targetClip = sceneClips[idx];
                    if (targetClip && onActiveEditsChange) {
                        const updated = activeEdits.filter((_, i) => i !== targetClip.rawIndex);
                        onActiveEditsChange(updated);
                    }
                } else if (selectedClipId.startsWith('C1-Color-')) {
                    const idx = parseInt(selectedClipId.replace('C1-Color-', ''), 10);
                    if (onActiveEditsChange) {
                        const colors = activeEdits.filter(ae => ae.action === 'color_correction');
                        const others = activeEdits.filter(ae => ae.action !== 'color_correction');
                        onActiveEditsChange([...others, ...colors.filter((_, i) => i !== idx)]);
                    }
                } else {
                    const [, track, indexStr] = selectedClipId.split('-');
                    const index = parseInt(indexStr, 10);
                    const newEdl = { ...multiTrackEdl };
                    if (track === 'Video') newEdl.v1 = newEdl.v1.filter((_, idx) => idx !== index);
                    else if (track === 'Audio') newEdl.a1 = newEdl.a1.filter((_, idx) => idx !== index);
                    onEdlChange(newEdl);
                }
                setSelectedClipId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClipId, multiTrackEdl, activeEdits, onEdlChange, onActiveEditsChange, trimState, dragState, setActiveTool]);

    if (!duration || duration <= 0) return <div className="p-6 text-zinc-650 font-mono text-[11px] lowercase">loading timeline...</div>;

    // Process Color Clips list supporting dragging preview
    const colorClips: {start: number, end: number, id: string, label: string, rawIndex: number}[] = [];
    activeEdits.forEach((e, idx) => {
        if (e.action !== 'color_correction') return;
        
        let start = e.start != null ? e.start : 0;
        let end = e.end != null ? e.end : start + 3;
        
        const cIdx = colorClips.length;
        if (dragState?.track === 'c1' && dragState.clipIndex === cIdx && previewDrag) {
            start = previewDrag.start;
            end = previewDrag.end;
        }
        
        colorClips.push({
            start,
            end,
            id: `C1-Color-${cIdx}`,
            label: e.preset || e.lut || 'cinema',
            rawIndex: idx
        });
    });

    // Process Graphics Clips list supporting dragging preview
    const graphicClips: {start: number, end: number, id: string, label: string, rawIndex: number}[] = [];
    activeEdits.forEach((e, idx) => {
        const content = e.html_content || e.html;
        const isGraphic = e.action === "canvas_overlay" || e.action === "hyperframes_html" ||
                          e.action === 'add_hyperframes_graphics' || e.action === 'add_motion_graphic' ||
                          e.action === 'add_dynamic_graphic' || e.action === 'add_text_overlay';
        if (!isGraphic) return;
        
        let start = e.start != null ? e.start : 0;
        let end = e.end != null ? e.end : start + 3;
        
        const gIdx = graphicClips.length;
        if (dragState?.track === 'g1' && dragState.clipIndex === gIdx && previewDrag) {
            start = previewDrag.start;
            end = previewDrag.end;
        }

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

    // Process Scene Clips list supporting dragging preview
    const sceneClips: {start: number, end: number, id: string, label: string, rawIndex: number}[] = [];
    activeEdits.forEach((e, idx) => {
        if (e.action !== 'semantic_scene' && e.action !== 'scene_override') return;
        
        let start = e.start != null ? e.start : 0;
        let end = e.end != null ? e.end : start + 3;
        
        const sIdx = sceneClips.length;
        if (dragState?.track === 's1' && dragState.clipIndex === sIdx && previewDrag) {
            start = previewDrag.start;
            end = previewDrag.end;
        }
        
        sceneClips.push({
            start,
            end,
            id: e.id || `${e.action}-${idx}`,
            label: e.scene_data?.scene_template || e.style || 'semantic',
            rawIndex: idx
        });
    });

    const [isScrubbing, setIsScrubbing] = useState(false);

    const handleScrubStart = (e: React.PointerEvent) => {
        setIsScrubbing(true);
        handleScrub(e);
    };

    const handleScrub = (e: React.PointerEvent | PointerEvent | React.MouseEvent | MouseEvent) => {
        if (!duration || !videoRef?.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = percent * duration;
        
        videoRef.current.currentTime = newTime;
        if (audioRef?.current) audioRef.current.currentTime = newTime;
        setTimelineTime(newTime);
    };

    useEffect(() => {
        if (!isScrubbing) return;
        const onPointerMove = (e: PointerEvent) => handleScrub(e);
        const onPointerUp = () => setIsScrubbing(false);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, [isScrubbing, duration, videoRef]);

    // Generic clip click / razor splitting
    const handleClipClick = (
        e: React.MouseEvent, 
        id: string, 
        clip: { start: number, end: number }, 
        clipIndex: number, 
        track: 'v1' | 'a1' | 't1' | 'v2' | 'm1' | 'sfx' | 'g1' | 's1' | 'c1'
    ) => {
        e.stopPropagation();
        
        if (activeTool === 'pointer') {
            setSelectedClipId(id);
        } else if (activeTool === 'razor') {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const percentInClip = (e.clientX - rect.left) / rect.width;
            const clickTime = clip.start + percentInClip * (clip.end - clip.start);
            
            if (track === 'v1' || track === 'a1' || track === 't1') {
                const edlKey = track === 't1' ? 'v1' : track;
                const newEdl = { ...multiTrackEdl, [edlKey]: multiTrackEdl[edlKey as 'v1'|'a1'].slice() };
                newEdl[edlKey as 'v1'|'a1'].splice(clipIndex, 1, 
                    {start: clip.start, end: clickTime - 0.01},
                    {start: clickTime + 0.01, end: clip.end}
                );
                onEdlChange(newEdl);
            } else if (onActiveEditsChange) {
                if (track === 'v2') {
                    const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                    const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                    const target = brolls[clipIndex];
                    const first = { ...target, end: clickTime };
                    const second = { ...target, start: clickTime };
                    const updatedBrolls = [...brolls];
                    updatedBrolls.splice(clipIndex, 1, first, second);
                    onActiveEditsChange([...others, ...updatedBrolls]);
                } else if (track === 'm1' || track === 'sfx') {
                    const target = activeEdits[clipIndex];
                    const first = { ...target, end: clickTime };
                    const second = { ...target, start: clickTime };
                    const updated = [...activeEdits];
                    updated.splice(clipIndex, 1, first, second);
                    onActiveEditsChange(updated);
                } else if (track === 'g1') {
                    const targetClip = graphicClips[clipIndex];
                    if (targetClip) {
                        const target = activeEdits[targetClip.rawIndex];
                        const first = { ...target, end: clickTime };
                        const second = { ...target, start: clickTime };
                        const updated = [...activeEdits];
                        updated.splice(targetClip.rawIndex, 1, first, second);
                        onActiveEditsChange(updated);
                    }
                } else if (track === 'c1') {
                    const targetClip = colorClips[clipIndex];
                    if (targetClip) {
                        const target = activeEdits[targetClip.rawIndex];
                        const first = { ...target, end: clickTime };
                        const second = { ...target, start: clickTime };
                        const updated = [...activeEdits];
                        updated.splice(targetClip.rawIndex, 1, first, second);
                        onActiveEditsChange(updated);
                    }
                } else if (track === 's1') {
                    const targetClip = sceneClips[clipIndex];
                    if (targetClip && onActiveEditsChange) {
                        const target = activeEdits[targetClip.rawIndex];
                        const first = { ...target, end: clickTime };
                        const second = { ...target, start: clickTime };
                        const updated = [...activeEdits];
                        updated.splice(targetClip.rawIndex, 1, first, second);
                        onActiveEditsChange(updated);
                    }
                }
            }
            setActiveTool('pointer');
        }
    };

    // Trim handler
    const handleTrimStart = (e: React.PointerEvent, track: 'v1'|'a1'|'t1'|'v2'|'m1'|'sfx'|'c1', clipIndex: number, type: 'left' | 'right', initialTime: number) => {
        if (activeTool !== 'pointer') return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setTrimState({ track, clipIndex, type, startX: e.clientX, initialTime, pointerId: e.pointerId });
        setPreviewTrim({ time: initialTime });
    };

    const handleTrimMove = (e: React.PointerEvent) => {
        if (!trimState || e.pointerId !== trimState.pointerId || !containerRef.current) return;
        const trackWidth = containerRef.current.getBoundingClientRect().width || 1;
        const deltaSec = ((e.clientX - trimState.startX) / trackWidth) * duration;
        let newTime = trimState.initialTime + deltaSec;
        newTime = Math.max(0, Math.min(newTime, duration));
        setPreviewTrim({ time: newTime });
    };

    const handleTrimEnd = (e: React.PointerEvent) => {
        if (!trimState || !previewTrim) return;
        e.currentTarget.releasePointerCapture(e.pointerId);

        if (trimState.track === 'v2') {
            if (onActiveEditsChange) {
                const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                const updated = brolls.map((b, i) => {
                    if (i !== trimState.clipIndex) return b;
                    return trimState.type === 'left'
                        ? { ...b, start: previewTrim.time }
                        : { ...b, end: previewTrim.time };
                });
                onActiveEditsChange([...others, ...updated]);
            }
        } else if (trimState.track === 'm1' || trimState.track === 'sfx') {
            if (onActiveEditsChange) {
                const updated = activeEdits.map((asset, i) => {
                    if (i !== trimState.clipIndex) return asset;
                    return trimState.type === 'left'
                        ? { ...asset, start: previewTrim.time }
                        : { ...asset, end: previewTrim.time };
                });
                onActiveEditsChange(updated);
            }
        } else if (trimState.track === 'c1') {
            if (onActiveEditsChange) {
                const targetClip = colorClips[trimState.clipIndex];
                if (targetClip) {
                    const updated = activeEdits.map((ae, i) => {
                        if (i !== targetClip.rawIndex) return ae;
                        return trimState.type === 'left'
                            ? { ...ae, start: previewTrim.time }
                            : { ...ae, end: previewTrim.time };
                    });
                    onActiveEditsChange(updated);
                }
            }
        } else if (trimState.track === 't1') {
            if (onActiveEditsChange) {
                const idx = trimState.clipIndex;
                const chunk = subtitleChunks[idx];
                if (chunk) {
                    const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === idx));
                    const overrideForChunk = activeEdits.find(ae => ae.action === 'subtitle_override' && ae.chunk_index === idx);
                    const spokenText = chunk.words.map((w: any) => w.word).join(' ');
                    const text = overrideForChunk?.text || spokenText || '';
                    const newStart = trimState.type === 'left' ? previewTrim.time : (overrideForChunk?.start != null ? overrideForChunk.start : chunk.start);
                    const newEnd = trimState.type === 'right' ? previewTrim.time : (overrideForChunk?.end != null ? overrideForChunk.end : chunk.end);
                    onActiveEditsChange([...others, {
                        ...overrideForChunk,
                        action: 'subtitle_override',
                        chunk_index: idx,
                        text: text,
                        start: newStart,
                        end: newEnd
                    }]);
                }
            }
        } else {
            const edlKey = trimState.track as 'v1' | 'a1';
            const newEdl = { ...multiTrackEdl, [edlKey]: multiTrackEdl[edlKey].map((clip, i) => {
                if (i !== trimState.clipIndex) return clip;
                return trimState.type === 'left'
                    ? { ...clip, start: previewTrim.time }
                    : { ...clip, end: previewTrim.time };
            })};
            onEdlChange(newEdl);
        }
        setTrimState(null);
        setPreviewTrim(null);
    };

    // Horizontal Clip Dragging Handlers
    const handleDragStart = (e: React.PointerEvent, track: 'v1'|'a1'|'t1'|'v2'|'m1'|'sfx'|'g1'|'s1'|'c1', clipIndex: number, initialStart: number, initialEnd: number) => {
        if (activeTool !== 'pointer') return;
        // Skip if trim handler was clicked
        if ((e.target as HTMLElement).classList.contains('cursor-ew-resize')) return;

        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragState({ track, clipIndex, startX: e.clientX, initialStart, initialEnd, pointerId: e.pointerId });
        setPreviewDrag({ start: initialStart, end: initialEnd });
    };

    const handleDragMove = (e: React.PointerEvent) => {
        if (!dragState || e.pointerId !== dragState.pointerId || !containerRef.current) return;
        const trackWidth = containerRef.current.getBoundingClientRect().width || 1;
        const deltaSec = ((e.clientX - dragState.startX) / trackWidth) * duration;
        
        const clipDur = dragState.initialEnd - dragState.initialStart;
        let newStart = dragState.initialStart + deltaSec;
        newStart = Math.max(0, Math.min(newStart, duration - clipDur));
        setPreviewDrag({ start: newStart, end: newStart + clipDur });
    };

    const handleDragEnd = (e: React.PointerEvent) => {
        if (!dragState || !previewDrag) return;
        e.currentTarget.releasePointerCapture(e.pointerId);

        if (dragState.track === 'v2') {
            if (onActiveEditsChange) {
                const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                const updated = brolls.map((b, i) => {
                    if (i !== dragState.clipIndex) return b;
                    return { ...b, start: previewDrag.start, end: previewDrag.end };
                });
                onActiveEditsChange([...others, ...updated]);
            }
        } else if (dragState.track === 'm1' || dragState.track === 'sfx') {
            if (onActiveEditsChange) {
                const updated = activeEdits.map((asset, i) => {
                    if (i !== dragState.clipIndex) return asset;
                    return { ...asset, start: previewDrag.start, end: previewDrag.end };
                });
                onActiveEditsChange(updated);
            }
        } else if (dragState.track === 'g1') {
            if (onActiveEditsChange) {
                const targetClip = graphicClips[dragState.clipIndex];
                if (targetClip) {
                    const updated = activeEdits.map((ae, i) => {
                        if (i === targetClip.rawIndex) {
                            return { ...ae, start: previewDrag.start, end: previewDrag.end };
                        }
                        return ae;
                    });
                    onActiveEditsChange(updated);
                }
            }
        } else if (dragState.track === 'c1') {
            if (onActiveEditsChange) {
                const targetClip = colorClips[dragState.clipIndex];
                if (targetClip) {
                    const updated = activeEdits.map((ae, i) => {
                        if (i === targetClip.rawIndex) {
                            return { ...ae, start: previewDrag.start, end: previewDrag.end };
                        }
                        return ae;
                    });
                    onActiveEditsChange(updated);
                }
            }
        } else if (dragState.track === 's1') {
            if (onActiveEditsChange) {
                const targetClip = sceneClips[dragState.clipIndex];
                if (targetClip) {
                    const updated = activeEdits.map((ae, i) => {
                        if (i === targetClip.rawIndex) {
                            return { ...ae, start: previewDrag.start, end: previewDrag.end };
                        }
                        return ae;
                    });
                    onActiveEditsChange(updated);
                }
            }
        } else if (dragState.track === 't1') {
            if (onActiveEditsChange) {
                const idx = dragState.clipIndex;
                const chunk = subtitleChunks[idx];
                if (chunk) {
                    const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === idx));
                    const overrideForChunk = activeEdits.find(ae => ae.action === 'subtitle_override' && ae.chunk_index === idx);
                    const spokenText = chunk.words.map((w: any) => w.word).join(' ');
                    const text = overrideForChunk?.text || spokenText || '';
                    onActiveEditsChange([...others, {
                        ...overrideForChunk,
                        action: 'subtitle_override',
                        chunk_index: idx,
                        text: text,
                        start: previewDrag.start,
                        end: previewDrag.end
                    }]);
                }
            }
        } else {
            const edlKey = dragState.track;
            const newEdl = { ...multiTrackEdl, [edlKey]: multiTrackEdl[edlKey as 'v1'|'a1'].map((clip, i) => {
                if (i !== dragState.clipIndex) return clip;
                return { ...clip, start: previewDrag.start, end: previewDrag.end };
            })};
            onEdlChange(newEdl);
        }
        setDragState(null);
        setPreviewDrag(null);
    };

    // Manual clip insertion at playhead
    const handleAddClip = (track: 's1' | 't1' | 'v2' | 'm1' | 'sfx' | 'g1' | 'c1') => {
        if (!onActiveEditsChange) return;

        let newEdit: any = null;
        if (track === 's1') {
            newEdit = {
                action: "semantic_scene",
                start: timelineTime,
                end: Math.min(timelineTime + 3, duration),
                scene_data: {
                    scene_template: "concept_explainer",
                    mood: "neutral",
                    energy: 0.5,
                    entities: [{id: "txt1", type: "headline", text: "New Semantic Scene", visual_role: "title"}],
                    relations: []
                }
            };
        } else if (track === 't1') {
            newEdit = {
                action: "add_text_overlay",
                start: timelineTime,
                end: Math.min(timelineTime + 3, duration),
                text: "custom text",
                fontsize: 80,
                color: "#ffffff",
                use_outline: true
            };
        } else if (track === 'v2') {
            newEdit = {
                action: "add_broll",
                start: timelineTime,
                end: Math.min(timelineTime + 3, duration),
                query: "cyberpunk",
                broll_url: "https://assets.mixkit.co/videos/preview/mixkit-cyberpunk-neon-city-street-wet-with-rain-41865-large.mp4"
            };
        } else if (track === 'm1') {
            newEdit = {
                action: "add_asset",
                start: timelineTime,
                end: duration,
                asset_query: "dj akeeni - my favorite coffee shop.mp3",
                resolved_path: "Music/Background/dj akeeni - my favorite coffee shop.mp3",
                asset_type: "audio",
                volume: -22
            };
        } else if (track === 'sfx') {
            newEdit = {
                action: "add_asset",
                start: timelineTime,
                end: Math.min(timelineTime + 1.5, duration),
                asset_query: "click",
                resolved_path: "SFX Sounds/Клики мышки/Клик 1.mp3",
                asset_type: "audio",
                volume: -10
            };
        } else if (track === 'g1') {
            newEdit = {
                action: "canvas_overlay",
                start: timelineTime,
                end: Math.min(timelineTime + 3, duration),
                style: "modern",
                html_content: `<div id="root" class="clip" data-start="${timelineTime}" data-duration="3" style="width: 1080px; height: 1920px; display: flex; align-items: center; justify-content: center;"><div class="card" style="padding: 40px; background: rgba(0,0,0,0.6); border: 2px solid #f59e0b; border-radius: 20px; font-family: Inter, sans-serif; text-align: center; color: white;"><h2 style="font-size: 64px; margin-bottom: 10px;">PRO DESIGN</h2><p style="font-size: 28px; color: #a1a1aa;">GSAP Powered Graphic</p></div></div>`
            };
        } else if (track === 'c1') {
            newEdit = {
                action: "color_correction",
                start: timelineTime,
                end: Math.min(timelineTime + 3, duration),
                preset: "cinema",
                lut: "cinema",
                brightness: 100,
                contrast: 100,
                saturation: 100,
                hue: 0
            };
        }

        if (newEdit) {
            onActiveEditsChange([...activeEdits, newEdit]);
        }
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const isS1Visible = activeEdits.some(e => e.action === 'scene_override' || e.action === 'semantic_scene') || draggingAssetType === 'graphics';
    const isC1Visible = activeEdits.some(e => e.action === 'color_correction') || draggingAssetType === 'color';
    const isG1Visible = activeEdits.some(e => e.action === 'canvas_overlay' || e.action === 'hyperframes_html' || e.action === 'add_hyperframes_graphics' || e.action === 'add_motion_graphic' || e.action === 'add_dynamic_graphic' || e.action === 'add_text_overlay') || draggingAssetType === 'graphics';
    const isT1Visible = activeEdits.some(e => e.action === 'add_subtitles' || e.action === 'subtitle_override' || e.action === 'add_text_overlay');
    const isV2Visible = activeEdits.some(e => e.action === 'add_broll') || draggingAssetType === 'broll' || draggingAssetType === 'stitch';
    const isSFXVisible = activeEdits.some(e => 
        e.action === 'add_asset' && 
        (e.asset_query?.toLowerCase().includes('sfx') || 
         e.asset_query?.toLowerCase().includes('click') || 
         e.asset_query?.toLowerCase().includes('whoosh') ||
         e.asset_query?.toLowerCase().includes('impact'))
    ) || draggingAssetType === 'sfx';
    const isM1Visible = activeEdits.some(e => 
        e.action === 'add_asset' && 
        !(e.asset_query?.toLowerCase().includes('sfx') || 
          e.asset_query?.toLowerCase().includes('click') || 
          e.asset_query?.toLowerCase().includes('whoosh') ||
          e.asset_query?.toLowerCase().includes('impact'))
    ) || draggingAssetType === 'music';

    const rulerTicks = Array.from({length: 11}, (_, i) => (duration / 10) * i);

    return (
        <div className={`flex flex-col h-full bg-card overflow-hidden rounded-2xl select-none font-mono transition-all duration-300 shadow-sm border border-black/5 dark:border-white/10 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-xl ${
            isFocusSelectionActive 
                ? 'border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/25' 
                : ''
        }`} onClick={() => setSelectedClipId(null)}>

            
            {/* Toolbar Area */}
            <div className="border-b border-black/5 dark:border-white/10 h-8 flex items-center px-3 justify-between shrink-0 z-30 relative shadow-none">
                   <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                    <div className="flex items-center bg-black p-0.5 border border-border rounded-none" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setActiveTool('pointer')}
                            className={`p-1 flex items-center justify-center transition-colors rounded-none cursor-pointer ${activeTool === 'pointer' ? 'bg-zinc-900 text-white font-bold border border-border' : 'text-zinc-550 hover:bg-zinc-900'}`}
                            title="Инструмент выделения (V)"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                        </button>
                        <button 
                            onClick={() => setActiveTool('razor')}
                            className={`p-1 flex items-center justify-center transition-colors rounded-none cursor-pointer ${activeTool === 'razor' ? 'bg-zinc-900 text-white font-bold border border-border' : 'text-zinc-555 hover:bg-zinc-900'}`}
                            title="Инструмент нарезки / Ножницы (C)"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="6" cy="6" r="3" />
                                <circle cx="6" cy="18" r="3" />
                                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                                <line x1="14.47" y1="14.48" x2="20" y2="20" />
                                <line x1="8.12" y1="8.12" x2="12" y2="12" />
                            </svg>
                        </button>
                    </div>

                    {/* Timeline Visual Stretch Zoom Slider */}
                    <div className="flex items-center gap-1.5 select-none" onClick={e => e.stopPropagation()}>
                        <span className="text-[11px] text-zinc-500 lowercase">stretch:</span>
                        <input 
                            type="range" 
                            min="100" 
                            max="1000" 
                            value={zoom} 
                            onChange={(ev) => setZoom(parseInt(ev.target.value, 10))}
                            className="w-16 md:w-28 accent-white h-[2px] bg-zinc-855 appearance-none cursor-pointer focus:outline-none"
                            style={{ background: '#27272a' }}
                            title="Stretch timeline tracks horizontally"
                        />
                        <span className="text-[11px] font-mono text-zinc-400 min-w-[20px]">{zoom}%</span>
                    </div>
                </div>

                {/* Subtitles Animation Picker */}
                {activeEdits.some(e => e.action === 'add_subtitles') && (
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <div className="w-[1px] h-4 bg-zinc-850 mx-1" />
                        <span className="text-[11px] text-zinc-500 lowercase">animation:</span>
                        {isMobile ? (
                            <select
                                value={animStyle}
                                onChange={(e) => setAndSaveAnimStyle(e.target.value)}
                                className="bg-zinc-950 border border-zinc-900 text-zinc-300 text-[11px] px-1 py-0.5 rounded focus:outline-none cursor-pointer"
                            >
                                <option value="fade">fade</option>
                                <option value="pop">pop</option>
                                <option value="slide_up">slide</option>
                                <option value="bounce">bounce</option>
                                <option value="glow">glow</option>
                                <option value="typewriter">type</option>
                                <option value="karaoke">kara</option>
                            </select>
                        ) : (
                            ([
                                { key: 'fade',       label: 'fade' },
                                { key: 'pop',        label: 'pop' },
                                { key: 'slide_up',   label: 'slide' },
                                { key: 'bounce',     label: 'bounce' },
                                { key: 'glow',       label: 'glow' },
                                { key: 'typewriter', label: 'type' },
                                { key: 'karaoke',    label: 'kara' },
                            ] as const).map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setAndSaveAnimStyle(key)}
                                    className={`px-1 py-0.2 border text-[11px] transition-colors rounded-none cursor-pointer ${
                                        animStyle === key
                                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold'
                                            : 'bg-zinc-950 border-zinc-900 text-zinc-550 hover:border-zinc-800 hover:text-zinc-400'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
                  {/* Unified Clip Settings Inspector Panel */}
            {selectedClipId && (() => {
                let clipTitle = "";
                let clipStart = 0;
                let clipEnd = 0;
                let showVolume = false;
                let currentVolume = 0;
                let showTextInput = false;
                let textValue = "";
                let colorTheme = "border-zinc-800 text-zinc-350";
                
                // Parsers
                if (selectedClipId.startsWith('V2-Broll-')) {
                    const idx = parseInt(selectedClipId.replace('V2-Broll-', ''), 10);
                    const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                    const b = brolls[idx];
                    if (!b) return null;
                    clipTitle = `🎞️ B-Roll: "${b.query || 'stock'}"`;
                    clipStart = b.start != null ? b.start : 0;
                    clipEnd = b.end != null ? b.end : duration;
                    colorTheme = "border-cyan-850/60 text-cyan-400";
                } 
                else if (selectedClipId.startsWith('M1-Music-')) {
                    const idx = parseInt(selectedClipId.replace('M1-Music-', ''), 10);
                    const bgm = activeEdits[idx];
                    if (!bgm) return null;
                    clipTitle = `🎵 Music: "${bgm.asset_query || 'music'}"`;
                    clipStart = bgm.start != null ? bgm.start : 0;
                    clipEnd = bgm.end != null ? bgm.end : duration;
                    showVolume = true;
                    currentVolume = bgm.volume || -22;
                    colorTheme = "border-emerald-850/60 text-emerald-400";
                }
                else if (selectedClipId.startsWith('SFX-Asset-')) {
                    const idx = parseInt(selectedClipId.replace('SFX-Asset-', ''), 10);
                    const sfx = activeEdits[idx];
                    if (!sfx) return null;
                    clipTitle = `🔊 SFX: "${sfx.asset_query || 'sfx'}"`;
                    clipStart = sfx.start != null ? sfx.start : 0;
                    clipEnd = sfx.end != null ? sfx.end : duration;
                    showVolume = true;
                    currentVolume = sfx.volume || -10;
                    colorTheme = "border-amber-850/60 text-amber-400";
                }
                else if (selectedClipId.startsWith('S1-Scene-')) {
                    const parts = selectedClipId.split('-');
                    const idx = parseInt(parts[parts.length - 1], 10);
                    const targetClip = sceneClips[idx];
                    if (!targetClip) return null;
                    const scene = activeEdits[targetClip.rawIndex] as any;
                    if (!scene) return null;
                    clipTitle = `🎬 Scene: "${scene.scene_data?.scene_template || scene.style || 'semantic'}"`;
                    clipStart = scene.start != null ? scene.start : 0;
                    clipEnd = scene.end != null ? scene.end : duration;
                    colorTheme = "border-purple-850/60 text-purple-400";
                }
                else if (selectedClipId.startsWith('T1-Sub-')) {
                    const idx = parseInt(selectedClipId.replace('T1-Sub-', ''), 10);
                    const chunk = subtitleChunks[idx];
                    if (!chunk) return null;
                    
                    const overrideEdits = activeEdits.filter(e => e.action === 'subtitle_override');
                    const overrideForChunk = overrideEdits.find(e => e.chunk_index === idx);
                    const spokenText = chunk.words.map((w: any) => w.word).join(' ');
                    
                    clipTitle = `💬 Subtitles Block #${idx + 1}`;
                    clipStart = chunk.start;
                    clipEnd = chunk.end;
                    showTextInput = true;
                    textValue = overrideForChunk?.text || spokenText || '';
                    colorTheme = "border-blue-850/60 text-blue-400";
                }
                else if (selectedClipId.startsWith('G1-Graphic-')) {
                    const parts = selectedClipId.split('-');
                    const idx = parseInt(parts[parts.length - 1], 10);
                    const targetClip = graphicClips[idx];
                    if (!targetClip) return null;
                    const graphic = activeEdits[targetClip.rawIndex];
                    if (!graphic) return null;
                    clipTitle = `🎨 Graphic: ${targetClip.label}`;
                    clipStart = graphic.start != null ? graphic.start : 0;
                    clipEnd = graphic.end != null ? graphic.end : duration;
                    colorTheme = "border-fuchsia-850/60 text-fuchsia-400";
                }
                else if (selectedClipId.startsWith('C1-Color-')) {
                    const idx = parseInt(selectedClipId.replace('C1-Color-', ''), 10);
                    const colors = activeEdits.filter(ae => ae.action === 'color_correction');
                    const c = colors[idx];
                    if (!c) return null;
                    clipTitle = `🎨 Цветокор: пресет "${c.preset || c.lut || 'cinema'}"`;
                    clipStart = c.start != null ? c.start : 0;
                    clipEnd = c.end != null ? c.end : duration;
                    colorTheme = "border-amber-500/60 text-amber-500";
                }
                else if (selectedClipId.startsWith('V1-Video-')) {
                    const idx = parseInt(selectedClipId.replace('V1-Video-', ''), 10);
                    const clip = multiTrackEdl.v1[idx];
                    if (!clip) return null;
                    clipTitle = `🎞️ Video v1 Cut #${idx + 1}`;
                    clipStart = clip.start;
                    clipEnd = clip.end;
                    colorTheme = "border-zinc-800 text-zinc-350";
                }
                else if (selectedClipId.startsWith('A1-Audio-')) {
                    const idx = parseInt(selectedClipId.replace('A1-Audio-', ''), 10);
                    const clip = multiTrackEdl.a1[idx];
                    if (!clip) return null;
                    clipTitle = `🎙️ Audio a1 Cut #${idx + 1}`;
                    clipStart = clip.start;
                    clipEnd = clip.end;
                    colorTheme = "border-zinc-800 text-zinc-350";
                }
                else {
                    return null;
                }

                // Generic Update Handler
                const handleManualUpdate = (newStart: number, newEnd: number, newVol?: number, newTxt?: string) => {
                    newStart = Number(Math.max(0, Math.min(newStart, duration)).toFixed(2));
                    newEnd = Number(Math.max(newStart + 0.1, Math.min(newEnd, duration)).toFixed(2));

                    if (selectedClipId.startsWith('V2-Broll-')) {
                        const idx = parseInt(selectedClipId.replace('V2-Broll-', ''), 10);
                        if (onActiveEditsChange) {
                            const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                            const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                            const updated = brolls.map((b, i) => i === idx ? { ...b, start: newStart, end: newEnd } : b);
                            onActiveEditsChange([...others, ...updated]);
                        }
                    }
                    else if (selectedClipId.startsWith('M1-Music-')) {
                        const idx = parseInt(selectedClipId.replace('M1-Music-', ''), 10);
                        if (onActiveEditsChange) {
                            const updated = [...activeEdits];
                            updated[idx] = { ...activeEdits[idx], start: newStart, end: newEnd, volume: newVol !== undefined ? newVol : currentVolume };
                            onActiveEditsChange(updated);
                        }
                    }
                    else if (selectedClipId.startsWith('SFX-Asset-')) {
                        const idx = parseInt(selectedClipId.replace('SFX-Asset-', ''), 10);
                        if (onActiveEditsChange) {
                            const updated = [...activeEdits];
                            updated[idx] = { ...activeEdits[idx], start: newStart, end: newEnd, volume: newVol !== undefined ? newVol : currentVolume };
                            onActiveEditsChange(updated);
                        }
                    }
                    else if (selectedClipId.startsWith('S1-Scene-')) {
                        const parts = selectedClipId.split('-');
                        const idx = parseInt(parts[parts.length - 1], 10);
                        const targetClip = sceneClips[idx];
                        if (targetClip && onActiveEditsChange) {
                            const updated = activeEdits.map((ae, i) => i === targetClip.rawIndex ? { ...ae, start: newStart, end: newEnd } : ae);
                            onActiveEditsChange(updated);
                        }
                    }
                    else if (selectedClipId.startsWith('T1-Sub-')) {
                        const idx = parseInt(selectedClipId.replace('T1-Sub-', ''), 10);
                        if (onActiveEditsChange) {
                            const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === idx));
                            const text = newTxt !== undefined ? newTxt : textValue;
                            onActiveEditsChange([...others, { action: 'subtitle_override', chunk_index: idx, text, start: newStart, end: newEnd }]);
                        }
                    }
                    else if (selectedClipId.startsWith('G1-Graphic-')) {
                        const parts = selectedClipId.split('-');
                        const idx = parseInt(parts[parts.length - 1], 10);
                        const targetClip = graphicClips[idx];
                        if (targetClip && onActiveEditsChange) {
                            const updated = activeEdits.map((ae, i) => i === targetClip.rawIndex ? { ...ae, start: newStart, end: newEnd } : ae);
                            onActiveEditsChange(updated);
                        }
                    }
                    else if (selectedClipId.startsWith('C1-Color-')) {
                        const idx = parseInt(selectedClipId.replace('C1-Color-', ''), 10);
                        if (onActiveEditsChange) {
                            const colors = activeEdits.filter(ae => ae.action === 'color_correction');
                            const others = activeEdits.filter(ae => ae.action !== 'color_correction');
                            const updated = colors.map((c, i) => i === idx ? { ...c, start: newStart, end: newEnd } : c);
                            onActiveEditsChange([...others, ...updated]);
                        }
                    }
                    else if (selectedClipId.startsWith('V1-Video-')) {
                        const idx = parseInt(selectedClipId.replace('V1-Video-', ''), 10);
                        const newEdl = { ...multiTrackEdl };
                        newEdl.v1 = newEdl.v1.map((c, i) => i === idx ? { ...c, start: newStart, end: newEnd } : c);
                        onEdlChange(newEdl);
                    }
                    else if (selectedClipId.startsWith('A1-Audio-')) {
                        const idx = parseInt(selectedClipId.replace('A1-Audio-', ''), 10);
                        const newEdl = { ...multiTrackEdl };
                        newEdl.a1 = newEdl.a1.map((c, i) => i === idx ? { ...c, start: newStart, end: newEnd } : c);
                        onEdlChange(newEdl);
                    }
                };

                // Deletion handler
                const handleManualDelete = () => {
                    if (selectedClipId.startsWith('V2-Broll-')) {
                        const idx = parseInt(selectedClipId.replace('V2-Broll-', ''), 10);
                        if (onActiveEditsChange) {
                            const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                            const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                            onActiveEditsChange([...others, ...brolls.filter((_, i) => i !== idx)]);
                        }
                    }
                    else if (selectedClipId.startsWith('M1-Music-') || selectedClipId.startsWith('SFX-Asset-')) {
                        const idx = parseInt(selectedClipId.split('-').pop() || "0", 10);
                        if (onActiveEditsChange) {
                            onActiveEditsChange(activeEdits.filter((_, i) => i !== idx));
                        }
                    }
                    else if (selectedClipId.startsWith('S1-Scene-')) {
                        const parts = selectedClipId.split('-');
                        const idx = parseInt(parts[parts.length - 1], 10);
                        const targetClip = sceneClips[idx];
                        if (targetClip && onActiveEditsChange) {
                            const updated = activeEdits.filter((_, i) => i !== targetClip.rawIndex);
                            onActiveEditsChange(updated);
                        }
                    }
                    else if (selectedClipId.startsWith('T1-Sub-')) {
                        const idx = parseInt(selectedClipId.replace('T1-Sub-', ''), 10);
                        if (onActiveEditsChange) {
                            const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === idx));
                            onActiveEditsChange([...others, { action: 'subtitle_override', chunk_index: idx, deleted: true }]);
                        }
                    }
                    else if (selectedClipId.startsWith('G1-Graphic-')) {
                        const parts = selectedClipId.split('-');
                        const idx = parseInt(parts[parts.length - 1], 10);
                        const targetClip = graphicClips[idx];
                        if (targetClip && onActiveEditsChange) {
                            const updated = activeEdits.filter((_, i) => i !== targetClip.rawIndex);
                            onActiveEditsChange(updated);
                        }
                    }
                    else if (selectedClipId.startsWith('C1-Color-')) {
                        const idx = parseInt(selectedClipId.replace('C1-Color-', ''), 10);
                        if (onActiveEditsChange) {
                            const colors = activeEdits.filter(ae => ae.action === 'color_correction');
                            const others = activeEdits.filter(ae => ae.action !== 'color_correction');
                            onActiveEditsChange([...others, ...colors.filter((_, i) => i !== idx)]);
                        }
                        setSelectedClipId(null);
                    }
                    else if (selectedClipId.startsWith('V1-Video-')) {
                        const idx = parseInt(selectedClipId.replace('V1-Video-', ''), 10);
                        const newEdl = { ...multiTrackEdl, v1: multiTrackEdl.v1.filter((_, i) => i !== idx) };
                        onEdlChange(newEdl);
                    }
                    else if (selectedClipId.startsWith('A1-Audio-')) {
                        const idx = parseInt(selectedClipId.replace('A1-Audio-', ''), 10);
                        const newEdl = { ...multiTrackEdl, a1: multiTrackEdl.a1.filter((_, i) => i !== idx) };
                        onEdlChange(newEdl);
                    }
                    setSelectedClipId(null);
                };

                const showSplit = timelineTime > clipStart && timelineTime < clipEnd;

                const handleManualSplit = () => {
                    const splitTime = timelineTime;
                    if (selectedClipId.startsWith('V2-Broll-')) {
                        const idx = parseInt(selectedClipId.replace('V2-Broll-', ''), 10);
                        if (onActiveEditsChange) {
                            const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                            const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                            const target = brolls[idx];
                            const first = { ...target, end: splitTime };
                            const second = { ...target, start: splitTime };
                            const updatedBrolls = [...brolls];
                            updatedBrolls.splice(idx, 1, first, second);
                            onActiveEditsChange([...others, ...updatedBrolls]);
                            setSelectedClipId(`V2-Broll-${idx + 1}`);
                        }
                    }
                    else if (selectedClipId.startsWith('M1-Music-') || selectedClipId.startsWith('SFX-Asset-')) {
                        const idx = parseInt(selectedClipId.split('-').pop() || "0", 10);
                        if (onActiveEditsChange) {
                            const target = activeEdits[idx];
                            const first = { ...target, end: splitTime };
                            const second = { ...target, start: splitTime };
                            const updated = [...activeEdits];
                            updated.splice(idx, 1, first, second);
                            onActiveEditsChange(updated);
                            setSelectedClipId(`${selectedClipId.split('-')[0]}-${selectedClipId.split('-')[1]}-${idx + 1}`);
                        }
                    }
                    else if (selectedClipId.startsWith('S1-Scene-')) {
                        const parts = selectedClipId.split('-');
                        const idx = parseInt(parts[parts.length - 1], 10);
                        const targetClip = sceneClips[idx];
                        if (targetClip && onActiveEditsChange) {
                            const target = activeEdits[targetClip.rawIndex];
                            const first = { ...target, end: splitTime };
                            const second = { ...target, start: splitTime };
                            const updated = [...activeEdits];
                            updated.splice(targetClip.rawIndex, 1, first, second);
                            onActiveEditsChange(updated);
                            setSelectedClipId(`S1-Scene-${targetClip.id}-${idx + 1}`);
                        }
                    }
                    else if (selectedClipId.startsWith('T1-Sub-')) {
                        const idx = parseInt(selectedClipId.replace('T1-Sub-', ''), 10);
                        const newEdl = { ...multiTrackEdl };
                        const clip = newEdl.v1[idx];
                        newEdl.v1.splice(idx, 1, 
                            {start: clip.start, end: splitTime - 0.01},
                            {start: splitTime + 0.01, end: clip.end}
                        );
                        onEdlChange(newEdl);
                        setSelectedClipId(`T1-Sub-${idx + 1}`);
                    }
                    else if (selectedClipId.startsWith('G1-Graphic-')) {
                        const parts = selectedClipId.split('-');
                        const idx = parseInt(parts[parts.length - 1], 10);
                        const targetClip = graphicClips[idx];
                        if (targetClip && onActiveEditsChange) {
                            const target = activeEdits[targetClip.rawIndex];
                            const first = { ...target, end: splitTime };
                            const second = { ...target, start: splitTime };
                            const updated = [...activeEdits];
                            updated.splice(targetClip.rawIndex, 1, first, second);
                            onActiveEditsChange(updated);
                            setSelectedClipId(`G1-Graphic-${parts[parts.length - 2]}-${idx + 1}`);
                        }
                    }
                    else if (selectedClipId.startsWith('C1-Color-')) {
                        const idx = parseInt(selectedClipId.replace('C1-Color-', ''), 10);
                        if (onActiveEditsChange) {
                            const colors = activeEdits.filter(ae => ae.action === 'color_correction');
                            const others = activeEdits.filter(ae => ae.action !== 'color_correction');
                            const target = colors[idx];
                            const first = { ...target, end: splitTime };
                            const second = { ...target, start: splitTime };
                            const updatedColors = [...colors];
                            updatedColors.splice(idx, 1, first, second);
                            onActiveEditsChange([...others, ...updatedColors]);
                            setSelectedClipId(`C1-Color-${idx + 1}`);
                        }
                    }
                    else if (selectedClipId.startsWith('V1-Video-')) {
                        const idx = parseInt(selectedClipId.replace('V1-Video-', ''), 10);
                        const newEdl = { ...multiTrackEdl };
                        const clip = newEdl.v1[idx];
                        newEdl.v1.splice(idx, 1, 
                            {start: clip.start, end: splitTime - 0.01},
                            {start: splitTime + 0.01, end: clip.end}
                        );
                        onEdlChange(newEdl);
                        setSelectedClipId(`V1-Video-${idx + 1}`);
                    }
                    else if (selectedClipId.startsWith('A1-Audio-')) {
                        const idx = parseInt(selectedClipId.replace('A1-Audio-', ''), 10);
                        const newEdl = { ...multiTrackEdl };
                        const clip = newEdl.a1[idx];
                        newEdl.a1.splice(idx, 1, 
                            {start: clip.start, end: splitTime - 0.01},
                            {start: splitTime + 0.01, end: clip.end}
                        );
                        onEdlChange(newEdl);
                        setSelectedClipId(`A1-Audio-${idx + 1}`);
                    }
                };

                return (
                    <div 
                        className="bg-[#0b0b0f] border-b border-white/5 px-2.5 py-1.5 md:py-2 flex flex-wrap md:flex-nowrap items-center justify-between gap-2 md:gap-3 z-30 shrink-0 select-none font-sans" 
                        onClick={e => e.stopPropagation()}
                        style={{ background: 'rgba(11, 11, 15, 0.95)', backdropFilter: 'blur(20px)' }}
                    >
                        {/* 1. Title / Info */}
                        <div className="flex items-center gap-1.5 max-w-full">
                            <div className={`h-4.5 px-1 md:px-1.5 rounded border flex items-center justify-center text-[9px] md:text-[11px] font-bold uppercase font-mono ${colorTheme} bg-zinc-950/60 shadow-inner`}>
                                settings
                            </div>
                            <span className="text-[11px] md:text-[13px] text-zinc-100 font-bold truncate max-w-[130px] md:max-w-[280px]">
                                {clipTitle}
                            </span>
                        </div>

                        {/* 2. Numeric inputs: Start / End / Duration */}
                        <div className="flex items-center flex-wrap gap-3 md:gap-6 text-zinc-350 text-[11px] md:text-[17px] font-medium">
                            <div className="flex items-center gap-1">
                                <span className="text-zinc-500 font-mono text-[9px] md:text-[11px] uppercase font-bold">in</span>
                                <input 
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max={duration}
                                    value={Number(clipStart.toFixed(2))}
                                    onChange={(ev) => handleManualUpdate(parseFloat(ev.target.value) || 0, clipEnd)}
                                    className="w-10 bg-zinc-950/80 border border-white/10 rounded px-1 py-0.5 text-[10px] md:text-[11px] font-mono text-zinc-100 focus:outline-none focus:border-amber-500/40 text-center shadow-sm"
                                />
                                <span className="text-zinc-650 font-mono text-[9px] md:text-[11px]">s</span>
                            </div>

                            <div className="flex items-center gap-1">
                                <span className="text-zinc-500 font-mono text-[9px] md:text-[11px] uppercase font-bold">out</span>
                                <input 
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max={duration}
                                    value={Number(clipEnd.toFixed(2))}
                                    onChange={(ev) => handleManualUpdate(clipStart, parseFloat(ev.target.value) || duration)}
                                    className="w-10 bg-zinc-950/80 border border-white/10 rounded px-1 py-0.5 text-[10px] md:text-[11px] font-mono text-zinc-100 focus:outline-none focus:border-amber-500/40 text-center shadow-sm"
                                />
                                <span className="text-zinc-650 font-mono text-[9px] md:text-[11px]">s</span>
                            </div>

                            <div className="flex items-center gap-1">
                                <span className="text-zinc-500 font-mono text-[9px] md:text-[11px] uppercase font-bold">dur</span>
                                <span className="text-zinc-300 font-mono font-bold bg-white/5 border border-white/5 rounded px-1.5 py-0.5 text-[10px] md:text-[11px] select-none">
                                    {(clipEnd - clipStart).toFixed(1)}s
                                </span>
                            </div>
                        </div>

                        {/* 3. Text inputs / Volume Sliders */}
                        {showVolume && (
                            <div className="flex-1 min-w-[100px] max-w-[280px] flex items-center gap-2">
                                <span className="text-zinc-500 font-mono text-[9px] md:text-[11px] uppercase font-bold">vol</span>
                                <input 
                                    type="range" 
                                    min="-40" 
                                    max="0" 
                                    value={currentVolume} 
                                    onChange={(ev) => handleManualUpdate(clipStart, clipEnd, parseInt(ev.target.value, 10))}
                                    className="flex-1 accent-white h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer focus:outline-none"
                                />
                                <span className="text-[10px] md:text-[11px] font-mono text-zinc-100 bg-zinc-950/80 px-1 py-0.5 border border-white/10 rounded min-w-[30px] md:min-w-[35px] text-center shadow-sm">
                                    {currentVolume}dB
                                </span>
                            </div>
                        )}

                        {showTextInput && (
                            <div className="flex-1 min-w-[120px] max-w-[340px] flex items-center gap-1.5">
                                <span className="text-zinc-500 font-mono text-[9px] md:text-[11px] uppercase font-bold">text</span>
                                <input 
                                    type="text" 
                                    value={textValue} 
                                    onChange={(ev) => handleManualUpdate(clipStart, clipEnd, undefined, ev.target.value)}
                                    className="flex-1 bg-zinc-950/80 border border-white/10 rounded px-2 py-0.5 text-[10px] md:text-[11px] text-zinc-100 focus:outline-none focus:border-amber-500/40 shadow-sm"
                                    placeholder="Enter text..."
                                />
                            </div>
                        )}

                        {/* 4. Delete button */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            {showSplit && (
                                <button
                                    onClick={handleManualSplit}
                                    className="h-5 px-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-0.5 active:scale-95 shadow-sm"
                                    title="Split clip"
                                >
                                    <span>split</span>
                                </button>
                            )}
                            <button
                                onClick={handleManualDelete}
                                className="h-5 px-1.5 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 hover:border-red-500/50 text-red-400 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-0.5 active:scale-95 shadow-sm"
                                title="Delete clip"
                            >
                                <span>delete</span>
                            </button>
                            <button
                                onClick={() => setSelectedClipId(null)}
                                className="h-5 w-5 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-400 hover:text-white rounded flex items-center justify-center text-[10px] font-bold cursor-pointer transition-all active:scale-90"
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Tracks Container */}
            <div className={`flex flex-1 relative overflow-y-auto overflow-x-auto bg-background scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent transition-all duration-300 ${
                isFocusSelectionActive ? 'cursor-crosshair' : ''
            }`}>
                <div className="w-16 md:w-24 bg-[#0a0a0c]/90 border-r border-white/5 flex flex-col z-20 flex-shrink-0 sticky left-0 font-mono text-[17px] text-zinc-500 backdrop-blur-md">
                    <div className="h-6 shrink-0 bg-[#08080a] sticky top-0 z-30 border-b border-white/5 flex items-center justify-center">
                        <button
                            onClick={onTogglePlay}
                            className="flex items-center justify-center w-5 h-5 rounded hover:bg-white/10 transition-colors text-white cursor-pointer"
                            title="Play / Pause"
                        >
                            {isPlaying
                                ? <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                : <svg className="w-2.5 h-2.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            }
                        </button>
                    </div>
                    
                    {/* S1 Track Header */}
                    {isS1Visible && (
                        <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="px-1 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">S1</span>
                                <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">scenes</span>
                            </div>
                            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Toggle visibility">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Mute track">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                                </button>
                                <button 
                                    onClick={(ev) => { ev.stopPropagation(); handleAddClip('s1'); }}
                                    className="w-3.5 h-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-white/10 text-neutral-355 hover:text-white flex items-center justify-center cursor-pointer rounded transition-all font-bold text-[8px]"
                                    title="Add Scene Override"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )}

                    {/* G1 Track Header */}
                    {isG1Visible && (
                        <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="px-1 py-0.5 bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">G1</span>
                                <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">graphics</span>
                            </div>
                            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Toggle visibility">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Mute track">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                                </button>
                                <button 
                                    onClick={(ev) => { ev.stopPropagation(); handleAddClip('g1'); }}
                                    className="w-3.5 h-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-white/10 text-neutral-355 hover:text-white flex items-center justify-center cursor-pointer rounded transition-all font-bold text-[8px]"
                                    title="Add Motion Graphic"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )}

                    {/* T1 Track Header */}
                    {isT1Visible && (
                        <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="px-1 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">T1</span>
                                <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">text</span>
                            </div>
                            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-255 cursor-pointer transition-colors" title="Toggle visibility">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-255 cursor-pointer transition-colors" title="Mute track">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                                </button>
                                <button 
                                    onClick={(ev) => { ev.stopPropagation(); handleAddClip('t1'); }}
                                    className="w-3.5 h-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-white/10 text-neutral-355 hover:text-white flex items-center justify-center cursor-pointer rounded transition-all font-bold text-[8px]"
                                    title="Add Custom Subtitle/Text"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )}

                    {/* V2 Track Header */}
                    {isV2Visible && (
                        <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="px-1 py-0.5 bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">V2</span>
                                <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">b-roll</span>
                            </div>
                            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Toggle visibility">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Mute track">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                                </button>
                                <button 
                                    onClick={(ev) => { ev.stopPropagation(); handleAddClip('v2'); }}
                                    className="w-3.5 h-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-white/10 text-neutral-355 hover:text-white flex items-center justify-center cursor-pointer rounded transition-all font-bold text-[8px]"
                                    title="Add Stock B-Roll Video"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )}

                    {/* C1 Track Header */}
                    {isC1Visible && (
                        <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="px-1 py-0.5 bg-amber-500/15 text-amber-500 border border-amber-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">C1</span>
                                <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">цветокор</span>
                            </div>
                            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                                <button 
                                    onClick={(ev) => { ev.stopPropagation(); handleAddClip('c1'); }}
                                    className="w-3.5 h-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-white/10 text-neutral-355 hover:text-white flex items-center justify-center cursor-pointer rounded transition-all font-bold text-[8px]"
                                    title="Добавить цветокоррекцию"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )}

                    {/* V1 Track Header */}
                    <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                        <div className="flex items-center gap-1 min-w-0">
                            <span className="px-1 py-0.5 bg-neutral-500/15 text-neutral-400 border border-neutral-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">V1</span>
                            <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">video</span>
                        </div>
                        <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                            <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Toggle visibility">
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </button>
                            <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Mute track">
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Premiere Pro style separator */}
                    <div className="h-1 bg-neutral-900/50 border-y border-white/5 shrink-0" />

                    {/* A1 Track Header */}
                    <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                        <div className="flex items-center gap-1 min-w-0">
                            <span className="px-1 py-0.5 bg-teal-500/15 text-teal-400 border border-teal-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">A1</span>
                            <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">audio</span>
                        </div>
                        <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                            <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Toggle visibility">
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </button>
                            <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Mute track">
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* SFX Track Header */}
                    {isSFXVisible && (
                        <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="px-1 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">SFX</span>
                                <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">sfx</span>
                            </div>
                            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-255 cursor-pointer transition-colors" title="Toggle visibility">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-255 cursor-pointer transition-colors" title="Mute track">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                                </button>
                                <button 
                                    onClick={(ev) => { ev.stopPropagation(); handleAddClip('sfx'); }}
                                    className="w-3.5 h-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-white/10 text-neutral-355 hover:text-white flex items-center justify-center cursor-pointer rounded transition-all font-bold text-[8px]"
                                    title="Add Sound Effect"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )}

                    {/* M1 Track Header */}
                    {isM1Visible && (
                        <div className="h-10 border-b border-white/5 bg-transparent flex flex-row items-center justify-between px-1 md:px-1.5 uppercase hover:bg-white/5 select-none group/track transition-all">
                            <div className="flex items-center gap-1 min-w-0">
                                <span className="px-1 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded font-bold text-[9px] md:text-[7px] font-mono shrink-0">M1</span>
                                <span className="hidden md:inline text-[7.5px] text-neutral-450 font-bold tracking-tighter truncate uppercase">music</span>
                            </div>
                            <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0">
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Toggle visibility">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                                <button className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-neutral-250 cursor-pointer transition-colors" title="Mute track">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                                </button>
                                <button 
                                    onClick={(ev) => { ev.stopPropagation(); handleAddClip('m1'); }}
                                    className="w-3.5 h-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-white/10 text-neutral-350 hover:text-white flex items-center justify-center cursor-pointer rounded transition-all font-bold text-[8px]"
                                    title="Add Background Music"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Right Side: Multi-track Timeline Channels */}
                <div 
                    className="flex-1 flex flex-col relative shrink-0" 
                    ref={containerRef}
                    style={{ 
                        width: `${zoom}%`, 
                        minWidth: `${Math.max(100, zoom)}%` 
                    }}
                >
                    {/* Time Ruler / Scrub area */}
                    <div 
                        className="h-6 bg-card border-b border-border flex items-center relative cursor-ew-resize z-20 sticky top-0"
                        onPointerDown={handleScrubStart}
                    >
                        {rulerTicks.map((t, i) => (
                            <div 
                                key={i} 
                                className="absolute flex flex-col items-start"
                                style={{ left: `${(t / duration) * 100}%` }}
                            >
                                <div className="h-1.5 w-[1px] bg-zinc-700" />
                                <span className="text-[11px] font-mono text-zinc-650 ml-1 mt-0.5">{formatTime(t)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col relative w-full">
                        {/* S1 (Scenes) Track */}
                        {isS1Visible && (
                            <div 
                                onDragOver={(e) => handleDragOver(e, 's1')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 's1')}
                                className={`h-10 border-b border-purple-950/10 bg-purple-950/5 relative flex items-center px-1 transition-all ${
                                    dragOverTrack === 's1' 
                                        ? 'bg-purple-900/20 border-purple-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(168,85,247,0.15)] animate-pulse' 
                                        : ''
                                }`}
                            >
                                {sceneClips.map((clip, i) => {
                                    const clipId = `S1-Scene-${clip.id}-${i}`;
                                    const isSelected = selectedClipId === clipId;
                                    const clipStart = clip.start;
                                    const clipEnd = clip.end;

                                    return (
                                        <div
                                            key={clipId}
                                            onClick={(e) => handleClipClick(e, clipId, clip, i, 's1')}
                                            onPointerDown={(e) => handleDragStart(e, 's1', i, clip.start, clip.end)}
                                            onPointerMove={handleDragMove}
                                            onPointerUp={handleDragEnd}
                                            className={`touch-none absolute h-[32px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all ${
                                                isSelected 
                                                    ? 'bg-purple-900 border-purple-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(168,85,247,0.3)]' 
                                                    : 'bg-purple-950/30 border-purple-900/50 hover:border-purple-600 text-purple-200'
                                            }`}
                                            style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                        >
                                            <span className="text-[9px] absolute left-2 font-mono truncate right-2 font-medium">🎬 Scene: {clip.label} template</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* G1 (Graphics) Track */}
                        {isG1Visible && (
                            <div 
                                onDragOver={(e) => handleDragOver(e, 'g1')}
                                // Reuse drag end callback
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'g1')}
                                className={`h-10 border-b border-fuchsia-950/10 bg-fuchsia-950/5 relative flex items-center px-1 transition-all ${
                                    dragOverTrack === 'g1' 
                                        ? 'bg-fuchsia-900/20 border-fuchsia-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(217,70,239,0.15)]' 
                                        : ''
                                }`}
                            >
                                {graphicClips.map((clip, i) => {
                                    const clipId = `G1-Graphic-${clip.id}-${i}`;
                                    const isSelected = selectedClipId === clipId;
                                    const clipStart = clip.start;
                                    const clipEnd = clip.end;

                                    const isDraggingThis = dragState?.track === 'g1' && dragState.clipIndex === i;

                                    return (
                                        <div
                                            key={clipId}
                                            onClick={(e) => handleClipClick(e, clipId, clip, i, 'g1')}
                                            onPointerDown={(e) => handleDragStart(e, 'g1', i, clip.start, clip.end)}
                                            onPointerMove={handleDragMove}
                                            onPointerUp={handleDragEnd}
                                            className={`touch-none absolute h-[32px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/g1 ${
                                                isSelected 
                                                    ? 'bg-fuchsia-900 border-fuchsia-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(217,70,239,0.3)]' 
                                                    : 'bg-fuchsia-950/30 border-fuchsia-900/50 hover:border-fuchsia-600 text-fuchsia-200'
                                            }`}
                                            style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                        >
                                            <span className="text-[9px] absolute left-2 font-mono pointer-events-none truncate right-2 font-medium">✨ Graphic: {clip.label.toLowerCase()}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* T1 (Subtitles) Track */}
                        {isT1Visible && (
                            <div 
                                onDragOver={(e) => handleDragOver(e, 't1')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 't1')}
                                className={`h-10 border-b border-blue-950/10 bg-blue-950/5 relative flex items-center px-1 transition-all ${
                                    dragOverTrack === 't1' 
                                        ? 'bg-blue-900/20 border-blue-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(59,130,246,0.15)]' 
                                        : ''
                                }`}
                            >
                                {subtitleChunks.map((chunk, i) => {
                                    const clipId = `T1-Sub-${i}`;
                                    const isSelected = selectedClipId === clipId || (selectedSubIndices && selectedSubIndices.includes(i));
                                    const overrideEdits = activeEdits.filter(e => e.action === 'subtitle_override');
                                    const overrideForChunk = overrideEdits.find(e => e.chunk_index === i);
                                    
                                    const spokenText = chunk.words.map((w: any) => w.word).join(' ');
                                    const label = overrideForChunk?.text || spokenText || 'subtitles';

                                    const rawStart = overrideForChunk?.start != null ? overrideForChunk.start : chunk.start;
                                    const rawEnd = overrideForChunk?.end != null ? overrideForChunk.end : chunk.end;

                                    const isDraggingThis = dragState?.track === 't1' && dragState.clipIndex === i;
                                    const clipStart = isDraggingThis && previewDrag ? previewDrag.start : (trimState?.clipIndex === i && trimState.track === 't1' && trimState.type === 'left' && previewTrim ? previewTrim.time : rawStart);
                                    const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : (trimState?.clipIndex === i && trimState.track === 't1' && trimState.type === 'right' && previewTrim ? previewTrim.time : rawEnd);

                                    const isEditing = editingChunk?.index === i;
                                    const isDeleted = overrideForChunk?.deleted === true;

                                    if (isDeleted) return null;

                                    return (
                                        <div
                                            key={clipId}
                                            title="click to select | double click to edit | drag to move | trim edges"
                                            onClick={(e) => handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 't1')}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                setEditingChunk({ index: i, text: label });
                                            }}
                                            onPointerDown={(e) => handleDragStart(e, 't1', i, rawStart, rawEnd)}
                                            onPointerMove={handleDragMove}
                                            onPointerUp={handleDragEnd}
                                            className={`touch-none absolute h-[32px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/t1 ${
                                                isSelected 
                                                    ? 'bg-blue-900 border-blue-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(59,130,246,0.3)]' 
                                                    : 'bg-blue-950/30 border-blue-900/50 hover:border-blue-600 text-blue-200'
                                            }`}
                                            style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                        >
                                            {isEditing ? (
                                                <input
                                                    ref={editInputRef}
                                                    value={editingChunk!.text}
                                                    onChange={ev => setEditingChunk({ index: i, text: ev.target.value })}
                                                    onClick={e => e.stopPropagation()}
                                                    onDoubleClick={e => e.stopPropagation()}
                                                    onKeyDown={e => {
                                                        e.stopPropagation();
                                                        if (e.key === 'Enter' || e.key === 'Escape') {
                                                            if (e.key === 'Enter' && onActiveEditsChange) {
                                                                 const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === i));
                                                                 onActiveEditsChange([...others, { ...overrideForChunk, action: 'subtitle_override', chunk_index: i, text: editingChunk!.text, start: rawStart, end: rawEnd }]);
                                                            }
                                                            setEditingChunk(null);
                                                        }
                                                    }}
                                                    onKeyUp={e => e.stopPropagation()}
                                                    onBlur={() => {
                                                        if (onActiveEditsChange) {
                                                            const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === i));
                                                            onActiveEditsChange([...others, { ...overrideForChunk, action: 'subtitle_override', chunk_index: i, text: editingChunk!.text, start: rawStart, end: rawEnd }]);
                                                        }
                                                        setEditingChunk(null);
                                                    }}
                                                    className="absolute inset-0 w-full h-full bg-black text-foreground text-[11px] font-mono px-1.5 outline-none border border-white rounded-none z-30"
                                                />
                                            ) : (
                                                <span className="absolute text-[9px] font-mono ml-1.5 pointer-events-none truncate right-3 left-3 font-medium">
                                                    💬 {label}
                                                </span>
                                            )}
                                            {activeTool === 'pointer' && !isEditing && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 't1', i, 'left', rawStart)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 't1', i, 'right', rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>                 
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* V2 (B-ROLL) Track */}
                        {isV2Visible && (
                            <div 
                                onDragOver={(e) => handleDragOver(e, 'v2')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'v2')}
                                className={`h-10 border-b border-cyan-950/10 bg-cyan-950/5 relative flex items-center px-1 transition-all ${
                                    dragOverTrack === 'v2' 
                                        ? 'bg-cyan-900/20 border-cyan-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(6,182,212,0.15)]' 
                                        : ''
                                }`}
                            >
                                {activeEdits.filter(e => e.action === 'add_broll').map((broll, i) => {
                                    const clipId = `V2-Broll-${i}`;
                                    const isSelected = selectedClipId === clipId;
                                    const rawStart = broll.start != null ? broll.start : 0;
                                    const rawEnd = broll.end != null ? broll.end : duration;
                                    
                                    const isDraggingThis = dragState?.track === 'v2' && dragState.clipIndex === i;
                                    const clipStart = isDraggingThis && previewDrag ? previewDrag.start : (trimState?.clipIndex === i && trimState.track === 'v2' && trimState.type === 'left' && previewTrim ? previewTrim.time : rawStart);
                                    const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : (trimState?.clipIndex === i && trimState.track === 'v2' && trimState.type === 'right' && previewTrim ? previewTrim.time : rawEnd);
                                    const query = broll.query || 'stock';

                                    return (
                                        <div
                                            key={clipId}
                                            onClick={(e) => handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 'v2')}
                                            onPointerDown={(e) => handleDragStart(e, 'v2', i, rawStart, rawEnd)}
                                            onPointerMove={handleDragMove}
                                            onPointerUp={handleDragEnd}
                                            title="click to select | delete to remove | drag to move | trim edges"
                                            className={`touch-none absolute h-[32px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/v2 ${
                                                isSelected 
                                                    ? 'bg-cyan-900 border-cyan-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]' 
                                                    : 'bg-cyan-950/30 border-cyan-900/50 hover:border-cyan-600 text-cyan-200'
                                            }`}
                                            style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                        >
                                            <span className="text-[9px] absolute left-2 font-mono pointer-events-none truncate right-2 font-medium">📹 B-Roll: "{query.toLowerCase()}"</span>
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'v2', i, 'left', rawStart)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'v2', i, 'right', rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* C1 (Color Correction) Track */}
                        {isC1Visible && (
                            <div 
                                onDragOver={(e) => handleDragOver(e, 'c1')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'c1')}
                                className={`h-10 border-b border-amber-950/10 bg-amber-950/5 relative flex items-center px-1 transition-all ${
                                    dragOverTrack === 'c1' 
                                        ? 'bg-amber-900/20 border-amber-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(245,158,11,0.15)]' 
                                        : ''
                                }`}
                            >
                                {colorClips.map((clip, i) => {
                                    const clipId = clip.id;
                                    const isSelected = selectedClipId === clipId;
                                    const rawStart = clip.start;
                                    const rawEnd = clip.end;

                                    const isDraggingThis = dragState?.track === 'c1' && dragState.clipIndex === i;
                                    const clipStart = isDraggingThis && previewDrag ? previewDrag.start : (trimState?.clipIndex === i && trimState.track === 'c1' && trimState.type === 'left' && previewTrim ? previewTrim.time : rawStart);
                                    const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : (trimState?.clipIndex === i && trimState.track === 'c1' && trimState.type === 'right' && previewTrim ? previewTrim.time : rawEnd);

                                    return (
                                        <div
                                            key={clipId}
                                            onClick={(e) => handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 'c1')}
                                            onPointerDown={(e) => handleDragStart(e, 'c1', i, rawStart, rawEnd)}
                                            onPointerMove={handleDragMove}
                                            onPointerUp={handleDragEnd}
                                            title="click to select | delete to remove | drag to move | trim edges"
                                            className={`touch-none absolute h-[32px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/c1 ${
                                                isSelected 
                                                    ? 'bg-amber-900 border-amber-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]' 
                                                    : 'bg-amber-950/30 border-amber-900/50 hover:border-amber-600 text-amber-200'
                                            }`}
                                            style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                        >
                                            <span className="text-[9px] absolute left-2 font-mono pointer-events-none truncate right-2 font-medium">🎨 Цветокор: "{clip.label.toLowerCase()}"</span>
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'c1', i, 'left', rawStart)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'c1', i, 'right', rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* V1 (Main Video) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 'v1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'v1')}
                            className={`h-10 border-b border-zinc-800/10 bg-zinc-950/5 relative flex items-center px-1 transition-all ${
                                dragOverTrack === 'v1' 
                                    ? 'bg-zinc-900/20 border-zinc-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(255,255,255,0.05)]' 
                                    : ''
                            }`}
                        >
                            {multiTrackEdl.v1.map((clip, i) => {
                                const clipId = `V1-Video-${i}`;
                                const isSelected = selectedClipId === clipId;
                                
                                const isDraggingThis = dragState?.track === 'v1' && dragState.clipIndex === i;
                                const clipStart = isDraggingThis && previewDrag ? previewDrag.start : (trimState?.clipIndex === i && trimState.track === 'v1' && trimState.type === 'left' && previewTrim ? previewTrim.time : clip.start);
                                const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : (trimState?.clipIndex === i && trimState.track === 'v1' && trimState.type === 'right' && previewTrim ? previewTrim.time : clip.end);

                                return (
                                    <div 
                                        key={clipId} 
                                        onClick={(e) => handleClipClick(e, clipId, clip, i, 'v1')} 
                                        onPointerDown={(e) => handleDragStart(e, 'v1', i, clip.start, clip.end)}
                                        onPointerMove={handleDragMove}
                                        onPointerUp={handleDragEnd}
                                        className={`touch-none absolute h-[32px] rounded-md border overflow-hidden flex items-center group/clip ${activeTool === 'pointer' ? 'cursor-pointer' : 'cursor-crosshair'} ${
                                            isSelected 
                                                ? 'bg-zinc-800 border-zinc-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(255,255,255,0.1)]' 
                                                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 text-zinc-300'
                                        }`} 
                                        style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                    >
                                        {/* Visual Filmstrip Thumbnails */}
                                        <div className="absolute inset-0 flex overflow-hidden pointer-events-none opacity-25 hover:opacity-35 transition-opacity">
                                            {Array.from({ length: Math.max(1, Math.floor((clipEnd - clipStart) * 1.5)) }).map((_, fIdx) => (
                                                <div 
                                                    key={fIdx} 
                                                    className="h-full border-r border-zinc-800/30 flex-1 min-w-[40px] bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center relative overflow-hidden"
                                                >
                                                    <svg className="w-3 h-3 text-zinc-650" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                    {/* Sprocket holes */}
                                                    <div className="absolute top-0.5 left-0 right-0 flex justify-between px-1">
                                                        <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                        <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                        <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                    </div>
                                                    <div className="absolute bottom-0.5 left-0 right-0 flex justify-between px-1">
                                                        <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                        <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                        <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <span className="text-[9px] text-zinc-300 absolute left-2 font-mono pointer-events-none tracking-tight font-medium z-10 drop-shadow">
                                            {clip.source && clip.source !== "main" 
                                                ? `🎞️ Clip: ${clip.source}` 
                                                : "🎞️ Video: track v1 (auto-cuts)"}
                                        </span>
                                        {activeTool === 'pointer' && (
                                            <>
                                                <div className={`touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'v1', i, 'left', clip.start)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className={`touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'v1', i, 'right', clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Premiere Pro style separator */}
                        <div className="h-1 bg-neutral-900 border-y border-neutral-800/30 relative shrink-0" />

                        {/* A1 (Main Audio) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 'a1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'a1')}
                            className={`h-10 border-b border-teal-950/10 bg-teal-950/5 relative flex items-center px-1 transition-all ${
                                dragOverTrack === 'a1' 
                                    ? 'bg-teal-900/20 border-teal-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(20,184,166,0.15)]' 
                                    : ''
                            }`}
                        >
                            {multiTrackEdl.a1.map((clip, i) => {
                                const clipId = `A1-Audio-${i}`;
                                const isSelected = selectedClipId === clipId;

                                const isDraggingThis = dragState?.track === 'a1' && dragState.clipIndex === i;
                                const clipStart = isDraggingThis && previewDrag ? previewDrag.start : (trimState?.clipIndex === i && trimState.track === 'a1' && trimState.type === 'left' && previewTrim ? previewTrim.time : clip.start);
                                const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : (trimState?.clipIndex === i && trimState.track === 'a1' && trimState.type === 'right' && previewTrim ? previewTrim.time : clip.end);

                                const peaks = audioPeaks && audioPeaks.length > 0 ? audioPeaks : Array(100).fill(20);
                                const startIdx = Math.floor((clipStart / duration) * peaks.length);
                                const endIdx = Math.ceil((clipEnd / duration) * peaks.length);
                                const clipPeaks = peaks.slice(startIdx, endIdx);

                                return (
                                    <div 
                                        key={clipId} 
                                        onClick={(e) => handleClipClick(e, clipId, clip, i, 'a1')} 
                                        onPointerDown={(e) => handleDragStart(e, 'a1', i, clip.start, clip.end)}
                                        onPointerMove={handleDragMove}
                                        onPointerUp={handleDragEnd}
                                        className={`touch-none absolute h-[32px] rounded-md border overflow-hidden flex items-center group/clip ${activeTool === 'pointer' ? 'cursor-pointer' : 'cursor-crosshair'} ${
                                            isSelected 
                                                ? 'bg-zinc-800 border-zinc-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(255,255,255,0.1)]' 
                                                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 text-zinc-300'
                                        }`} 
                                        style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                    >
                                        <div className="absolute left-3 text-[9px] text-zinc-300 font-mono tracking-tight pointer-events-none font-medium z-10 drop-shadow">
                                            {clip.source && clip.source !== "main" 
                                                ? `🔊 Audio: ${clip.source}` 
                                                : "🎙️ Voice: track a1"}
                                        </div>
                                        <div className="w-full h-full flex items-center justify-between px-0.5 opacity-60 pointer-events-none">
                                            {clipPeaks.map((peak, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className="bg-emerald-500/80 group-hover/clip:bg-emerald-400/90 transition-all rounded-none" 
                                                    style={{ 
                                                        height: `${Math.max(15, peak)}%`, 
                                                        width: `${100 / clipPeaks.length}%`,
                                                        margin: '0 0.5px'
                                                    }} 
                                                />
                                            ))}
                                        </div>
                                        
                                        {activeTool === 'pointer' && (
                                            <>
                                                <div className={`touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'a1', i, 'left', clip.start)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className={`touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'a1', i, 'right', clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* SFX (Assets) Track */}
                        {isSFXVisible && (
                            <div 
                                onDragOver={(e) => handleDragOver(e, 'sfx')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'sfx')}
                                className={`h-10 border-b border-amber-950/10 bg-amber-950/5 relative flex items-center px-1 transition-all ${
                                    dragOverTrack === 'sfx' 
                                        ? 'bg-amber-900/20 border-amber-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(245,158,11,0.15)]' 
                                        : ''
                                }`}
                            >
                                {activeEdits.map((asset, i) => {
                                    if (asset.action !== 'add_asset') return null;
                                    const isSfx = asset.asset_query?.toLowerCase().includes('sfx') || 
                                                  asset.asset_query?.toLowerCase().includes('click') || 
                                                  asset.asset_query?.toLowerCase().includes('whoosh') ||
                                                  asset.asset_query?.toLowerCase().includes('impact');
                                    if (!isSfx) return null;

                                    const clipId = `SFX-Asset-${i}`;
                                    const isSelected = selectedClipId === clipId;
                                    const rawStart = asset.start || 0;
                                    const rawEnd = asset.end || rawStart + 2;

                                    const isDraggingThis = dragState?.track === 'sfx' && dragState.clipIndex === i;
                                    const clipStart = isDraggingThis && previewDrag ? previewDrag.start : (trimState?.clipIndex === i && trimState.track === 'sfx' && trimState.type === 'left' && previewTrim ? previewTrim.time : rawStart);
                                    const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : (trimState?.clipIndex === i && trimState.track === 'sfx' && trimState.type === 'right' && previewTrim ? previewTrim.time : rawEnd);
                                    const query = asset.query || asset.asset_query || 'asset';
                                    
                                    return (
                                        <div
                                            key={clipId}
                                            onClick={(e) => handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 'sfx')}
                                            onPointerDown={(e) => handleDragStart(e, 'sfx', i, rawStart, rawEnd)}
                                            onPointerMove={handleDragMove}
                                            onPointerUp={handleDragEnd}
                                            className={`touch-none absolute h-[32px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/sfx ${
                                                isSelected 
                                                    ? 'bg-amber-900 border-amber-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]' 
                                                    : 'bg-amber-950/30 border-amber-805/50 hover:border-amber-600 text-amber-200'
                                            }`}
                                            style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                        >
                                            <span className="text-[9px] absolute left-2 font-mono pointer-events-none truncate right-2 font-medium">🔊 SFX: "{query.toLowerCase()}"</span>
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'sfx', i, 'left', rawStart)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'sfx', i, 'right', rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* M1 (Music/BGM) Track */}
                        {isM1Visible && (
                            <div 
                                onDragOver={(e) => handleDragOver(e, 'm1')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'm1')}
                                className={`h-10 border-b border-emerald-950/10 bg-emerald-950/5 relative flex items-center px-1 transition-all ${
                                    dragOverTrack === 'm1' 
                                        ? 'bg-emerald-900/20 border-emerald-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(16,185,129,0.15)]' 
                                        : ''
                                }`}
                            >
                                {activeEdits.map((asset, i) => {
                                    if (asset.action !== 'add_asset') return null;
                                    const isSfx = asset.asset_query?.toLowerCase().includes('sfx') || 
                                                  asset.asset_query?.toLowerCase().includes('click') || 
                                                  asset.asset_query?.toLowerCase().includes('whoosh') ||
                                                  asset.asset_query?.toLowerCase().includes('impact');
                                    if (isSfx) return null;

                                    const clipId = `M1-Music-${i}`;
                                    const isSelected = selectedClipId === clipId;
                                    const rawStart = asset.start || 0;
                                    const rawEnd = asset.end || duration;

                                    const isDraggingThis = dragState?.track === 'm1' && dragState.clipIndex === i;
                                    const clipStart = isDraggingThis && previewDrag ? previewDrag.start : (trimState?.clipIndex === i && trimState.track === 'm1' && trimState.type === 'left' && previewTrim ? previewTrim.time : rawStart);
                                    const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : (trimState?.clipIndex === i && trimState.track === 'm1' && trimState.type === 'right' && previewTrim ? previewTrim.time : rawEnd);
                                    const query = asset.query || asset.asset_query || 'music';
                                    
                                    return (
                                        <div
                                            key={clipId}
                                            onClick={(e) => handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 'm1')}
                                            onPointerDown={(e) => handleDragStart(e, 'm1', i, rawStart, rawEnd)}
                                            onPointerMove={handleDragMove}
                                            onPointerUp={handleDragEnd}
                                            className={`touch-none absolute h-[32px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/bgm ${
                                                isSelected 
                                                    ? 'bg-emerald-900 border-emerald-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)]' 
                                                    : 'bg-emerald-950/30 border-emerald-900/50 hover:border-emerald-600 text-emerald-200'
                                            }`}
                                            style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                        >
                                            <span className="text-[9px] absolute left-2 font-mono pointer-events-none truncate right-16 font-medium">🎵 Music: "{query.toLowerCase()}"</span>
                                            <span className="text-[9px] font-mono text-white bg-zinc-900 px-1 py-0.2 rounded-none border border-border absolute right-1 pointer-events-none">{asset.volume || -22} dB</span>
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'm1', i, 'left', rawStart)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'm1', i, 'right', rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </div>

                    {/* Playhead Indicator */}
                    <div 
                        className="absolute top-0 bottom-0 w-[1px] bg-blue-500 z-50 pointer-events-none" 
                        style={{ left: `${(timelineTime / duration) * 100}%` }}
                    >
                        {/* Playhead Handle */}
                        <div 
                            className="absolute -top-[16px] -left-2.5 w-5 h-4 bg-blue-500 rounded-t-sm shadow-md flex items-center justify-center pointer-events-auto cursor-ew-resize hover:bg-blue-400 transition-colors"
                            onPointerDown={handleScrubStart}
                        >
                            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[8px] border-l-transparent border-r-transparent border-t-blue-500 absolute -bottom-[7px]" />
                            <div className="flex gap-[2px] z-10 relative -top-0.5">
                                <div className="w-[1.5px] h-2 bg-blue-200/80 rounded-full"></div>
                                <div className="w-[1.5px] h-2 bg-blue-200/80 rounded-full"></div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Floating Zoom Control */}
            <div className="absolute bottom-2 right-4 bg-zinc-950/80 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1.5 z-[100] shadow-lg backdrop-blur-md">
                <span className="text-[11px] text-zinc-400 font-mono" title="Zoom Out">🔍-</span>
                <input 
                    type="range" 
                    min="100" 
                    max="1000" 
                    step="10"
                    value={zoom} 
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-24 accent-blue-500 h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer"
                />
                <span className="text-[11px] text-zinc-400 font-mono" title="Zoom In">🔍+</span>
            </div>
        </div>
    );
}
