import React, { useState, useEffect, useRef } from "react";

type KeepSegment = { start: number; end: number };

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
  transcript
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
}) {
    const [timelineTime, setTimelineTime] = useState(0);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<'pointer' | 'razor'>('pointer');
    const [editingChunk, setEditingChunk] = useState<{index: number; text: string} | null>(null);
    const editInputRef = useRef<HTMLInputElement>(null);
    
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
        track: 'v1' | 'a1' | 't1' | 'v2' | 'm1' | 'sfx',
        clipIndex: number, 
        type: 'left' | 'right', 
        startX: number, 
        initialTime: number,
        pointerId: number
    } | null>(null);
    const [previewTrim, setPreviewTrim] = useState<{time: number} | null>(null);

    // NEW State for horizontal clip dragging
    const [dragState, setDragState] = useState<{
        track: 'v1' | 'a1' | 't1' | 'v2' | 'm1' | 'sfx' | 'g1' | 's1',
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
                    action: "scene_override",
                    start: dropTime,
                    end: Math.min(dropTime + 3.0, duration),
                    style: assetData.style,
                    html_content: assetData.html
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
                    const idx = parseInt(selectedClipId.replace('S1-Scene-', ''), 10);
                    if (onActiveEditsChange) {
                        let sIndex = 0;
                        const updated = activeEdits.filter(ae => {
                            if (ae.action === 'scene_override') {
                                const keep = sIndex !== idx;
                                sIndex++;
                                return keep;
                            }
                            return true;
                        });
                        onActiveEditsChange(updated);
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
    }, [selectedClipId, multiTrackEdl, activeEdits, onEdlChange, onActiveEditsChange, trimState, dragState]);

    if (!duration || duration <= 0) return <div className="p-6 text-zinc-650 font-mono text-[11px] lowercase">loading timeline...</div>;

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

    const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!duration || !videoRef?.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = percent * duration;
        
        videoRef.current.currentTime = newTime;
        if (audioRef?.current) audioRef.current.currentTime = newTime;
        setTimelineTime(newTime);
    };

    // Generic clip click / razor splitting
    const handleClipClick = (
        e: React.MouseEvent, 
        id: string, 
        clip: { start: number, end: number }, 
        clipIndex: number, 
        track: 'v1' | 'a1' | 't1' | 'v2' | 'm1' | 'sfx' | 'g1' | 's1'
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
                } else if (track === 's1') {
                    let sIndex = 0;
                    let targetIdx = -1;
                    activeEdits.forEach((e, idx) => {
                        if (e.action === 'scene_override') {
                            if (sIndex === clipIndex) targetIdx = idx;
                            sIndex++;
                        }
                    });
                    if (targetIdx !== -1) {
                        const target = activeEdits[targetIdx];
                        const first = { ...target, end: clickTime };
                        const second = { ...target, start: clickTime };
                        const updated = [...activeEdits];
                        updated.splice(targetIdx, 1, first, second);
                        onActiveEditsChange(updated);
                    }
                }
            }
            setActiveTool('pointer');
        }
    };

    // Trim handler
    const handleTrimStart = (e: React.PointerEvent, track: 'v1'|'a1'|'t1'|'v2'|'m1'|'sfx', clipIndex: number, type: 'left' | 'right', initialTime: number) => {
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
        } else {
            const edlKey = trimState.track === 't1' ? 'v1' : trimState.track;
            const newEdl = { ...multiTrackEdl, [edlKey]: multiTrackEdl[edlKey as 'v1'|'a1'].map((clip, i) => {
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
    const handleDragStart = (e: React.PointerEvent, track: 'v1'|'a1'|'t1'|'v2'|'m1'|'sfx'|'g1'|'s1', clipIndex: number, initialStart: number, initialEnd: number) => {
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
        } else if (dragState.track === 's1') {
            if (onActiveEditsChange) {
                let sIndex = 0;
                const updated = activeEdits.map(ae => {
                    if (ae.action !== 'scene_override') return ae;
                    if (sIndex === dragState.clipIndex) {
                        sIndex++;
                        return { ...ae, start: previewDrag.start, end: previewDrag.end };
                    }
                    sIndex++;
                    return ae;
                });
                onActiveEditsChange(updated);
            }
        } else {
            const edlKey = dragState.track === 't1' ? 'v1' : dragState.track;
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
    const handleAddClip = (track: 's1' | 't1' | 'v2' | 'm1' | 'sfx' | 'g1') => {
        if (!onActiveEditsChange) return;

        let newEdit: any = null;
        if (track === 's1') {
            newEdit = {
                action: "scene_override",
                start: timelineTime,
                end: Math.min(timelineTime + 3, duration),
                style: "vox",
                html_content: `<div id="root" style="background: linear-gradient(135deg, #1e1b4b, #311042); color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Inter, sans-serif; padding: 40px; text-align: center; width: 1080px; height: 1920px;"><h1 style="font-size: 80px; font-weight: 900; margin-bottom: 20px; text-transform: uppercase; background: linear-gradient(to right, #f59e0b, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">New Scene</h1><p style="font-size: 32px; color: #a1a1aa;">Real-time customized scene override</p></div>`
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

    const rulerTicks = Array.from({length: 11}, (_, i) => (duration / 10) * i);

    return (
        <div className="flex flex-col h-full bg-card overflow-hidden border border-border rounded-none select-none font-mono" onClick={() => setSelectedClipId(null)}>
            
            {/* Toolbar Area */}
            <div className="bg-background border-b border-border h-10 flex items-center px-4 justify-between shrink-0 z-30 relative shadow-none">
                
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-black p-0.5 border border-border rounded-none" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setActiveTool('pointer')}
                            className={`p-1 flex items-center justify-center transition-colors rounded-none cursor-pointer ${activeTool === 'pointer' ? 'bg-zinc-900 text-white font-bold border border-border' : 'text-zinc-550 hover:bg-zinc-900'}`}
                            title="select tool (v)"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                        </button>
                        <button 
                            onClick={() => setActiveTool('razor')}
                            className={`p-1 flex items-center justify-center transition-colors rounded-none cursor-pointer ${activeTool === 'razor' ? 'bg-zinc-900 text-white font-bold border border-border' : 'text-zinc-555 hover:bg-zinc-900'}`}
                            title="razor tool (c)"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                    </div>
                </div>

                {/* Subtitles Animation Picker */}
                {activeEdits.some(e => e.action === 'add_subtitles') && (
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <div className="w-[1px] h-4 bg-zinc-850 mx-1" />
                        <span className="text-[9px] text-zinc-500 lowercase">animation:</span>
                        {([
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
                                className={`px-1.5 py-0.5 border text-[9px] transition-colors rounded-none cursor-pointer ${
                                    animStyle === key
                                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold'
                                        : 'bg-zinc-950 border-zinc-900 text-zinc-550 hover:border-zinc-800 hover:text-zinc-400'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
                  {/* BGM Volume Panel */}
            {selectedClipId && selectedClipId.startsWith('M1-Music-') && (() => {
                const idx = parseInt(selectedClipId.replace('M1-Music-', ''), 10);
                const bgm = activeEdits[idx];
                if (!bgm) return null;
                return (
                    <div className="bg-[#0a0a0c] border-b border-border px-4 py-2 flex items-center gap-6 z-30 shrink-0 select-none font-mono" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-none bg-white animate-pulse" />
                            <span className="text-[10px] text-zinc-400 truncate max-w-[150px]">
                                {bgm.asset_query}
                            </span>
                        </div>
                        
                        <div className="flex-1 flex items-center gap-3">
                            <span className="text-[10px] text-zinc-550 lowercase">volume:</span>
                            <input 
                                type="range" 
                                min="-40" 
                                max="0" 
                                value={bgm.volume || -22} 
                                onChange={(ev) => {
                                    const vol = parseInt(ev.target.value, 10);
                                    if (onActiveEditsChange) {
                                        const updated = [...activeEdits];
                                        updated[idx] = { ...bgm, volume: vol };
                                        onActiveEditsChange(updated);
                                    }
                                }}
                                className="flex-1 accent-white h-[2px] bg-zinc-800 rounded-none appearance-none cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-white bg-zinc-900 px-2 py-0.5 border border-border rounded-none min-w-[50px] text-center">
                                {bgm.volume || -22} dB
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-zinc-550 lowercase">start:</span>
                            <input 
                                type="number"
                                step="0.1"
                                min="0"
                                max={duration}
                                value={bgm.start != null ? bgm.start : 0}
                                onChange={(ev) => {
                                    const val = parseFloat(ev.target.value) || 0;
                                    if (onActiveEditsChange) {
                                        const updated = [...activeEdits];
                                        updated[idx] = { ...bgm, start: val };
                                        onActiveEditsChange(updated);
                                    }
                                }}
                                className="w-12 bg-zinc-950 border border-border rounded-none px-1 py-0.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-zinc-500"
                            />
                            
                            <span className="text-[10px] text-zinc-550 lowercase">end:</span>
                            <input 
                                type="number"
                                step="0.1"
                                min="0"
                                max={duration}
                                value={bgm.end != null ? bgm.end : duration}
                                onChange={(ev) => {
                                    const val = parseFloat(ev.target.value) || duration;
                                    if (onActiveEditsChange) {
                                        const updated = [...activeEdits];
                                        updated[idx] = { ...bgm, end: val };
                                        onActiveEditsChange(updated);
                                    }
                                }}
                                className="w-12 bg-zinc-950 border border-border rounded-none px-1 py-0.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-zinc-500"
                            />
                        </div>

                        <button
                            onClick={() => {
                                if (onActiveEditsChange) {
                                    onActiveEditsChange(activeEdits.filter((_, i) => i !== idx));
                                    setSelectedClipId(null);
                                }
                            }}
                            className="h-6 px-3 bg-zinc-900 hover:bg-zinc-850 border border-border hover:border-white text-zinc-400 hover:text-white rounded-none text-[10px] lowercase transition-colors cursor-pointer"
                        >
                            delete
                        </button>
                    </div>
                );
            })()}

            {/* Tracks Container */}
            <div className="flex flex-1 relative overflow-y-auto overflow-x-auto md:overflow-x-hidden bg-background scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                
                {/* 1. Left Sidebar: Track Headers & Add Controls (Premiere/Resolve Style) */}
                <div className="w-32 bg-[#08080a] border-r border-border flex flex-col z-20 flex-shrink-0 sticky left-0 font-mono text-[8px] text-zinc-500">
                    <div className="h-6 shrink-0 bg-[#08080a] sticky top-0 z-30 border-b border-border" />
                    
                    {/* S1 Track Header */}
                    <div className="h-16 border-b border-purple-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-zinc-950/40 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-purple-950/80 text-purple-400 border border-purple-900/60 rounded font-bold text-[8px]">S1</span>
                            <span className="text-[8px] text-zinc-400 font-semibold tracking-wider">scenes</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1.5">
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                            </div>
                            <button 
                                onClick={(ev) => { ev.stopPropagation(); handleAddClip('s1'); }}
                                className="w-4 h-4 bg-zinc-900 border border-border hover:border-white hover:text-purple-400 flex items-center justify-center cursor-pointer transition-all rounded font-bold text-[9px]"
                                title="Add Scene Override"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* T1 Track Header */}
                    <div className="h-16 border-b border-blue-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-zinc-950/40 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-blue-950/80 text-blue-400 border border-blue-900/60 rounded font-bold text-[8px]">T1</span>
                            <span className="text-[8px] text-zinc-400 font-semibold tracking-wider">text t1</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1.5">
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                            </div>
                            <button 
                                onClick={(ev) => { ev.stopPropagation(); handleAddClip('t1'); }}
                                className="w-4 h-4 bg-zinc-900 border border-border hover:border-white hover:text-blue-400 flex items-center justify-center cursor-pointer transition-all rounded font-bold text-[9px]"
                                title="Add Custom Subtitle/Text"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* V2 Track Header */}
                    <div className="h-16 border-b border-cyan-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-zinc-950/40 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-cyan-950/80 text-cyan-400 border border-cyan-900/60 rounded font-bold text-[8px]">V2</span>
                            <span className="text-[8px] text-zinc-400 font-semibold tracking-wider">b-roll v2</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1.5">
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                            </div>
                            <button 
                                onClick={(ev) => { ev.stopPropagation(); handleAddClip('v2'); }}
                                className="w-4 h-4 bg-zinc-900 border border-border hover:border-white hover:text-cyan-400 flex items-center justify-center cursor-pointer transition-all rounded font-bold text-[9px]"
                                title="Add Stock B-Roll Video"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* M1 Track Header */}
                    <div className="h-16 border-b border-emerald-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-zinc-950/40 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-900/60 rounded font-bold text-[8px]">M1</span>
                            <span className="text-[8px] text-zinc-400 font-semibold tracking-wider">music m1</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1.5">
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                            </div>
                            <button 
                                onClick={(ev) => { ev.stopPropagation(); handleAddClip('m1'); }}
                                className="w-4 h-4 bg-zinc-900 border border-border hover:border-white hover:text-emerald-400 flex items-center justify-center cursor-pointer transition-all rounded font-bold text-[9px]"
                                title="Add Background Music"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* SFX Track Header */}
                    <div className="h-16 border-b border-amber-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-zinc-950/40 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-amber-950/80 text-amber-400 border border-amber-900/60 rounded font-bold text-[8px]">SFX</span>
                            <span className="text-[8px] text-zinc-400 font-semibold tracking-wider">sfx</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1.5">
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                            </div>
                            <button 
                                onClick={(ev) => { ev.stopPropagation(); handleAddClip('sfx'); }}
                                className="w-4 h-4 bg-zinc-900 border border-border hover:border-white hover:text-amber-400 flex items-center justify-center cursor-pointer transition-all rounded font-bold text-[9px]"
                                title="Add Sound Effect"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* G1 Track Header */}
                    <div className="h-16 border-b border-fuchsia-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-zinc-950/40 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-fuchsia-950/80 text-fuchsia-400 border border-fuchsia-900/60 rounded font-bold text-[8px]">G1</span>
                            <span className="text-[8px] text-zinc-400 font-semibold tracking-wider">graphics g1</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1.5">
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                                <button className="text-[9px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                            </div>
                            <button 
                                onClick={(ev) => { ev.stopPropagation(); handleAddClip('g1'); }}
                                className="w-4 h-4 bg-zinc-900 border border-border hover:border-white hover:text-fuchsia-400 flex items-center justify-center cursor-pointer transition-all rounded font-bold text-[9px]"
                                title="Add Motion Graphic"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* V1 Track Header */}
                    <div className="h-16 border-b border-zinc-800/40 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-[#121319]/85 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded font-bold text-[8px]">V1</span>
                            <span className="text-[8px] text-zinc-400 font-semibold tracking-wider">video v1</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[9px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[9px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                        </div>
                    </div>

                    {/* A1 Track Header */}
                    <div className="h-16 border-b border-teal-950/30 bg-[#0d0e12] flex flex-col justify-between p-2.5 uppercase hover:bg-[#121319]/85 select-none group/track transition-all">
                        <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 bg-teal-950/80 text-teal-400 border border-teal-900/60 rounded font-bold text-[8px]">A1</span>
                            <span className="text-[8px] text-zinc-400 font-semibold tracking-wider">audio a1</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 opacity-50 group-hover/track:opacity-100 transition-opacity">
                            <button className="text-[9px] hover:text-white cursor-pointer" title="Toggle visibility">👁</button>
                            <button className="text-[9px] hover:text-white cursor-pointer" title="Mute track">🔊</button>
                        </div>
                    </div>
                </div>

                {/* 2. Right Side: Multi-track Timeline Channels */}
                <div className="flex-1 flex flex-col min-w-[700px] md:min-w-0 relative" ref={containerRef}>
                    {/* Time Ruler / Scrub area */}
                    <div 
                        className="h-6 bg-card border-b border-border flex items-center relative cursor-ew-resize z-20 sticky top-0"
                        onMouseDown={handleScrub}
                    >
                        {rulerTicks.map((t, i) => (
                            <div 
                                key={i} 
                                className="absolute flex flex-col items-start"
                                style={{ left: `${(t / duration) * 100}%` }}
                            >
                                <div className="h-1.5 w-[1px] bg-zinc-700" />
                                <span className="text-[8px] font-mono text-zinc-650 ml-1 mt-0.5">{formatTime(t)}</span>
                            </div>
                        ))}
                    </div>
                    {/* Tracks Area */}
                    <div className="flex flex-col relative w-full">
                        {/* S1 (Scenes) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 's1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 's1')}
                            className={`h-16 border-b border-purple-950/20 bg-purple-950/5 relative flex items-center px-1 transition-all ${
                                dragOverTrack === 's1' 
                                    ? 'bg-purple-900/20 border-purple-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(168,85,247,0.15)] animate-pulse' 
                                    : ''
                            }`}
                        >
                            {activeEdits.map((item, i) => {
                                if (item.action !== 'scene_override') return null;
                                const clipId = `S1-Scene-${i}`;
                                const isSelected = selectedClipId === clipId;
                                const rawStart = item.start || 0;
                                const rawEnd = item.end || duration;
                                
                                const isDraggingThis = dragState?.track === 's1' && dragState.clipIndex === i;
                                const clipStart = isDraggingThis && previewDrag ? previewDrag.start : rawStart;
                                const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : rawEnd;

                                return (
                                    <div
                                        key={clipId}
                                        onClick={(e) => handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 's1')}
                                        onPointerDown={(e) => handleDragStart(e, 's1', i, rawStart, rawEnd)}
                                        onPointerMove={handleDragMove}
                                        onPointerUp={handleDragEnd}
                                        className={`absolute h-[50px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all ${
                                            isSelected 
                                                ? 'bg-purple-900 border-purple-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(168,85,247,0.3)]' 
                                                : 'bg-purple-950/30 border-purple-900/50 hover:border-purple-600 text-purple-200'
                                        }`}
                                        style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                    >
                                        <span className="text-[9.5px] absolute left-2 font-mono truncate right-2 font-medium">🎬 Scene: {item.style || 'vox'} style</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* T1 (Subtitles) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 't1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 't1')}
                            className={`h-16 border-b border-blue-950/20 bg-blue-950/5 relative flex items-center px-1 transition-all ${
                                dragOverTrack === 't1' 
                                    ? 'bg-blue-900/20 border-blue-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(59,130,246,0.15)]' 
                                    : ''
                            }`}
                        >
                            {multiTrackEdl.v1.map((clip, i) => {
                                const clipId = `T1-Sub-${i}`;
                                const isSelected = selectedClipId === clipId;
                                const overrideEdits = activeEdits.filter(e => e.action === 'subtitle_override');
                                const overrideForChunk = overrideEdits.find(e => e.chunk_index === i);
                                
                                // Fetch spoken words from transcript falling in this segment
                                const wordsInClip = transcript?.words?.filter((w: any) => w.start >= clip.start && w.end <= clip.end) || [];
                                const spokenText = wordsInClip.map((w: any) => w.word).join(' ');
                                const label = overrideForChunk?.text || spokenText || 'subtitles';

                                const isDraggingThis = dragState?.track === 't1' && dragState.clipIndex === i;
                                const clipStart = isDraggingThis && previewDrag ? previewDrag.start : (trimState?.clipIndex === i && trimState.track === 't1' && trimState.type === 'left' && previewTrim ? previewTrim.time : clip.start);
                                const clipEnd = isDraggingThis && previewDrag ? previewDrag.end : (trimState?.clipIndex === i && trimState.track === 't1' && trimState.type === 'right' && previewTrim ? previewTrim.time : clip.end);
                                const isEditing = editingChunk?.index === i;

                                return (
                                    <div
                                        key={clipId}
                                        title="click to select | double click to edit | delete to remove | drag to move"
                                        onClick={(e) => handleClipClick(e, clipId, clip, i, 't1')}
                                        onPointerDown={(e) => handleDragStart(e, 't1', i, clip.start, clip.end)}
                                        onPointerMove={handleDragMove}
                                        onPointerUp={handleDragEnd}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setEditingChunk({ index: i, text: label });
                                            setTimeout(() => editInputRef.current?.focus(), 50);
                                        }}
                                        className={`absolute h-[50px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/t1 ${
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
                                                    if (e.key === 'Enter' || e.key === 'Escape') {
                                                        if (e.key === 'Enter' && onActiveEditsChange) {
                                                             const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === i));
                                                             onActiveEditsChange([...others, { action: 'subtitle_override', chunk_index: i, text: editingChunk!.text, start: clip.start, end: clip.end }]);
                                                        }
                                                        setEditingChunk(null);
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (onActiveEditsChange) {
                                                        const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === i));
                                                        onActiveEditsChange([...others, { action: 'subtitle_override', chunk_index: i, text: editingChunk!.text, start: clip.start, end: clip.end }]);
                                                    }
                                                    setEditingChunk(null);
                                                }}
                                                className="absolute inset-0 w-full h-full bg-black text-foreground text-[10px] font-mono px-2 outline-none border border-white rounded-none z-30"
                                            />
                                        ) : (
                                            <span className="absolute text-[9.5px] font-mono ml-2 pointer-events-none truncate right-4 left-4 font-medium">
                                                💬 {label}
                                            </span>
                                        )}
                                        {activeTool === 'pointer' && !isEditing && (
                                            <>
                                                <div className="absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 't1', i, 'left', clip.start)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className="absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 't1', i, 'right', clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* V2 (B-ROLL) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 'v2')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'v2')}
                            className={`h-16 border-b border-cyan-950/20 bg-cyan-950/5 relative flex items-center px-1 transition-all ${
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
                                        className={`absolute h-[50px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/v2 ${
                                            isSelected 
                                                ? 'bg-cyan-900 border-cyan-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]' 
                                                : 'bg-cyan-950/30 border-cyan-900/50 hover:border-cyan-600 text-cyan-200'
                                        }`}
                                        style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                    >
                                        <span className="text-[9.5px] absolute left-3 font-mono pointer-events-none truncate right-3 font-medium">📹 B-Roll: "{query.toLowerCase()}"</span>
                                        {activeTool === 'pointer' && (
                                            <>
                                                <div className="absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'v2', i, 'left', rawStart)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className="absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'v2', i, 'right', rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* M1 (Music/BGM) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 'm1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'm1')}
                            className={`h-16 border-b border-emerald-950/20 bg-emerald-950/5 relative flex items-center px-1 transition-all ${
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
                                        className={`absolute h-[50px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/bgm ${
                                            isSelected 
                                                ? 'bg-emerald-900 border-emerald-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)]' 
                                                : 'bg-emerald-950/30 border-emerald-900/50 hover:border-emerald-600 text-emerald-200'
                                        }`}
                                        style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                    >
                                        <span className="text-[9.5px] absolute left-3 font-mono pointer-events-none truncate right-20 font-medium">🎵 Music: "{query.toLowerCase()}"</span>
                                        <span className="text-[8px] font-mono text-white bg-zinc-900 px-2 py-0.5 rounded-none border border-border absolute right-2 pointer-events-none">{asset.volume || -22} dB</span>
                                        {activeTool === 'pointer' && (
                                            <>
                                                <div className="absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'm1', i, 'left', rawStart)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className="absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'm1', i, 'right', rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* SFX (Assets) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 'sfx')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'sfx')}
                            className={`h-16 border-b border-amber-950/20 bg-amber-950/5 relative flex items-center px-1 transition-all ${
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
                                        className={`absolute h-[50px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/sfx ${
                                            isSelected 
                                                ? 'bg-amber-900 border-amber-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]' 
                                                : 'bg-amber-950/30 border-amber-800/50 hover:border-amber-600 text-amber-200'
                                        }`}
                                        style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                    >
                                        <span className="text-[9.5px] absolute left-3 font-mono pointer-events-none truncate right-3 font-medium">🔊 SFX: "{query.toLowerCase()}"</span>
                                        {activeTool === 'pointer' && (
                                            <>
                                                <div className="absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'sfx', i, 'left', rawStart)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className="absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'sfx', i, 'right', rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* G1 (Graphics) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 'g1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'g1')}
                            className={`h-16 border-b border-fuchsia-950/20 bg-fuchsia-950/5 relative flex items-center px-1 transition-all ${
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
                                        className={`absolute h-[50px] border rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/g1 ${
                                            isSelected 
                                                ? 'bg-fuchsia-900 border-fuchsia-300 text-white z-10 font-bold shadow-[0_0_12px_rgba(217,70,239,0.3)]' 
                                                : 'bg-fuchsia-950/30 border-fuchsia-900/50 hover:border-fuchsia-600 text-fuchsia-200'
                                        }`}
                                        style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                    >
                                        <span className="text-[9.5px] absolute left-3 font-mono pointer-events-none truncate right-3 font-medium">✨ Graphic: {clip.label.toLowerCase()}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* V1 (Main Video) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 'v1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'v1')}
                            className={`h-16 border-b border-zinc-800/20 bg-zinc-950/10 relative flex items-center px-1 transition-all ${
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
                                        className={`absolute h-[50px] rounded-md border overflow-hidden flex items-center group/clip ${activeTool === 'pointer' ? 'cursor-pointer' : 'cursor-crosshair'} ${
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
                                                    <svg className="w-3.5 h-3.5 text-zinc-650" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                        <span className="text-[9.5px] text-zinc-300 absolute left-3 font-mono pointer-events-none tracking-tight font-medium z-10 drop-shadow">🎞️ Video: track v1 (auto-cuts)</span>
                                        {activeTool === 'pointer' && (
                                            <>
                                                <div className={`absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'v1', i, 'left', clip.start)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className={`absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'v1', i, 'right', clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* A1 (Main Audio) Track */}
                        <div 
                            onDragOver={(e) => handleDragOver(e, 'a1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'a1')}
                            className={`h-16 border-b border-teal-950/20 bg-teal-950/5 relative flex items-center px-1 transition-all ${
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
                                        className={`absolute h-[50px] rounded-md border overflow-hidden flex items-center group/clip ${activeTool === 'pointer' ? 'cursor-pointer' : 'cursor-crosshair'} ${
                                            isSelected 
                                                ? 'bg-zinc-800 border-zinc-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(255,255,255,0.1)]' 
                                                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 text-zinc-300'
                                        }`} 
                                        style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
                                    >
                                        <div className="absolute left-3 text-[9.5px] text-zinc-300 font-mono tracking-tight pointer-events-none font-medium z-10 drop-shadow">🎙️ Voice: track a1</div>
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
                                                <div className={`absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'a1', i, 'left', clip.start)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className={`absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'a1', i, 'right', clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Playhead Indicator */}
                    <div 
                        className="absolute top-0 bottom-0 w-px bg-white z-40 pointer-events-none" 
                        style={{ left: `${(timelineTime / duration) * 100}%` }}
                    >
                        <div className="w-2 h-2 bg-white rounded-none absolute -top-1 -left-1"></div>
                    </div>

                </div>
            </div>
        </div>
    );
}
