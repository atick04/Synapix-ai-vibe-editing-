import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getApiUrl } from "@/utils/api";

type KeepSegment = { start: number; end: number; source?: string };

/** Keep HTML graphic clip timing in sync with timeline start/end (incl. GSAP exit cues). */
function patchGraphicEditTiming(edit: any, start: number, end: number) {
    const s = Math.round(Math.max(0, start) * 100) / 100;
    const e = Math.round(Math.max(s + 0.15, end) * 100) / 100;
    const dur = Math.round((e - s) * 100) / 100;
    const oldDurRaw =
        typeof edit.duration === 'number' && edit.duration > 0
            ? edit.duration
            : (edit.end != null && edit.start != null ? Number(edit.end) - Number(edit.start) : null);
    const oldDur = oldDurRaw != null && Number.isFinite(oldDurRaw) ? Math.round(oldDurRaw * 100) / 100 : null;

    let html = edit.html_content || edit.html;
    if (typeof html === 'string' && html.length > 0) {
        const sStr = s.toFixed(2);
        const dStr = dur.toFixed(2);

        // data-start / data-duration (quoted or bare)
        if (/data-start\s*=/.test(html)) {
            html = html.replace(/data-start\s*=\s*(['"]?)[\d.]+(\1)/gi, `data-start=$1${sStr}$2`);
        }
        if (/data-duration\s*=/.test(html)) {
            html = html.replace(/data-duration\s*=\s*(['"]?)[\d.]+(\1)/gi, `data-duration=$1${dStr}$2`);
        } else if (/class\s*=\s*(['"][^'"]*\bclip\b[^'"]*\1)/i.test(html)) {
            html = html.replace(
                /(<[^>]*class\s*=\s*['"][^'"]*\bclip\b[^'"]*['"][^>]*)(>)/i,
                `$1 data-start="${sStr}" data-duration="${dStr}"$2`
            );
        }

        // Common GSAP duration constants used by graphics generator
        html = html.replace(/\b(const|let|var)\s+DURATION\s*=\s*[\d.]+/g, `$1 DURATION = ${dStr}`);
        html = html.replace(/\bDURATION\s*=\s*[\d.]+/g, `DURATION = ${dStr}`);

        // Shift baked GSAP exit cue positions from old duration → new duration (script-safe only)
        if (oldDur != null && Math.abs(oldDur - dur) > 0.05) {
            const cues = [
                [Math.round(Math.max(0.5, oldDur - 0.5) * 100) / 100, Math.round(Math.max(0.5, dur - 0.5) * 100) / 100],
                [Math.round(Math.max(0.5, oldDur - 0.6) * 100) / 100, Math.round(Math.max(0.5, dur - 0.6) * 100) / 100],
            ] as const;
            const esc = (n: number) => String(n).replace('.', '\\.');
            for (const [oldExit, newExit] of cues) {
                if (Math.abs(oldExit - newExit) < 0.01) continue;
                // tl.to(..., OLD) / tl.fromTo(..., OLD)
                html = html.replace(
                    new RegExp(`(,\\s*)${esc(oldExit)}(\\s*\\)\\s*;)`, 'g'),
                    `$1${newExit}$2`
                );
                html = html.replace(
                    new RegExp(`Math\\.max\\(\\s*0\\.5\\s*,\\s*${esc(oldExit)}\\s*\\)`, 'g'),
                    `Math.max(0.5, ${newExit})`
                );
            }
        }
    }

    return {
        ...edit,
        start: s,
        end: e,
        duration: dur,
        ...(edit.html_content != null || html != null ? { html_content: html ?? edit.html_content } : {}),
        ...(edit.html != null && edit.html_content == null ? { html } : {}),
    };
}

// Global cache and queue for filmstrip thumbnails to avoid exceeding browser's video decoder limit
const thumbnailCache = new Map<string, string>();
const thumbnailQueue: { key: string; videoUrl: string; time: number; callback: (dataUrl: string) => void }[] = [];
let isProcessingQueue = false;
let hiddenVideoElement: HTMLVideoElement | null = null;
let hiddenCanvasElement: HTMLCanvasElement | null = null;

function processNextQueueItem() {
    if (thumbnailQueue.length === 0) {
        isProcessingQueue = false;
        return;
    }
    isProcessingQueue = true;
    const item = thumbnailQueue[0];
    
    if (thumbnailCache.has(item.key)) {
        item.callback(thumbnailCache.get(item.key)!);
        thumbnailQueue.shift();
        processNextQueueItem();
        return;
    }

    if (!hiddenVideoElement) {
        hiddenVideoElement = document.createElement('video');
        hiddenVideoElement.muted = true;
        hiddenVideoElement.playsInline = true;
        hiddenVideoElement.preload = 'auto';
        hiddenVideoElement.crossOrigin = 'use-credentials';
        hiddenVideoElement.style.position = 'fixed';
        hiddenVideoElement.style.top = '-100px';
        hiddenVideoElement.style.left = '-100px';
        hiddenVideoElement.style.width = '10px';
        hiddenVideoElement.style.height = '10px';
        hiddenVideoElement.style.opacity = '0';
        hiddenVideoElement.style.pointerEvents = 'none';
        document.body.appendChild(hiddenVideoElement);
    }

    if (!hiddenCanvasElement) {
        hiddenCanvasElement = document.createElement('canvas');
        hiddenCanvasElement.width = 160;
        hiddenCanvasElement.height = 90;
    }

    const video = hiddenVideoElement;
    const canvas = hiddenCanvasElement;
    const ctx = canvas.getContext('2d');

    let isSeeked = false;

    let timeoutId = setTimeout(() => {
        if (!isSeeked) {
            // Graceful degradation — show placeholder instead of error
            isSeeked = true;
            const transparentGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            thumbnailCache.set(item.key, transparentGif);
            item.callback(transparentGif);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            thumbnailQueue.shift();
            processNextQueueItem();
        }
    }, 30000);

    const onSeeked = () => {
        if (!isSeeked) {
            isSeeked = true;
            clearTimeout(timeoutId);
            try {
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                    thumbnailCache.set(item.key, dataUrl);
                    item.callback(dataUrl);
                }
            } catch (err) {
                console.error('Error drawing frame to canvas:', err);
                const transparentGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                thumbnailCache.set(item.key, transparentGif);
                item.callback(transparentGif);
            }
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            
            thumbnailQueue.shift();
            processNextQueueItem();
        }
    };

    const onError = (e: any) => {
        clearTimeout(timeoutId);
        console.error('Video thumbnail load error:', e);
        const transparentGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        thumbnailCache.set(item.key, transparentGif);
        item.callback(transparentGif);

        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);

        thumbnailQueue.shift();
        processNextQueueItem();
    };

    const performSeek = () => {
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        video.currentTime = item.time;
    };

    const targetSrc = item.videoUrl;
    if (video.src !== targetSrc && !video.src.endsWith(targetSrc)) {
        const onMetadataLoaded = () => {
            video.removeEventListener('loadedmetadata', onMetadataLoaded);
            performSeek();
        };
        video.addEventListener('loadedmetadata', onMetadataLoaded);
        video.src = targetSrc;
        video.load();
    } else {
        if (video.readyState >= 1) {
            performSeek();
        } else {
            const onMetadataLoaded = () => {
                video.removeEventListener('loadedmetadata', onMetadataLoaded);
                performSeek();
            };
            video.addEventListener('loadedmetadata', onMetadataLoaded);
        }
    }
}

const TimelineThumbnail = React.memo(({ videoUrl, time }: { videoUrl: string; time: number }) => {
    const key = `${videoUrl}#t=${time.toFixed(2)}`;
    const [src, setSrc] = useState<string>(thumbnailCache.get(key) || '');

    useEffect(() => {
        if (src) return;

        thumbnailQueue.push({
            key,
            videoUrl,
            time,
            callback: (dataUrl) => {
                setSrc(dataUrl);
            }
        });

        if (!isProcessingQueue) {
            processNextQueueItem();
        }

        return () => {
            const idx = thumbnailQueue.findIndex(item => item.key === key);
            if (idx > -1) {
                thumbnailQueue.splice(idx, 1);
            }
        };
    }, [key, videoUrl, time, src]);

    if (!src) {
        return (
            <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />
            </div>
        );
    }

    return (
        <img 
            src={src} 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover opacity-80 select-none pointer-events-none" 
        />
    );
});
TimelineThumbnail.displayName = 'TimelineThumbnail';

function getFullUrl(pathOrUrl: string): string {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    const base = getApiUrl();
    const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${base}${cleanPath}`;
}

function getV1ClipVideoUrl(clip: KeepSegment, videoSrc: string): string {
    if (!clip.source || clip.source === 'main') {
        return videoSrc;
    }
    return getFullUrl(clip.source);
}

function getV2ClipVideoUrl(broll: any, videoSrc: string): string {
    if (broll.broll_url) return broll.broll_url;
    if (broll.resolved_path) return getFullUrl(broll.resolved_path);
    return videoSrc;
}

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
    
    // Mapping from absolute video time to snapped project time
    const absToProj = useCallback((absoluteTime: number) => {
        if (!multiTrackEdl?.v1 || multiTrackEdl.v1.length === 0) return absoluteTime;
        let projectTime = 0;
        const sortedClips = [...multiTrackEdl.v1].sort((a, b) => a.start - b.start);
        for (const clip of sortedClips) {
            if (absoluteTime >= clip.end) {
                projectTime += (clip.end - clip.start);
            } else if (absoluteTime >= clip.start) {
                projectTime += (absoluteTime - clip.start);
                break;
            } else {
                break; // inside a gap, snap to the boundary
            }
        }
        return projectTime;
    }, [multiTrackEdl?.v1]);

    // Mapping from snapped project time to absolute video time
    const projToAbs = useCallback((projectTime: number) => {
        if (!multiTrackEdl?.v1 || multiTrackEdl.v1.length === 0) return projectTime;
        let accum = 0;
        const sortedClips = [...multiTrackEdl.v1].sort((a, b) => a.start - b.start);
        for (const clip of sortedClips) {
            const len = clip.end - clip.start;
            if (projectTime <= accum + len) {
                return clip.start + (projectTime - accum);
            }
            accum += len;
        }
        return sortedClips.length > 0 ? sortedClips[sortedClips.length - 1].end : projectTime;
    }, [multiTrackEdl?.v1]);

    // Total duration of the project (sum of keep segment lengths)
    const projectDuration = useMemo(() => {
        if (!multiTrackEdl?.v1 || multiTrackEdl.v1.length === 0) return duration || 10;
        return multiTrackEdl.v1.reduce((sum, clip) => sum + (clip.end - clip.start), 0);
    }, [multiTrackEdl?.v1, duration]);

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
    
    const [trimState, setTrimState] = useState<{ 
        track: 'v1' | 'a1' | 't1' | 'v2' | 'm1' | 'sfx' | 'c1' | 'g1' | 's1',
        clipIndex: number, 
        type: 'left' | 'right', 
        startX: number, 
        initialTime: number,
        pointerId: number,
        originStart: number,
        originEnd: number,
        rawIndex?: number,
    } | null>(null);
    const [previewTrim, setPreviewTrim] = useState<{time: number} | null>(null);

    // NEW State for horizontal clip dragging
    const [dragState, setDragState] = useState<{
        track: 'v1' | 'a1' | 't1' | 'v2' | 'm1' | 'sfx' | 'g1' | 's1' | 'c1',
        clipIndex: number,
        startX: number,
        initialStart: number,
        initialEnd: number,
        pointerId: number,
        rawIndex?: number,
    } | null>(null);
    const [previewDrag, setPreviewDrag] = useState<{ start: number, end: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
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
            const projectDropTime = percent * projectDuration;
            const dropTime = Number(projToAbs(projectDropTime).toFixed(2));

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
                const clipLen = Math.min(3.5, Math.max(1.5, Number(assetData.duration) || 3.0));
                newEdit = {
                    action: "add_broll",
                    start: dropTime,
                    end: Math.min(dropTime + clipLen, duration),
                    query: assetData.filename,
                    resolved_path: assetData.path,
                    asset_id: assetData.id,
                    media_type: assetData.media_type || (/\.(jpe?g|png|webp|gif)$/i.test(assetData.path || "") ? "image" : "video"),
                    source: "user",
                    layout: "full"
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
                    const rawIdx = parseInt(selectedClipId.replace('G1-Graphic-', ''), 10);
                    if (onActiveEditsChange && Number.isFinite(rawIdx)) {
                        onActiveEditsChange(activeEdits.filter((_, i) => i !== rawIdx));
                    }
                } else if (selectedClipId.startsWith('S1-Scene-')) {
                    const rawIdx = parseInt(selectedClipId.replace('S1-Scene-', ''), 10);
                    const targetClip = sceneClips.find(c => c.rawIndex === rawIdx);
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

    // Process Graphics Clips list supporting dragging + trim preview
    const isTitleBroll = (e: any) => {
        if (e?.graphic_kind === 'map' || e?.graphic_kind === 'diagram') return false;
        const mode = String(e?.mode || e?.layout || e?.graphic_kind || '');
        return mode === 'full_broll' || mode === 'fullscreen' || e?.graphic_kind === 'title';
    };
    const isHtmlGraphic = (e: any) =>
        e.action === "canvas_overlay" || e.action === "hyperframes_html" ||
        e.action === 'add_hyperframes_graphics' || e.action === 'add_motion_graphic' ||
        e.action === 'add_dynamic_graphic' ||
        (e.action === 'add_text_overlay' && !e.is_subtitle);

    const graphicClips: {start: number, end: number, id: string, label: string, rawIndex: number}[] = [];
    activeEdits.forEach((e, idx) => {
        if (!isHtmlGraphic(e) || isTitleBroll(e)) return;
        // Skip edits without any visual payload (empty placeholders)
        if (!(e.html_content || e.html || e.action === 'add_text_overlay' || e.action === 'add_motion_graphic')) return;
        
        let start = e.start != null ? e.start : 0;
        let end = e.end != null ? e.end : start + (e.duration != null ? e.duration : 3);
        
        const gIdx = graphicClips.length;
        if (dragState?.track === 'g1' && dragState.clipIndex === gIdx && previewDrag) {
            start = previewDrag.start;
            end = previewDrag.end;
        } else if (trimState?.track === 'g1' && trimState.clipIndex === gIdx && previewTrim) {
            if (trimState.type === 'left') start = previewTrim.time;
            else end = previewTrim.time;
        }

        let label = "плашка";
        if (e.action === 'add_motion_graphic') label = `motion (${e.style || 'style'})`;
        else if (e.action === 'add_dynamic_graphic') label = `dynamic (${e.elements?.length || 0} el)`;
        else if (e.action === 'add_text_overlay') label = `text: "${(e.text || '').slice(0, 18)}"`;
        else if (e.action === 'add_hyperframes_graphics') label = "плашка";
        else if (e.graphic_kind === 'map' || e.graphic_kind === 'diagram') label = "карта мысли";
        else if (e.action === 'canvas_overlay' || e.action === 'hyperframes_html') {
            label = e.style ? `плашка (${e.style})` : "плашка";
        }
        
        graphicClips.push({
            start,
            end,
            // Stable id = raw edit index so player can resolve selection reliably
            id: String(idx),
            label,
            rawIndex: idx
        });
    });

    // Process Scene Clips list supporting dragging + trim preview
    const sceneClips: {start: number, end: number, id: string, label: string, rawIndex: number}[] = [];
    activeEdits.forEach((e, idx) => {
        const isSemantic = e.action === 'semantic_scene' || e.action === 'scene_override';
        const isTitle = isHtmlGraphic(e) && isTitleBroll(e) && !!(e.html_content || e.html);
        if (!isSemantic && !isTitle) return;
        
        let start = e.start != null ? e.start : 0;
        let end = e.end != null ? e.end : start + (e.duration != null ? e.duration : 3);
        
        const sIdx = sceneClips.length;
        if (dragState?.track === 's1' && dragState.clipIndex === sIdx && previewDrag) {
            start = previewDrag.start;
            end = previewDrag.end;
        } else if (trimState?.track === 's1' && trimState.clipIndex === sIdx && previewTrim) {
            if (trimState.type === 'left') start = previewTrim.time;
            else end = previewTrim.time;
        }
        
        sceneClips.push({
            start,
            end,
            id: e.id || `${e.action}-${idx}`,
            label: isTitle ? 'TITLE' : (e.scene_data?.scene_template || e.style || 'semantic'),
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
        const projectTime = percent * projectDuration;
        const absoluteTime = projToAbs(projectTime);
        
        videoRef.current.currentTime = absoluteTime;
        if (audioRef?.current) audioRef.current.currentTime = absoluteTime;
        setTimelineTime(absoluteTime);
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

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.altKey) {
                e.preventDefault();
                const zoomStep = 25;
                if (e.deltaY > 0) {
                    setZoom(prev => Math.max(100, prev - zoomStep));
                } else if (e.deltaY < 0) {
                    setZoom(prev => Math.min(1000, prev + zoomStep));
                }
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, []);

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
            if (movedRef.current) {
                movedRef.current = false;
                return;
            }
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

    const trimActiveRef = useRef(false);
    const dragActiveRef = useRef(false);
    const movedRef = useRef(false);

    // Trim handler
    const handleTrimStart = (
        e: React.PointerEvent,
        track: 'v1'|'a1'|'t1'|'v2'|'m1'|'sfx'|'c1'|'g1'|'s1',
        clipIndex: number,
        type: 'left' | 'right',
        initialTime: number,
        originStart?: number,
        originEnd?: number,
        rawIndex?: number,
    ) => {
        if (activeTool !== 'pointer') return;
        e.stopPropagation();
        e.preventDefault();
        e.nativeEvent.stopImmediatePropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        trimActiveRef.current = true;
        setDragState(null);
        setPreviewDrag(null);
        const originS = originStart ?? initialTime;
        const originE = originEnd ?? initialTime;
        setTrimState({
            track,
            clipIndex,
            type,
            startX: e.clientX,
            initialTime,
            pointerId: e.pointerId,
            originStart: originS,
            originEnd: originE,
            rawIndex,
        });
        setPreviewTrim({ time: initialTime });
    };

    const handleTrimMove = (e: React.PointerEvent | PointerEvent) => {
        if (!trimState || e.pointerId !== trimState.pointerId) return;
        const lane = document.querySelector(`[data-timeline-lane="${trimState.track}"]`) as HTMLElement | null;
        const el = lane || containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || projectDuration <= 0) return;
        // Edge follows the cursor on this lane (not the ruler), so left/right trim stay symmetric.
        const pct = (e.clientX - rect.left) / rect.width;
        const projectTime = Math.max(0, Math.min(1, pct)) * projectDuration;
        let newTime = projToAbs(projectTime);

        const track = trimState.track;
        const idx = trimState.clipIndex;
        let minBound = 0;
        let maxBound = duration;
        const MIN_CLIP = 0.15;
        const originStart = trimState.originStart;
        const originEnd = trimState.originEnd;

        if (track === 'v1' || track === 'a1') {
            const list = multiTrackEdl[track as 'v1' | 'a1'];
            const clip = list[idx];
            if (clip) {
                if (trimState.type === 'left') {
                    maxBound = clip.end - 0.1;
                    if (idx > 0) {
                        minBound = list[idx - 1].end + 0.01;
                    }
                } else {
                    minBound = clip.start + 0.1;
                    if (idx < list.length - 1) {
                        maxBound = list[idx + 1].start - 0.01;
                    }
                }
            }
        } else if (trimState.type === 'left') {
            minBound = 0;
            maxBound = originEnd - MIN_CLIP;
        } else {
            minBound = originStart + MIN_CLIP;
            maxBound = duration;
        }

        newTime = Math.max(minBound, Math.min(newTime, maxBound));
        if (Math.abs(e.clientX - trimState.startX) > 4) movedRef.current = true;
        setPreviewTrim({ time: newTime });
    };

    const handleTrimEnd = (e?: React.PointerEvent | PointerEvent) => {
        if (!trimActiveRef.current || !trimState || !previewTrim) return;
        trimActiveRef.current = false;
        try {
            const target = e?.currentTarget as Element | undefined;
            if (target && 'releasePointerCapture' in target && e) {
                target.releasePointerCapture(e.pointerId);
            }
        } catch { /* already released */ }

        const trim = trimState;
        const preview = previewTrim;
        // Clear preview immediately so a second pointerup cannot double-apply
        setTrimState(null);
        setPreviewTrim(null);

        if (trim.track === 'v2') {
            if (onActiveEditsChange) {
                const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                const updated = brolls.map((b, i) => {
                    if (i !== trim.clipIndex) return b;
                    return trim.type === 'left'
                        ? { ...b, start: preview.time }
                        : { ...b, end: preview.time };
                });
                onActiveEditsChange([...others, ...updated]);
            }
        } else if (trim.track === 'm1' || trim.track === 'sfx') {
            if (onActiveEditsChange) {
                const updated = activeEdits.map((asset, i) => {
                    if (i !== trim.clipIndex) return asset;
                    return trim.type === 'left'
                        ? { ...asset, start: preview.time }
                        : { ...asset, end: preview.time };
                });
                onActiveEditsChange(updated);
            }
        } else if (trim.track === 'c1') {
            if (onActiveEditsChange) {
                const targetClip = colorClips[trim.clipIndex];
                if (targetClip) {
                    const updated = activeEdits.map((ae, i) => {
                        if (i !== targetClip.rawIndex) return ae;
                        return trim.type === 'left'
                            ? { ...ae, start: preview.time }
                            : { ...ae, end: preview.time };
                    });
                    onActiveEditsChange(updated);
                }
            }
        } else if (trim.track === 'g1') {
            if (onActiveEditsChange) {
                const rawIndex = trim.rawIndex ?? graphicClips[trim.clipIndex]?.rawIndex;
                if (rawIndex != null) {
                    const updated = activeEdits.map((ae, i) => {
                        if (i !== rawIndex) return ae;
                        const newStart = trim.type === 'left' ? preview.time : trim.originStart;
                        const newEnd = trim.type === 'right' ? preview.time : trim.originEnd;
                        return patchGraphicEditTiming(ae, newStart, newEnd);
                    });
                    onActiveEditsChange(updated);
                }
            }
        } else if (trim.track === 's1') {
            if (onActiveEditsChange) {
                const rawIndex = trim.rawIndex ?? sceneClips[trim.clipIndex]?.rawIndex;
                if (rawIndex != null) {
                    const updated = activeEdits.map((ae, i) => {
                        if (i !== rawIndex) return ae;
                        const newStart = trim.type === 'left' ? preview.time : trim.originStart;
                        const newEnd = trim.type === 'right' ? preview.time : trim.originEnd;
                        return patchGraphicEditTiming(ae, newStart, newEnd);
                    });
                    onActiveEditsChange(updated);
                }
            }
        } else if (trim.track === 't1') {
            if (onActiveEditsChange) {
                const idx = trim.clipIndex;
                const chunk = subtitleChunks[idx];
                if (chunk) {
                    const others = activeEdits.filter(ae => !(ae.action === 'subtitle_override' && ae.chunk_index === idx));
                    const overrideForChunk = activeEdits.find(ae => ae.action === 'subtitle_override' && ae.chunk_index === idx);
                    const spokenText = chunk.words.map((w: any) => w.word).join(' ');
                    const text = overrideForChunk?.text || spokenText || '';
                    const newStart = trim.type === 'left' ? preview.time : (overrideForChunk?.start != null ? overrideForChunk.start : chunk.start);
                    const newEnd = trim.type === 'right' ? preview.time : (overrideForChunk?.end != null ? overrideForChunk.end : chunk.end);
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
            const edlKey = trim.track as 'v1' | 'a1';
            const newEdl = { ...multiTrackEdl, [edlKey]: multiTrackEdl[edlKey].map((clip, i) => {
                if (i !== trim.clipIndex) return clip;
                return trim.type === 'left'
                    ? { ...clip, start: preview.time }
                    : { ...clip, end: preview.time };
            })};
            onEdlChange(newEdl);
        }
    };

    // Keep trim working even if pointer leaves the tiny edge handle
    const trimMoveRef = useRef(handleTrimMove);
    const trimEndRef = useRef(handleTrimEnd);
    trimMoveRef.current = handleTrimMove;
    trimEndRef.current = handleTrimEnd;
    useEffect(() => {
        if (!trimState) return;
        const onMove = (e: PointerEvent) => trimMoveRef.current(e);
        const onUp = (e: PointerEvent) => trimEndRef.current(e);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [trimState]);

    // Horizontal Clip Dragging Handlers
    const handleDragStart = (
        e: React.PointerEvent,
        track: 'v1'|'a1'|'t1'|'v2'|'m1'|'sfx'|'g1'|'s1'|'c1',
        clipIndex: number,
        initialStart: number,
        initialEnd: number,
        rawIndex?: number,
    ) => {
        if (activeTool !== 'pointer') return;
        if (trimActiveRef.current) return;
        const hit = e.target as HTMLElement;
        if (hit.closest?.('[data-trim-edge]') || hit.classList.contains('cursor-ew-resize')) return;

        e.stopPropagation();
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        dragActiveRef.current = true;
        movedRef.current = false;
        setDragState({
            track,
            clipIndex,
            startX: e.clientX,
            initialStart,
            initialEnd,
            pointerId: e.pointerId,
            rawIndex,
        });
        setPreviewDrag({ start: initialStart, end: initialEnd });
    };

    const handleDragMove = (e: React.PointerEvent | PointerEvent) => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const lane = document.querySelector(`[data-timeline-lane="${dragState.track}"]`) as HTMLElement | null;
        const el = lane || containerRef.current;
        if (!el) return;
        const trackWidth = el.getBoundingClientRect().width || 1;
        if (trackWidth < 2 || projectDuration <= 0) return;
        const dx = e.clientX - dragState.startX;
        if (Math.abs(dx) > 4) movedRef.current = true;
        const deltaSec = (dx / trackWidth) * projectDuration;

        const clipDur = Math.max(0.15, dragState.initialEnd - dragState.initialStart);
        const newProjStart = absToProj(dragState.initialStart) + deltaSec;
        let newStart = projToAbs(newProjStart);
        newStart = Math.max(0, Math.min(newStart, Math.max(0, duration - clipDur)));
        setPreviewDrag({ start: newStart, end: newStart + clipDur });
    };

    const handleDragEnd = (e?: React.PointerEvent | PointerEvent) => {
        if (!dragActiveRef.current || !dragState || !previewDrag) return;
        dragActiveRef.current = false;
        try {
            const target = e?.currentTarget as Element | undefined;
            if (target && 'releasePointerCapture' in target && e) {
                (target as HTMLElement).releasePointerCapture?.(e.pointerId);
            }
        } catch { /* already released */ }

        const drag = dragState;
        const preview = previewDrag;
        setDragState(null);
        setPreviewDrag(null);

        const moved = Math.abs((preview.start ?? 0) - drag.initialStart) > 0.04;
        if (!moved) return;
        if (!onActiveEditsChange && (drag.track === 'g1' || drag.track === 's1')) return;

        if (drag.track === 'v2') {
            if (onActiveEditsChange) {
                const brolls = activeEdits.filter(ae => ae.action === 'add_broll');
                const others = activeEdits.filter(ae => ae.action !== 'add_broll');
                const updated = brolls.map((b, i) => {
                    if (i !== drag.clipIndex) return b;
                    return { ...b, start: preview.start, end: preview.end };
                });
                onActiveEditsChange([...others, ...updated]);
            }
        } else if (drag.track === 'm1' || drag.track === 'sfx') {
            if (onActiveEditsChange) {
                const updated = activeEdits.map((asset, i) => {
                    if (i !== drag.clipIndex) return asset;
                    return { ...asset, start: preview.start, end: preview.end };
                });
                onActiveEditsChange(updated);
            }
        } else if (drag.track === 'g1') {
            if (onActiveEditsChange) {
                const rawIndex = drag.rawIndex ?? graphicClips[drag.clipIndex]?.rawIndex;
                if (rawIndex != null) {
                    const updated = activeEdits.map((ae, i) =>
                        i === rawIndex ? patchGraphicEditTiming(ae, preview.start, preview.end) : ae
                    );
                    onActiveEditsChange(updated);
                }
            }
        } else if (drag.track === 'c1') {
            if (onActiveEditsChange) {
                const targetClip = colorClips[drag.clipIndex];
                if (targetClip) {
                    const updated = activeEdits.map((ae, i) => {
                        if (i === targetClip.rawIndex) {
                            return { ...ae, start: preview.start, end: preview.end };
                        }
                        return ae;
                    });
                    onActiveEditsChange(updated);
                }
            }
        } else if (drag.track === 's1') {
            if (onActiveEditsChange) {
                const rawIndex = drag.rawIndex ?? sceneClips[drag.clipIndex]?.rawIndex;
                if (rawIndex != null) {
                    const updated = activeEdits.map((ae, i) =>
                        i === rawIndex ? patchGraphicEditTiming(ae, preview.start, preview.end) : ae
                    );
                    onActiveEditsChange(updated);
                }
            }
        } else if (drag.track === 't1') {
            if (onActiveEditsChange) {
                const idx = drag.clipIndex;
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
                        start: preview.start,
                        end: preview.end
                    }]);
                }
            }
        } else {
            const edlKey = drag.track;
            const newEdl = { ...multiTrackEdl, [edlKey]: multiTrackEdl[edlKey as 'v1'|'a1'].map((clip, i) => {
                if (i !== drag.clipIndex) return clip;
                return { ...clip, start: preview.start, end: preview.end };
            })};
            onEdlChange(newEdl);
        }
    };

    const dragMoveRef = useRef(handleDragMove);
    const dragEndRef = useRef(handleDragEnd);
    dragMoveRef.current = handleDragMove;
    dragEndRef.current = handleDragEnd;
    useEffect(() => {
        if (!dragState) return;
        const onMove = (e: PointerEvent) => dragMoveRef.current(e);
        const onUp = (e: PointerEvent) => dragEndRef.current(e);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [dragState]);

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

    const isS1Visible = true;
    const isC1Visible = true;
    const isG1Visible = true;
    const isT1Visible = true;
    const isV2Visible = true;
    const isSFXVisible = true;
    const isM1Visible = true;

    const rulerTicks = Array.from({length: 11}, (_, i) => (projectDuration / 10) * i);

    if (!duration || duration <= 0) {
        return <div className="p-6 text-zinc-650 font-mono text-[11px] lowercase">loading timeline...</div>;
    }

    return (
        <div className={`flex flex-col h-full bg-card overflow-hidden rounded-md select-none font-mono transition-all duration-300 shadow-sm border border-black/5 dark:border-white/10 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-xl ${
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
                    const rawIdx = parseInt(selectedClipId.replace('S1-Scene-', ''), 10);
                    const targetClip = sceneClips.find(c => c.rawIndex === rawIdx);
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
                    const rawIdx = parseInt(selectedClipId.replace('G1-Graphic-', ''), 10);
                    const graphic = Number.isFinite(rawIdx) ? activeEdits[rawIdx] : null;
                    const targetClip = graphicClips.find(c => c.rawIndex === rawIdx);
                    if (!graphic) return null;
                    clipTitle = `🎨 Graphic: ${targetClip?.label || graphic.action}`;
                    clipStart = graphic.start != null ? graphic.start : 0;
                    clipEnd = graphic.end != null
                        ? graphic.end
                        : clipStart + (graphic.duration != null ? graphic.duration : 3);
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
                        const rawIdx = parseInt(selectedClipId.replace('S1-Scene-', ''), 10);
                        const targetClip = sceneClips.find(c => c.rawIndex === rawIdx);
                        if (targetClip && onActiveEditsChange) {
                            const updated = activeEdits.map((ae, i) =>
                                i === targetClip.rawIndex ? patchGraphicEditTiming(ae, newStart, newEnd) : ae
                            );
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
                        const rawIdx = parseInt(selectedClipId.replace('G1-Graphic-', ''), 10);
                        if (Number.isFinite(rawIdx) && onActiveEditsChange) {
                            const updated = activeEdits.map((ae, i) =>
                                i === rawIdx ? patchGraphicEditTiming(ae, newStart, newEnd) : ae
                            );
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
                        const rawIdx = parseInt(selectedClipId.replace('S1-Scene-', ''), 10);
                        const targetClip = sceneClips.find(c => c.rawIndex === rawIdx);
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
                        const rawIdx = parseInt(selectedClipId.replace('G1-Graphic-', ''), 10);
                        if (Number.isFinite(rawIdx) && onActiveEditsChange) {
                            onActiveEditsChange(activeEdits.filter((_, i) => i !== rawIdx));
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
                        const rawIdx = parseInt(selectedClipId.replace('S1-Scene-', ''), 10);
                        const targetClip = sceneClips.find(c => c.rawIndex === rawIdx);
                        if (targetClip && onActiveEditsChange) {
                            const target = activeEdits[targetClip.rawIndex];
                            const first = { ...target, end: splitTime };
                            const second = { ...target, start: splitTime };
                            const updated = [...activeEdits];
                            updated.splice(targetClip.rawIndex, 1, first, second);
                            onActiveEditsChange(updated);
                            setSelectedClipId(`S1-Scene-${targetClip.rawIndex}`);
                        }
                    }
                    else if (selectedClipId.startsWith('T1-Sub-')) {
                        const idx = parseInt(selectedClipId.replace('T1-Sub-', ''), 10);
                        const newEdl = {
                            v1: [...multiTrackEdl.v1],
                            a1: [...multiTrackEdl.a1]
                        };
                        const clip = newEdl.v1[idx];
                        newEdl.v1.splice(idx, 1, 
                            {start: clip.start, end: splitTime - 0.01},
                            {start: splitTime + 0.01, end: clip.end}
                        );
                        onEdlChange(newEdl);
                        setSelectedClipId(`T1-Sub-${idx + 1}`);
                    }
                    else if (selectedClipId.startsWith('G1-Graphic-')) {
                        const rawIdx = parseInt(selectedClipId.replace('G1-Graphic-', ''), 10);
                        if (Number.isFinite(rawIdx) && onActiveEditsChange) {
                            const target = activeEdits[rawIdx];
                            if (target) {
                                const first = { ...target, end: splitTime };
                                const second = { ...target, start: splitTime };
                                const updated = [...activeEdits];
                                updated.splice(rawIdx, 1, first, second);
                                onActiveEditsChange(updated);
                                setSelectedClipId(`G1-Graphic-${rawIdx + 1}`);
                            }
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
                        const newEdl = {
                            v1: [...multiTrackEdl.v1],
                            a1: [...multiTrackEdl.a1]
                        };
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
                        const newEdl = {
                            v1: [...multiTrackEdl.v1],
                            a1: [...multiTrackEdl.a1]
                        };
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
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0.15"
                                    max={duration}
                                    value={Number(Math.max(0.15, clipEnd - clipStart).toFixed(2))}
                                    onChange={(ev) => {
                                        const d = parseFloat(ev.target.value);
                                        if (!Number.isFinite(d)) return;
                                        handleManualUpdate(clipStart, clipStart + Math.max(0.15, d));
                                    }}
                                    className="w-10 bg-zinc-950/80 border border-white/10 rounded px-1 py-0.5 text-[10px] md:text-[11px] font-mono text-zinc-100 focus:outline-none focus:border-amber-500/40 text-center shadow-sm"
                                />
                                <span className="text-zinc-650 font-mono text-[9px] md:text-[11px]">s</span>
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
                                    title="Разрезать клип"
                                >
                                    <span>Разрезать</span>
                                </button>
                            )}
                            <button
                                onClick={handleManualDelete}
                                className="h-5 px-1.5 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 hover:border-red-500/50 text-red-400 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-0.5 active:scale-95 shadow-sm"
                                title="Удалить клип"
                            >
                                <span>Удалить</span>
                            </button>
                            <button
                                onClick={() => setSelectedClipId(null)}
                                className="h-5 w-5 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-400 hover:text-white rounded flex items-center justify-center text-[10px] font-bold cursor-pointer transition-all active:scale-90"
                                title="Закрыть"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Tracks Container — row layout: label + lane share one flex row (no vertical drift on scroll) */}
            <div 
                ref={scrollContainerRef}
                className={`flex flex-1 relative overflow-auto bg-background scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent transition-all duration-300 ${
                    isFocusSelectionActive ? 'cursor-crosshair' : ''
                }`}
            >
                <div
                    className="relative flex flex-col min-h-full"
                    style={{
                        width: `${Math.max(100, zoom)}%`,
                        minWidth: '100%',
                    }}
                >
                    {/* Time ruler row */}
                    <div className="flex h-10 shrink-0 sticky top-0 z-50 border-b border-border bg-card">
                        <div className="w-24 md:w-36 shrink-0 sticky left-0 z-[60] bg-[#161618] border-r border-white/5 flex items-center gap-1.5 px-2.5 font-sans">
                            <button type="button" className="w-7 h-7 rounded-md bg-[#222224]/80 hover:bg-[#2c2c2e] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer shadow-sm">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                            <button type="button" onClick={() => setZoom(prev => Math.max(100, prev - 50))} className="w-7 h-7 rounded-md bg-[#222224]/80 hover:bg-[#2c2c2e] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer shadow-sm" title="Zoom Out">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                                </svg>
                            </button>
                            <button type="button" onClick={() => setZoom(prev => Math.min(1000, prev + 50))} className="w-7 h-7 rounded-md bg-[#222224]/80 hover:bg-[#2c2c2e] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer shadow-sm" title="Zoom In">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                                </svg>
                            </button>
                        </div>
                        <div
                            ref={containerRef}
                            className="flex-1 min-w-0 relative cursor-ew-resize"
                            onPointerDown={handleScrubStart}
                        >
                            {rulerTicks.map((t, i) => (
                                <div
                                    key={i}
                                    className="absolute flex flex-col items-start"
                                    style={{ left: `${(t / projectDuration) * 100}%` }}
                                >
                                    <div className="h-1.5 w-[1px] bg-zinc-700" />
                                    <span className="text-[11px] font-mono text-zinc-650 ml-1 mt-0.5">{formatTime(t)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                        {/* S1 (Scenes) Track */}
                        {isS1Visible && (
                            <div className="flex h-12 shrink-0 w-full">
                                <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#1a1420] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-purple-500 border-r border-white/5 font-sans">
                                    <span className="text-[9px] font-mono font-bold text-purple-300/90 bg-purple-500/15 px-1.5 py-0.5 rounded shrink-0">S1</span>
                                    <span className="hidden md:inline text-[11px] text-purple-200/90 font-semibold tracking-wide truncate">Тайтлы</span>
                                </div>
                            <div 
                                data-timeline-lane="s1"
                                onDragOver={(e) => handleDragOver(e, 's1')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 's1')}
                                className={`flex-1 min-w-0 h-12 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#1a1420]/40 ${
                                    dragOverTrack === 's1' 
                                        ? 'bg-purple-900/20 border-purple-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(168,85,247,0.15)] animate-pulse' 
                                        : ''
                                }`}
                            >
                                {sceneClips.map((clip, i) => {
                                    const clipId = `S1-Scene-${clip.rawIndex}`;
                                    const isSelected = selectedClipId === clipId;
                                    const raw = activeEdits[clip.rawIndex];
                                    const rawStart = raw?.start != null ? raw.start : 0;
                                    const rawEnd = raw?.end != null ? raw.end : rawStart + (raw?.duration ?? 3);
                                    const clipStart = clip.start;
                                    const clipEnd = clip.end;

                                    return (
                                        <div
                                            key={clipId}
                                            onClick={(e) => handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 's1')}
                                            onPointerDown={(e) => handleDragStart(e, 's1', i, rawStart, rawEnd, clip.rawIndex)}
                                            title="Центр — сдвиг по таймлайну · края — длительность"
                                            className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-visible flex items-center cursor-grab active:cursor-grabbing transition-all px-3 gap-1.5 shadow-sm ${
                                                isSelected 
                                                    ? 'bg-[#3f2953] border border-purple-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]' 
                                                    : 'bg-[#2a1e35] border border-purple-500/20 hover:border-purple-500/50 text-white'
                                            }`}
                                            style={{ left: `${(absToProj(clipStart) / projectDuration) * 100}%`, width: `max(18px, ${((absToProj(clipEnd) - absToProj(clipStart)) / projectDuration) * 100}%)` }}
                                        >
                                            <span className="text-[9px] font-mono font-bold text-amber-300/90 pointer-events-none shrink-0">T</span>
                                            <span className="text-[10px] truncate pointer-events-none opacity-90">{clip.label}</span>
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div data-trim-edge="left" className="touch-none absolute left-0 top-0 bottom-0 w-2.5 z-30 cursor-ew-resize flex items-center justify-start pl-[1px]" onPointerDown={(e) => handleTrimStart(e, 's1', i, 'left', rawStart, rawStart, rawEnd, clip.rawIndex)}>
                                                        <span className="pointer-events-none w-[3px] h-[62%] rounded-full bg-purple-200/85" />
                                                    </div>
                                                    <div data-trim-edge="right" className="touch-none absolute right-0 top-0 bottom-0 w-2.5 z-30 cursor-ew-resize flex items-center justify-end pr-[1px]" onPointerDown={(e) => handleTrimStart(e, 's1', i, 'right', rawEnd, rawStart, rawEnd, clip.rawIndex)}>
                                                        <span className="pointer-events-none w-[3px] h-[62%] rounded-full bg-purple-200/85" />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            </div>
                        )}

                        {/* G1 (Graphics) Track */}
                        {isG1Visible && (
                            <div className="flex h-12 shrink-0 w-full">
                                <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#1a1218] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-fuchsia-500 border-r border-white/5 font-sans">
                                    <span className="text-[9px] font-mono font-bold text-fuchsia-300/90 bg-fuchsia-500/15 px-1.5 py-0.5 rounded shrink-0">G1</span>
                                    <span className="hidden md:inline text-[11px] text-fuchsia-200/90 font-semibold tracking-wide truncate">Графика</span>
                                </div>
                            <div 
                                data-timeline-lane="g1"
                                onDragOver={(e) => handleDragOver(e, 'g1')}
                                // Reuse drag end callback
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'g1')}
                                className={`flex-1 min-w-0 h-12 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#1a1218]/50 ${
                                    dragOverTrack === 'g1' 
                                        ? 'bg-fuchsia-900/20 border-fuchsia-500/40 border border-dashed shadow-[inset_0_0_8px_rgba(217,70,239,0.15)]' 
                                        : ''
                                }`}
                            >
                                {graphicClips.map((clip, i) => {
                                    const clipId = `G1-Graphic-${clip.rawIndex}`;
                                    const isSelected = selectedClipId === clipId;
                                    const raw = activeEdits[clip.rawIndex];
                                    const rawStart = raw?.start != null ? raw.start : 0;
                                    const rawEnd = raw?.end != null ? raw.end : rawStart + (raw?.duration ?? 3);
                                    const clipStart = clip.start;
                                    const clipEnd = clip.end;
                                    const isDraggingThis = dragState?.track === 'g1' && dragState.clipIndex === i;
                                    const isTrimmingThis = trimState?.track === 'g1' && trimState.clipIndex === i;

                                    return (
                                        <div
                                            key={clipId}
                                            onClick={(e) => {
                                                if (movedRef.current) {
                                                    handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 'g1');
                                                    return;
                                                }
                                                handleClipClick(e, clipId, { start: rawStart, end: rawEnd }, i, 'g1');
                                                if (videoRef?.current) {
                                                    const t = videoRef.current.currentTime;
                                                    if (t < rawStart || t >= rawEnd) {
                                                        const seekTo = Math.min(rawStart + 0.08, Math.max(rawStart, rawEnd - 0.05));
                                                        videoRef.current.currentTime = seekTo;
                                                    }
                                                }
                                            }}
                                            onPointerDown={(e) => handleDragStart(e, 'g1', i, rawStart, rawEnd, clip.rawIndex)}
                                            title="Центр — перетащить на другой момент · края — длительность"
                                            className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-visible flex items-center px-3 gap-1.5 shadow-sm ${
                                                isDraggingThis || isTrimmingThis ? 'cursor-grabbing z-20' : 'cursor-grab'
                                            } ${
                                                isSelected 
                                                    ? 'bg-[#4a1a3a] border-2 border-fuchsia-400 text-white z-10 font-bold shadow-[0_0_14px_rgba(217,70,239,0.55)]' 
                                                    : 'bg-[#351828] border border-fuchsia-500/35 hover:border-fuchsia-400/70 text-fuchsia-50'
                                            }`}
                                            style={{
                                                left: `${(absToProj(clipStart) / projectDuration) * 100}%`,
                                                width: `${Math.max(0.8, ((absToProj(clipEnd) - absToProj(clipStart)) / projectDuration) * 100)}%`,
                                                minWidth: 56,
                                            }}
                                        >
                                            <span className="text-[9px] font-mono font-bold text-fuchsia-300/80 pointer-events-none shrink-0">G</span>
                                            <span className="text-[10px] truncate pointer-events-none opacity-90">{clip.label}</span>
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div data-trim-edge="left" className="touch-none absolute left-0 top-0 bottom-0 w-2.5 z-30 cursor-ew-resize flex items-center justify-start pl-[1px]" onPointerDown={(e) => handleTrimStart(e, 'g1', i, 'left', rawStart, rawStart, rawEnd, clip.rawIndex)}>
                                                        <span className="pointer-events-none w-[3px] h-[62%] rounded-full bg-fuchsia-200/90" />
                                                    </div>
                                                    <div data-trim-edge="right" className="touch-none absolute right-0 top-0 bottom-0 w-2.5 z-30 cursor-ew-resize flex items-center justify-end pr-[1px]" onPointerDown={(e) => handleTrimStart(e, 'g1', i, 'right', rawEnd, rawStart, rawEnd, clip.rawIndex)}>
                                                        <span className="pointer-events-none w-[3px] h-[62%] rounded-full bg-fuchsia-200/90" />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                                {graphicClips.length === 0 && (
                                    <span className="absolute left-3 text-[10px] text-zinc-600 pointer-events-none">нет графики</span>
                                )}
                            </div>
                            </div>
                        )}

                        {/* T1 (Subtitles) Track */}
                        {isT1Visible && (
                            <div className="flex h-12 shrink-0 w-full">
                                <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#121820] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-blue-500 border-r border-white/5 font-sans">
                                    <span className="text-[9px] font-mono font-bold text-blue-300/90 bg-blue-500/15 px-1.5 py-0.5 rounded shrink-0">T1</span>
                                    <span className="hidden md:inline text-[11px] text-blue-200/90 font-semibold tracking-wide truncate">Субтитры</span>
                                </div>
                            <div 
                                data-timeline-lane="t1"
                                onDragOver={(e) => handleDragOver(e, 't1')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 't1')}
                                className={`flex-1 min-w-0 h-12 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#121820]/40 ${
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
                                            className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-hidden flex items-center justify-center cursor-pointer transition-all shadow-sm ${
                                                isSelected 
                                                    ? 'bg-[#273d59] border border-blue-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(59,130,246,0.4)]' 
                                                    : 'bg-[#1c2c42] border border-blue-500/20 hover:border-blue-500/50 text-white'
                                            }`}
                                            style={{ left: `${(absToProj(clipStart) / projectDuration) * 100}%`, width: `${((absToProj(clipEnd) - absToProj(clipStart)) / projectDuration) * 100}%` }}
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
                                            ) : null}
                                            {activeTool === 'pointer' && !isEditing && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 't1', i, 'left', rawStart, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 't1', i, 'right', rawEnd, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>                 
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            </div>
                        )}

                        {/* V2 (B-ROLL) Track */}
                        {isV2Visible && (
                            <div className="flex h-20 shrink-0 w-full">
                                <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#121618] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-cyan-500 border-r border-white/5 font-sans">
                                    <span className="text-[9px] font-mono font-bold text-cyan-300/90 bg-cyan-500/15 px-1.5 py-0.5 rounded shrink-0">V2</span>
                                    <span className="hidden md:inline text-[11px] text-cyan-200/90 font-semibold tracking-wide truncate">B-roll</span>
                                </div>
                            <div 
                                data-timeline-lane="v2"
                                onDragOver={(e) => handleDragOver(e, 'v2')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'v2')}
                                className={`flex-1 min-w-0 h-20 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#121618]/40 ${
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
                                            className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-hidden flex items-center cursor-pointer transition-all border shadow-md ${
                                                isSelected 
                                                    ? 'bg-transparent text-white z-10 font-bold shadow-[0_0_12px_rgba(255,255,255,0.25)] border-white/30' 
                                                    : 'bg-transparent border-white/10 hover:border-white/20 text-zinc-300'
                                            }`}
                                            style={{ left: `${(absToProj(clipStart) / projectDuration) * 100}%`, width: `${((absToProj(clipEnd) - absToProj(clipStart)) / projectDuration) * 100}%` }}
                                        >
                                            {/* Visual Filmstrip Thumbnails for B-Roll */}
                                            <div className="absolute inset-0 flex overflow-hidden pointer-events-none opacity-45 hover:opacity-65 transition-opacity">
                                                {Array.from({ length: Math.max(1, Math.floor((clipEnd - clipStart) * 1.5)) }).map((_, fIdx) => {
                                                    const count = Math.max(1, Math.floor((clipEnd - clipStart) * 1.5));
                                                    const step = (clipEnd - clipStart) / count;
                                                    const frameTime = clipStart + fIdx * step;
                                                    const brollUrl = getV2ClipVideoUrl(broll, videoRef?.current?.src || '');
                                                    return (
                                                        <div 
                                                            key={fIdx} 
                                                            className="h-full border-r border-zinc-800/30 flex-1 min-w-[40px] bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center relative overflow-hidden"
                                                        >
                                                            <TimelineThumbnail videoUrl={brollUrl} time={frameTime} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'v2', i, 'left', rawStart, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'v2', i, 'right', rawEnd, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            </div>
                        )}

                        {/* C1 (Color Correction) Track */}
                        {isC1Visible && (
                            <div className="flex h-12 shrink-0 w-full">
                                <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#18160f] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-amber-500 border-r border-white/5 font-sans">
                                    <span className="text-[9px] font-mono font-bold text-amber-300/90 bg-amber-500/15 px-1.5 py-0.5 rounded shrink-0">C1</span>
                                    <span className="hidden md:inline text-[11px] text-amber-200/90 font-semibold tracking-wide truncate">Цветокор</span>
                                </div>
                            <div 
                                data-timeline-lane="c1"
                                onDragOver={(e) => handleDragOver(e, 'c1')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'c1')}
                                className={`flex-1 min-w-0 h-12 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#18160f]/40 ${
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
                                            className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-hidden flex items-center cursor-pointer transition-all px-3 gap-1.5 shadow-sm ${
                                                isSelected 
                                                    ? 'bg-[#3f2953] border border-purple-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]' 
                                                    : 'bg-[#2a1e35] border border-purple-500/20 hover:border-purple-500/50 text-white'
                                            }`}
                                            style={{ left: `${(absToProj(clipStart) / projectDuration) * 100}%`, width: `${((absToProj(clipEnd) - absToProj(clipStart)) / projectDuration) * 100}%` }}
                                        >
                                            
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'c1', i, 'left', rawStart, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'c1', i, 'right', rawEnd, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            </div>
                        )}

                        {/* V1 (Main Video) Track */}
                        <div className="flex h-20 shrink-0 w-full">
                            <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#141416] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-zinc-400 border-r border-white/5 font-sans">
                                <span className="text-[9px] font-mono font-bold text-zinc-300 bg-zinc-500/15 px-1.5 py-0.5 rounded shrink-0">V1</span>
                                <span className="hidden md:inline text-[11px] text-zinc-200 font-semibold tracking-wide truncate">Видео</span>
                            </div>
                        <div 
                            data-timeline-lane="v1"
                            onDragOver={(e) => handleDragOver(e, 'v1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'v1')}
                            className={`flex-1 min-w-0 h-20 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#141416]/50 ${
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

                                let accumLeft = 0;
                                for (let k = 0; k < i; k++) {
                                    const prevClip = multiTrackEdl.v1[k];
                                    accumLeft += (prevClip.end - prevClip.start);
                                }
                                const clipWidth = clipEnd - clipStart;

                                return (
                                    <div 
                                        key={clipId} 
                                        onClick={(e) => handleClipClick(e, clipId, clip, i, 'v1')} 
                                        onPointerDown={(e) => handleDragStart(e, 'v1', i, clip.start, clip.end)}
                                        onPointerMove={handleDragMove}
                                        onPointerUp={handleDragEnd}
                                        className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-hidden flex items-center group/clip ${activeTool === 'pointer' ? 'cursor-pointer' : 'cursor-crosshair'} ${
                                            isSelected 
                                                ? 'bg-transparent text-white z-10 font-bold shadow-[0_0_12px_rgba(255,255,255,0.25)] border-white/30 border' 
                                                : 'bg-transparent border-white/10 border hover:border-white/20 text-zinc-300'
                                        }`} 
                                        style={{ left: `${(accumLeft / projectDuration) * 100}%`, width: `${(clipWidth / projectDuration) * 100}%` }}
                                    >
                                        {/* Visual Filmstrip Thumbnails */}
                                        <div className="absolute inset-0 flex overflow-hidden pointer-events-none opacity-45 hover:opacity-65 transition-opacity">
                                            {Array.from({ length: Math.max(1, Math.floor((clipEnd - clipStart) * 1.5)) }).map((_, fIdx) => {
                                                const count = Math.max(1, Math.floor((clipEnd - clipStart) * 1.5));
                                                const step = (clipEnd - clipStart) / count;
                                                const frameTime = clipStart + fIdx * step;
                                                const videoUrl = getV1ClipVideoUrl(clip, videoRef?.current?.src || '');
                                                return (
                                                    <div 
                                                        key={fIdx} 
                                                        className="h-full border-r border-zinc-800/30 flex-1 min-w-[40px] bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center relative overflow-hidden"
                                                    >
                                                        <TimelineThumbnail videoUrl={videoUrl} time={frameTime} />
                                                        {/* Sprocket holes */}
                                                        <div className="absolute top-0.5 left-0 right-0 flex justify-between px-1 z-10">
                                                            <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                            <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                            <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                        </div>
                                                        <div className="absolute bottom-0.5 left-0 right-0 flex justify-between px-1 z-10">
                                                            <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                            <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                            <div className="w-1 h-0.5 bg-black/40 rounded-sm"></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {activeTool === 'pointer' && (
                                            <>
                                                <div className={`touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'v1', i, 'left', clip.start, clip.start, clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className={`touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'v1', i, 'right', clip.end, clip.start, clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        </div>

                        {/* Premiere Pro style separator */}
                        <div className="flex h-1 shrink-0 w-full">
                            <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 bg-[#161618] border-y border-white/5 border-r border-white/5" />
                            <div className="flex-1 min-w-0 h-1 bg-neutral-900 border-y border-neutral-800/30 relative" />
                        </div>

                        {/* A1 (Main Audio) Track */}
                        <div className="flex h-14 shrink-0 w-full">
                            <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#0f1614] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-emerald-500 border-r border-white/5 font-sans">
                                <span className="text-[9px] font-mono font-bold text-emerald-300/90 bg-emerald-500/15 px-1.5 py-0.5 rounded shrink-0">A1</span>
                                <span className="hidden md:inline text-[11px] text-emerald-200/90 font-semibold tracking-wide truncate">Аудио</span>
                            </div>
                        <div 
                            data-timeline-lane="a1"
                            onDragOver={(e) => handleDragOver(e, 'a1')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'a1')}
                            className={`flex-1 min-w-0 h-14 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#0f1614]/40 ${
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
                                        className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-hidden flex items-center group/clip ${activeTool === 'pointer' ? 'cursor-pointer' : 'cursor-crosshair'} ${
                                            isSelected 
                                                ? 'bg-[#1d422c] border border-emerald-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(34,197,94,0.4)]' 
                                                : 'bg-[#122b1c] border border-emerald-500/20 hover:border-emerald-500/40 text-white'
                                        }`} 
                                        style={{ left: `${(absToProj(clipStart) / projectDuration) * 100}%`, width: `${((absToProj(clipEnd) - absToProj(clipStart)) / projectDuration) * 100}%` }}
                                    >

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
                                                <div className={`touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'a1', i, 'left', clip.start, clip.start, clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                <div className={`touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 flex items-center justify-center z-20 ${trimState?.pointerId ? 'pointer-events-auto bg-white/10' : ''}`} onPointerDown={(e) => handleTrimStart(e, 'a1', i, 'right', clip.end, clip.start, clip.end)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        </div>

                        {/* SFX (Assets) Track */}
                        {isSFXVisible && (
                            <div className="flex h-14 shrink-0 w-full">
                                <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#0f1614] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-teal-500 border-r border-white/5 font-sans">
                                    <span className="text-[9px] font-mono font-bold text-teal-300/90 bg-teal-500/15 px-1.5 py-0.5 rounded shrink-0">SFX</span>
                                    <span className="hidden md:inline text-[11px] text-teal-200/90 font-semibold tracking-wide truncate">SFX</span>
                                </div>
                            <div 
                                data-timeline-lane="sfx"
                                onDragOver={(e) => handleDragOver(e, 'sfx')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'sfx')}
                                className={`flex-1 min-w-0 h-14 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#0f1614]/30 ${
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
                                            className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/sfx px-3 shadow-sm ${
                                                isSelected 
                                                    ? 'bg-[#4e3d22] border border-yellow-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]' 
                                                    : 'bg-[#382c18] border border-yellow-500/20 hover:border-yellow-500/40 text-white'
                                            }`}
                                            style={{ left: `${(absToProj(clipStart) / projectDuration) * 100}%`, width: `${((absToProj(clipEnd) - absToProj(clipStart)) / projectDuration) * 100}%` }}
                                        >
                                            
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'sfx', i, 'left', rawStart, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'sfx', i, 'right', rawEnd, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            </div>
                        )}

                        {/* M1 (Music/BGM) Track */}
                        {isM1Visible && (
                            <div className="flex h-14 shrink-0 w-full">
                                <div className="w-24 md:w-36 shrink-0 sticky left-0 z-40 border-b border-white/5 bg-[#18140c] flex items-center gap-2 px-2.5 select-none border-l-[3px] border-l-orange-500 border-r border-white/5 font-sans">
                                    <span className="text-[9px] font-mono font-bold text-orange-300/90 bg-orange-500/15 px-1.5 py-0.5 rounded shrink-0">M1</span>
                                    <span className="hidden md:inline text-[11px] text-orange-200/90 font-semibold tracking-wide truncate">Музыка</span>
                                </div>
                            <div 
                                data-timeline-lane="m1"
                                onDragOver={(e) => handleDragOver(e, 'm1')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'm1')}
                                className={`flex-1 min-w-0 h-14 border-b border-white/5 relative flex items-center px-1 transition-all bg-[#18140c]/40 ${
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
                                            className={`touch-none absolute h-[calc(100%-2px)] rounded-md overflow-hidden flex items-center cursor-pointer transition-all group/bgm px-3 shadow-sm ${
                                                isSelected 
                                                    ? 'bg-[#4e3d22] border border-yellow-400 text-white z-10 font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]' 
                                                    : 'bg-[#382c18] border border-yellow-500/20 hover:border-yellow-500/40 text-white'
                                            }`}
                                            style={{ left: `${(absToProj(clipStart) / projectDuration) * 100}%`, width: `${((absToProj(clipEnd) - absToProj(clipStart)) / projectDuration) * 100}%` }}
                                        >
                                            
                                            
                                            {activeTool === 'pointer' && (
                                                <>
                                                    <div className="touch-none absolute left-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'm1', i, 'left', rawStart, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                    <div className="touch-none absolute right-0 top-0 bottom-0 w-4 md:w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/10 z-20" onPointerDown={(e) => handleTrimStart(e, 'm1', i, 'right', rawEnd, rawStart, rawEnd)} onPointerMove={handleTrimMove} onPointerUp={handleTrimEnd} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            </div>
                        )}

                    {/* Playhead — only over lane area (offset by sticky label column) */}
                    <div
                        className="absolute top-0 bottom-0 left-24 md:left-36 right-0 z-50 pointer-events-none"
                    >
                        <div
                            className="absolute top-0 bottom-0 w-[1px] bg-amber-500"
                            style={{ left: `${(absToProj(timelineTime) / projectDuration) * 100}%` }}
                        >
                            <div
                                className="absolute -top-1 -left-2.5 w-5 h-5 pointer-events-auto cursor-ew-resize flex items-center justify-center"
                                onPointerDown={handleScrubStart}
                            >
                                <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-amber-500" />
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Floating Zoom Control */}
            <div className="absolute bottom-2 right-4 bg-zinc-950/80 border border-white/10 rounded-md px-2 py-1 flex items-center gap-1.5 z-[100] shadow-lg backdrop-blur-md">
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