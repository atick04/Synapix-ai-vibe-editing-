"use client";
import { useRef, useEffect, useState, useCallback, useImperativeHandle, useMemo } from "react";

// ──────────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────────
interface Edit {
    action: string;
    start?: number;
    end?: number;
    text?: string;
    fontsize?: number;
    color?: string;
    font?: string;
    font_size?: number;
    font_color?: string;
    position?: string;
    use_outline?: boolean;
    animation_style?: string;
    type?: string;       // zoom_in | zoom_out
    speed?: number;
    html_content?: string;
    query?: string;
    broll_url?: string;
    resolved_path?: string;
    asset_type?: string;
    asset_query?: string;
    transition_asset_query?: string;
    sfx_asset_query?: string;
    transition_resolved?: string;
    sfx_resolved?: string;
    transition_type?: string;
    sfx_type?: string;
    html?: string;
    volume?: number;
}

interface EDL {
    v1: { start: number; end: number }[];
    a1: { start: number; end: number }[];
}

interface Props {
    videoSrc: string | null;
    edits: Edit[];
    edl: EDL | null;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onTimeUpdate?: (t: number) => void;
    onDurationChange?: (d: number) => void;
    duration?: number;
}

// ──────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function getZoomScale(edits: Edit[], t: number): number {
    const zoom = edits.find(
        e => e.action === 'camera_zoom' &&
            e.start != null && e.end != null &&
            t >= (e.start as number) && t < (e.end as number)
    );
    if (!zoom) return 1;
    const progress = (t - (zoom.start as number)) / ((zoom.end as number) - (zoom.start as number));
    if (zoom.type === 'zoom_in') return lerp(1, 1.14, Math.min(progress, 1));
    if (zoom.type === 'zoom_out') return lerp(1.14, 1, Math.min(progress, 1));
    return 1;
}

function isCutAt(edl: EDL | null, t: number): boolean {
    if (!edl || !edl.v1.length) return false;
    return !edl.v1.some(seg => t >= seg.start && t < seg.end);
}

function nextKeepStart(edl: EDL | null, t: number): number | null {
    if (!edl) return null;
    const sorted = [...edl.v1].sort((a, b) => a.start - b.start);
    const next = sorted.find(seg => seg.start > t);
    return next ? next.start : null;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────────
//  Component
// ──────────────────────────────────────────────────────────────────
export default function SandboxPlayer({
    videoSrc,
    edits,
    edl,
    isPlaying,
    onTogglePlay,
    onTimeUpdate,
    onDurationChange,
    duration = 0,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const gsapIframeRef = useRef<HTMLIFrameElement>(null);
    const rafRef = useRef<number | null>(null);
    const edlRef = useRef(edl);
    const editsRef = useRef(edits);
    const [currentTime, setCurrentTime] = useState(0);
    const [dur, setDur] = useState(duration || 0);
    const [videoReady, setVideoReady] = useState(false);
    const [videoAspect, setVideoAspect] = useState<number>(16 / 9);
    
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const assetEdits = edits.filter(e => e.action === 'add_asset' && e.resolved_path);
    const assetRefs = useRef<(HTMLMediaElement | null)[]>([]);
    const brollEdits = edits.filter(e => e.action === 'add_broll' && (e.resolved_path || e.broll_url));
    const brollRefs = useRef<(HTMLVideoElement | null)[]>([]);
    const sceneIframeRef = useRef<HTMLIFrameElement>(null);
    const sceneTransitionRefs = useRef<(HTMLMediaElement | null)[]>([]);
    const [isSceneActive, setIsSceneActive] = useState(false);

    const sceneEditsRef = useRef<Edit[]>([]);

    // ── Scene Override Edits ──────────────────────────────────────
    const sceneEdits = edits.filter(e => e.action === 'scene_override' && e.html_content);

    // keep refs in sync to avoid stale closures in RAF
    useEffect(() => { edlRef.current = edl; }, [edl]);
    useEffect(() => { editsRef.current = edits; }, [edits]);
    useEffect(() => { if (duration > 0) setDur(duration); }, [duration]);
    useEffect(() => { sceneEditsRef.current = sceneEdits; }, [sceneEdits]);

    // ── Graphics HTML ──────────────────────────────────────────────
    const graphicsEdits = edits.filter(e => e.action === 'canvas_overlay' || e.action === 'hyperframes_html');
    const graphicsHtml = graphicsEdits.length > 0 ? (() => {
        // Extract all html_content fragments — agent produces <div id="root">...<script>...</script></div>
        // We need to:
        // 1. Inject GSAP first via script tag
        // 2. Then run all inline scripts AFTER GSAP is loaded
        const rawFragments = graphicsEdits.map(e => e.html_content || e.html || '').join('\n');
        const fragments = rawFragments
            .replace(/src=(['"])\/assets\//g, `src=$1${API_URL}/assets/`)
            .replace(/url\((['"]?)\/assets\//g, `url($1${API_URL}/assets/`);

        // Pull <script> blocks out of fragments so we can defer them
        const scriptBlocks: string[] = [];
        const fragmentWithoutScripts = fragments.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, code) => {
            scriptBlocks.push(code);
            return '';
        });

        const deferredScripts = scriptBlocks.map(code => `
try { (function(){ ${code} })(); } catch(e){ console.warn('[Graphics]', e); }
`).join('\n');

        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Inter:wght@400;700;900&family=Playfair+Display:ital,wght@0,700;1,700&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:100%;height:100%;overflow:hidden;background:transparent;}
    .clip{position:absolute;}
    #root{
      width:1080px;height:1920px;
      position:absolute;top:0;left:0;
      transform-origin:top left;
      background:transparent;overflow:hidden;
    }
  </style>
</head>
<body>
  ${fragmentWithoutScripts}
  <script>
    // Scale #root to fit viewport
    function scaleRoot(){
      const r=document.getElementById('root');
      if(!r)return;
      const s=Math.min(window.innerWidth/1080,window.innerHeight/1920);
      r.style.transform='scale('+s+')';
      // Center the scaled container
      const scaledW=1080*s, scaledH=1920*s;
      r.style.left=((window.innerWidth-scaledW)/2)+'px';
      r.style.top=((window.innerHeight-scaledH)/2)+'px';
    }
    window.addEventListener('resize',scaleRoot);

    // Load GSAP then execute agent scripts
    const gsapScript=document.createElement('script');
    gsapScript.src='https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';
    gsapScript.onload=function(){
      scaleRoot();
      // Execute agent-generated GSAP code AFTER gsap is available
      ${deferredScripts}
      // Listen for timeline sync from parent video player
      window.addEventListener('message',function(ev){
        if(!ev.data||ev.data.type!=='sync_time')return;
        const t=ev.data.time;
        const tls=window.__timelines||{};
        Object.values(tls).forEach(function(tl){
          if(tl&&tl.seek){tl.pause();tl.seek(t);}
        });
      });
    };
    document.head.appendChild(gsapScript);
  </script>
</body>
</html>`;
    })() : undefined;

    // ── Scene Override HTML (full-frame opaque scenes) ─────────────
    const buildSceneHtml = (sceneEdit: Edit) => {
        const rawHtml = sceneEdit.html_content || '';
        const html = rawHtml
            .replace(/src=(['"])\/assets\//g, `src=$1${API_URL}/assets/`)
            .replace(/url\((['"]?)\/assets\//g, `url($1${API_URL}/assets/`);
        const scriptBlocks: string[] = [];
        const htmlWithoutScripts = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, code) => {
            scriptBlocks.push(code);
            return '';
        });
        const deferredScripts = scriptBlocks.map(code => `
try { (function(){ ${code} })(); } catch(e){ console.warn('[Scene]', e); }
`).join('\n');

        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Inter:wght@400;700;900&family=Playfair+Display:ital,wght@0,700;1,700&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:100%;height:100%;overflow:hidden;background:transparent;}
    .clip{position:absolute;}
    #root{
      width:1080px;height:1920px;
      position:absolute;top:0;left:0;
      transform-origin:top left;
      overflow:hidden;
    }
    img{max-width:none;}
  </style>
</head>
<body>
  <div id="root">
    ${htmlWithoutScripts}
  </div>
  <script>
    function scaleRoot(){
      const r=document.getElementById('root');
      if(!r)return;
      const s=Math.min(window.innerWidth/1080,window.innerHeight/1920);
      r.style.transform='scale('+s+')';
      const scaledW=1080*s, scaledH=1920*s;
      r.style.left=((window.innerWidth-scaledW)/2)+'px';
      r.style.top=((window.innerHeight-scaledH)/2)+'px';
    }
    window.addEventListener('resize',scaleRoot);
    const gsapScript=document.createElement('script');
    gsapScript.src='https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';
    gsapScript.onload=function(){
      scaleRoot();
      ${deferredScripts}
      // Auto-play any paused timelines the agent created
      // (agent code creates tl with { paused: true })
      if(window.__timelines){
        Object.values(window.__timelines).forEach(function(tl){
          if(tl&&tl.play) tl.play();
        });
      }
      // Also find any gsap.globalTimeline children and play them
      if(gsap.globalTimeline){
        gsap.globalTimeline.getChildren().forEach(function(tl){
          if(tl&&tl.paused&&tl.paused()) tl.play();
        });
      }
      window.addEventListener('message',function(ev){
        if(!ev.data||ev.data.type!=='sync_scene')return;
        var t=ev.data.time;
        // Try __timelines first
        var tls=window.__timelines||{};
        var found=Object.values(tls);
        // Fallback: try gsap global children
        if(found.length===0 && gsap.globalTimeline){
          found=gsap.globalTimeline.getChildren();
        }
        found.forEach(function(tl){
          if(tl&&tl.seek){tl.pause();tl.seek(t);}
        });
      });
    };
    document.head.appendChild(gsapScript);
  </script>
</body>
</html>`;
    };

    // Pre-compute scene HTML map (keyed by scene index) to avoid rebuilding every frame
    const sceneHtmlMap = useMemo(() => {
        const map: Record<number, string> = {};
        sceneEdits.forEach((edit, i) => {
            map[i] = buildSceneHtml(edit);
        });
        console.log('[SandboxPlayer] sceneHtmlMap rebuilt, scenes:', sceneEdits.length);
        return map;
    }, [sceneEdits]);
    const sceneHtmlMapRef = useRef(sceneHtmlMap);
    useEffect(() => { sceneHtmlMapRef.current = sceneHtmlMap; }, [sceneHtmlMap]);

    // Currently active scene override (for iframe srcDoc)
    const [activeSceneHtml, setActiveSceneHtml] = useState<string | undefined>(undefined);
    const [activeSceneIndex, setActiveSceneIndex] = useState<number>(-1);

    const textOverlays = edits.filter(e => e.action === 'add_text_overlay');

    // ── Draw current video frame + overlays to canvas ─────────────
    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video || video.readyState < 2) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const VW = video.videoWidth || 1280;
        const VH = video.videoHeight || 720;

        // Resize canvas to match video's natural aspect ratio
        if (canvas.width !== VW || canvas.height !== VH) {
            canvas.width = VW;
            canvas.height = VH;
        }

        const W = canvas.width;
        const H = canvas.height;
        const t = video.currentTime;
        const scale = getZoomScale(editsRef.current, t);

        ctx.save();
        ctx.clearRect(0, 0, W, H);

        if (scale !== 1) {
            ctx.translate(W / 2, H / 2);
            ctx.scale(scale, scale);
            ctx.translate(-W / 2, -H / 2);
        }
        ctx.drawImage(video, 0, 0, W, H);
        ctx.restore();

        // ── Draw text overlays ──
        const activeTexts = textOverlays.filter(
            e => e.start != null && e.end != null && t >= (e.start as number) && t < (e.end as number)
        );
        for (const ov of activeTexts) {
            const fontSize = Math.round((ov.fontsize || 60) * (W / 1080));
            ctx.save();
            ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
            ctx.textAlign = 'center';
            const txt = ov.text || '';
            const textW = ctx.measureText(txt).width;
            const padX = fontSize * 0.5;
            const padY = fontSize * 0.35;
            const bx = W / 2 - textW / 2 - padX;
            const by = H * 0.75 - fontSize;
            const bw = textW + padX * 2;
            const bh = fontSize + padY * 2;

            ctx.globalAlpha = 0.85;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            drawRoundedRect(ctx, bx, by, bw, bh, 16);
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.fillStyle = ov.color || '#ffffff';
            if (ov.use_outline !== false) {
                ctx.strokeStyle = 'rgba(0,0,0,0.9)';
                ctx.lineWidth = Math.max(2, fontSize * 0.06);
                ctx.strokeText(txt, W / 2, by + bh - padY);
            }
            ctx.fillText(txt, W / 2, by + bh - padY);
            ctx.restore();
        }
    }, [textOverlays]);

    // ── RAF Render + EDL enforcement loop ────────────────────────
    useEffect(() => {
        if (!videoReady) return;

        const tick = () => {
            const video = videoRef.current;
            if (!video) return;

            const t = video.currentTime;
            setCurrentTime(t);
            onTimeUpdate?.(t);

            // Sync GSAP graphics timeline
            if (gsapIframeRef.current?.contentWindow) {
                gsapIframeRef.current.contentWindow.postMessage({ type: 'sync_time', time: t }, '*');
            }

            // ── Scene Override detection (use ref for fresh data) ──
            const currentSceneEdits = sceneEditsRef.current;
            let foundSceneIdx = -1;
            for (let si = 0; si < currentSceneEdits.length; si++) {
                const s = currentSceneEdits[si];
                if (s.start != null && s.end != null && t >= (s.start as number) && t < (s.end as number)) {
                    foundSceneIdx = si;
                    break;
                }
            }
            const sceneIsActive = foundSceneIdx >= 0;
            setIsSceneActive(sceneIsActive);

            if (sceneIsActive) {
                const activeScene = currentSceneEdits[foundSceneIdx];
                const sceneLocalTime = t - (activeScene.start as number);
                // Sync scene iframe timeline (GSAP timeline is compiled with absolute start times, so sync using absolute time t)
                if (sceneIframeRef.current?.contentWindow) {
                    sceneIframeRef.current.contentWindow.postMessage({ type: 'sync_scene', time: t }, '*');
                }
                // Play transition video + SFX at scene entry (first 1.5 seconds)
                sceneTransitionRefs.current.forEach((el, index) => {
                    if (!el) return;
                    // Even indices are video transition elements, odd are SFX audio
                    const isVideo = el.tagName === 'VIDEO';
                    if (sceneLocalTime < 1.5) {
                        if (el.paused && !video.paused) {
                            el.currentTime = 0;
                            el.play().catch(() => {});
                        }
                        if (isVideo) {
                            el.style.opacity = '1';
                        }
                    } else {
                        if (!el.paused) el.pause();
                        if (isVideo) {
                            el.style.opacity = '0';
                        }
                    }
                });
                // Set scene HTML from precomputed map (only update if index changed)
                setActiveSceneIndex(prev => {
                    if (prev !== foundSceneIdx) {
                        console.log('[SandboxPlayer] Scene ACTIVATED:', foundSceneIdx, 'at t=', t.toFixed(1));
                        setActiveSceneHtml(sceneHtmlMapRef.current[foundSceneIdx]);
                        return foundSceneIdx;
                    }
                    return prev;
                });
            } else {
                setActiveSceneHtml(prev => prev ? undefined : prev);
                setActiveSceneIndex(-1);
            }

            // EDL: skip cut regions during playback
            if (!video.paused && edlRef.current && isCutAt(edlRef.current, t)) {
                const next = nextKeepStart(edlRef.current, t);
                if (next !== null) {
                    video.currentTime = next;
                } else {
                    video.pause();
                }
            }

            // Sync Asset Overlays (SFX & Video Transitions)
            assetRefs.current.forEach((el, i) => {
                if (!el) return;
                const edit = assetEdits[i];
                if (!edit || edit.start == null) return;
                
                // Approximate active state if end is not provided
                const end = edit.end != null ? edit.end : edit.start + (el.duration || 10);
                const isActive = t >= edit.start && t < end;
                
                // Convert decibels (dB) to linear gain (0.0 to 1.0) and set element volume dynamically
                const db = edit.volume != null ? edit.volume : -22;
                const gain = Math.pow(10, db / 20);
                el.volume = Math.max(0, Math.min(1, gain));
                
                if (isActive) {
                    if (el.paused && !video.paused) {
                        el.currentTime = t - edit.start;
                        el.play().catch(() => {});
                    } else if (!video.paused && Math.abs(el.currentTime - (t - edit.start)) > 0.3) {
                        el.currentTime = t - edit.start;
                    }
                    if (el.tagName === 'VIDEO') {
                        el.style.opacity = '1';
                    }
                } else {
                    if (!el.paused) el.pause();
                    if (el.tagName === 'VIDEO') {
                        el.style.opacity = '0';
                    }
                }
            });

            // Sync B-roll Overlays
            brollRefs.current.forEach((el, i) => {
                if (!el) return;
                const edit = brollEdits[i];
                if (!edit || edit.start == null || edit.end == null) return;
                
                const isActive = t >= edit.start && t < edit.end;
                
                if (isActive) {
                    if (el.paused && !video.paused) {
                        el.currentTime = t - edit.start;
                        el.play().catch(() => {});
                    } else if (!video.paused && Math.abs(el.currentTime - (t - edit.start)) > 0.3) {
                        el.currentTime = t - edit.start;
                    }
                    el.style.opacity = '1';
                } else {
                    if (!el.paused) el.pause();
                    el.style.opacity = '0';
                }
            });

            drawFrame();
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [videoReady, drawFrame, onTimeUpdate]);

    // ── Play/pause control ────────────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !videoReady) return;
        if (isPlaying) {
            video.play().catch(() => {});
        } else {
            video.pause();
            assetRefs.current.forEach(el => {
                if (el && !el.paused) el.pause();
            });
            brollRefs.current.forEach(el => {
                if (el && !el.paused) el.pause();
            });
        }
    }, [isPlaying, videoReady]);

    const seek = (e: React.MouseEvent<HTMLDivElement>) => {
        const bar = e.currentTarget;
        const rect = bar.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = pct * dur;
        if (videoRef.current) videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    // ── Badge counts ──────────────────────────────────────────────
    const cutCount = edits.filter(e => e.action === 'cut_out').length;
    const zoomCount = edits.filter(e => e.action === 'camera_zoom').length;
    const brollCount = edits.filter(e => e.action === 'add_broll').length;
    const textCount = edits.filter(e => e.action === 'add_text_overlay').length;

    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: '#000', minHeight: 0 }}>

            {/* Hidden video element — always mounted, canvas reads from it */}
            <video
                ref={videoRef}
                src={videoSrc || undefined}
                preload="auto"
                playsInline
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, top: 0, left: 0 }}
                onLoadedMetadata={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    const d = v.duration;
                    setDur(d);
                    onDurationChange?.(d);
                    setVideoReady(true);
                    if (v.videoWidth && v.videoHeight) {
                        setVideoAspect(v.videoWidth / v.videoHeight);
                    }
                }}
                onError={(e) => console.error('SandboxPlayer video error:', e)}
            />

            {/* Canvas — main output */}
            <div
                className="relative flex-1 flex items-center justify-center overflow-hidden"
                style={{ minHeight: 0 }}
            >
                <div
                    className="relative flex items-center justify-center overflow-hidden"
                    style={{
                        width: videoAspect > 1 ? '100%' : 'auto',
                        height: videoAspect < 1 ? '100%' : 'auto',
                        aspectRatio: `${videoAspect}`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                    }}
                >
                    <canvas
                        ref={canvasRef}
                        onClick={onTogglePlay}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            cursor: 'pointer',
                            display: videoReady && !isSceneActive ? 'block' : 'none',
                        }}
                    />

                    {/* Loading placeholder */}
                    {!videoReady && videoSrc && (
                        <div className="flex flex-col items-center gap-3 text-zinc-500">
                            <svg className="w-10 h-10 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                            <span className="text-sm font-medium">Загрузка видео...</span>
                        </div>
                    )}

                    {/* No source placeholder */}
                    {!videoSrc && (
                        <div className="flex flex-col items-center gap-3 text-zinc-600">
                            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium">Ожидание медиа...</span>
                        </div>
                    )}

                    {/* GSAP Motion Graphics overlay (transparent, on top of video) */}
                    {graphicsHtml && videoReady && !isSceneActive && (
                        <div className="absolute inset-0 pointer-events-none z-[100]">
                            <iframe
                                ref={gsapIframeRef}
                                srcDoc={graphicsHtml}
                                className="w-full h-full"
                                style={{ border: 'none', background: 'transparent' }}
                                title="Motion Graphics"
                            />
                        </div>
                    )}

                    {/* Scene Override (full-frame opaque scene replacing video) */}
                    {activeSceneHtml && videoReady && (
                        <div className="absolute inset-0 z-[200]" onClick={onTogglePlay} style={{ cursor: 'pointer' }}>
                            <iframe
                                ref={sceneIframeRef}
                                srcDoc={activeSceneHtml}
                                className="w-full h-full"
                                style={{ border: 'none', background: 'transparent' }}
                                title="Scene Override"
                            />
                            {/* Scene transition video overlay */}
                            {sceneEdits.filter(s => s.transition_resolved).map((s, i) => (
                                <video
                                    key={`scene-tr-${i}`}
                                    ref={el => { sceneTransitionRefs.current[i * 2] = el; }}
                                    src={`${API_URL}/assets/${s.transition_resolved}`}
                                    preload="auto"
                                    playsInline
                                    muted
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                    style={{ mixBlendMode: 'screen', zIndex: 210, opacity: 0, transition: 'opacity 0.2s ease-out' }}
                                />
                            ))}
                            {/* Scene SFX audio */}
                            {sceneEdits.filter(s => s.sfx_resolved).map((s, i) => (
                                <audio
                                    key={`scene-sfx-${i}`}
                                    ref={el => { sceneTransitionRefs.current[i * 2 + 1] = el; }}
                                    src={`${API_URL}/assets/${s.sfx_resolved}`}
                                    preload="auto"
                                />
                            ))}
                        </div>
                    )}

                    {/* Asset Overlays (Transitions, SFX) */}
                    {videoReady && assetEdits.map((edit, i) => {
                        const src = `${API_URL}/assets/${edit.resolved_path}`;
                        if (edit.asset_type === 'video') {
                            return (
                                <video
                                    key={`asset-${i}`}
                                    ref={el => { assetRefs.current[i] = el; }}
                                    src={src}
                                    preload="auto"
                                    playsInline
                                    muted
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[90]"
                                    style={{ opacity: 0, mixBlendMode: 'screen' }}
                                />
                            );
                        } else if (edit.asset_type === 'audio') {
                            return (
                                <audio
                                    key={`asset-${i}`}
                                    ref={el => { assetRefs.current[i] = el; }}
                                    src={src}
                                    preload="auto"
                                />
                            );
                        }
                        return null;
                    })}

                    {/* B-roll Overlays */}
                    {videoReady && brollEdits.map((edit, i) => {
                        const src = edit.resolved_path 
                            ? (edit.resolved_path.startsWith('http') ? edit.resolved_path : `${API_URL}/${edit.resolved_path}`)
                            : edit.broll_url;
                        if (!src) return null;
                        return (
                            <video
                                key={`broll-${i}`}
                                ref={el => { brollRefs.current[i] = el; }}
                                src={src}
                                preload="auto"
                                playsInline
                                muted
                                className="absolute inset-0 w-full h-full object-cover z-[95]"
                                style={{ opacity: 0, pointerEvents: 'none' }}
                            />
                        );
                    })}

                    {/* Cinematic vignette overlay */}
                    <div
                        className="absolute inset-0 pointer-events-none z-[5]"
                        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }}
                    />

                    {/* Play/Pause overlay — glass button */}
                    {!isPlaying && videoReady && (
                        <button
                            onClick={onTogglePlay}
                            className="absolute inset-0 flex items-center justify-center group z-[10]"
                            style={{ background: 'transparent' }}
                        >
                            <div
                                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 group-hover:scale-105"
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    backdropFilter: 'blur(12px)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                }}
                            >
                                <svg className="w-6 h-6 ml-0.5" fill="#F5F7FA" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </div>
                        </button>
                    )}
                </div>

                {/* Cinematic status badges */}
                {videoReady && (
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 pointer-events-none z-[10]">
                        <span
                            className="text-[8px] font-mono tracking-widest px-2 py-0.5 uppercase"
                            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', color: 'rgba(59,130,246,0.8)', borderRadius: '6px', backdropFilter: 'blur(8px)' }}
                        >
                            live preview
                        </span>
                        {cutCount > 0 && <span className="text-[8px] font-mono px-2 py-0.5 lowercase" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', borderRadius: '6px', backdropFilter: 'blur(8px)' }}>{cutCount} cuts</span>}
                        {zoomCount > 0 && <span className="text-[8px] font-mono px-2 py-0.5 lowercase" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', borderRadius: '6px', backdropFilter: 'blur(8px)' }}>{zoomCount} zooms</span>}
                        {textCount > 0 && <span className="text-[8px] font-mono px-2 py-0.5 lowercase" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', borderRadius: '6px', backdropFilter: 'blur(8px)' }}>{textCount} texts</span>}
                        {brollCount > 0 && <span className="text-[8px] font-mono px-2 py-0.5 lowercase" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', borderRadius: '6px', backdropFilter: 'blur(8px)' }}>{brollCount} b-roll</span>}
                    </div>
                )}
            </div>

            {/* ── Cinematic Scrubber ── */}
            <div
                className="h-11 flex items-center gap-3 px-4 shrink-0"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(17,19,24,0.9)', backdropFilter: 'blur(8px)' }}
            >
                {/* Play/pause button */}
                <button
                    onClick={onTogglePlay}
                    disabled={!videoReady}
                    className="flex items-center justify-center w-7 h-7 rounded-lg transition-all cursor-pointer disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                    {isPlaying
                        ? <svg className="w-3 h-3" fill="rgba(255,255,255,0.8)" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        : <svg className="w-3 h-3 ml-0.5" fill="rgba(255,255,255,0.8)" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    }
                </button>

                <span className="text-[10px] font-mono shrink-0" style={{ color: '#5A6478', minWidth: '36px' }}>{fmtTime(currentTime)}</span>

                {/* Scrubber track */}
                <div
                    className="flex-1 h-[3px] rounded-full cursor-pointer relative"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                    onClick={seek}
                >
                    {/* EDL keep segments */}
                    {edl && dur > 0 && edl.v1.map((seg, i) => (
                        <div
                            key={i}
                            className="absolute h-full rounded-full"
                            style={{
                                left: `${(seg.start / dur) * 100}%`,
                                width: `${Math.max(0.5, ((seg.end - seg.start) / dur) * 100)}%`,
                                background: 'rgba(59,130,246,0.2)',
                            }}
                        />
                    ))}
                    {/* Progress fill */}
                    {dur > 0 && (
                        <div
                            className="absolute h-full rounded-full"
                            style={{
                                left: 0,
                                width: `${(currentTime / dur) * 100}%`,
                                background: 'linear-gradient(90deg, #3B82F6, rgba(124,58,237,0.8))',
                            }}
                        />
                    )}
                    {/* Playhead pill */}
                    {dur > 0 && (
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                            style={{
                                left: `calc(${(currentTime / dur) * 100}% - 6px)`,
                                background: '#F5F7FA',
                                boxShadow: '0 0 8px rgba(59,130,246,0.5)',
                            }}
                        />
                    )}
                </div>

                <span className="text-[10px] font-mono text-right shrink-0" style={{ color: '#3A4151', minWidth: '36px' }}>{fmtTime(dur)}</span>
            </div>
        </div>
    );
}
