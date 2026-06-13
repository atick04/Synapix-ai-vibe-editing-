"use client";
import { useRef, useEffect, useState, useCallback, useImperativeHandle, useMemo, forwardRef } from "react";

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
    accent_font?: string;
    accent_color?: string;
    use_shadow?: boolean;
    shadow_blur?: number;
    text_case?: string;
    is_subtitle?: boolean;
    chunk_index?: number;
    font_pairing?: string;
    word_styles?: string;
    inactive_opacity?: number;
    active_scale?: number;
    x?: number;
    y?: number;
    letter_spacing?: number;
    line_spacing?: number;
}

interface EDL {
    v1: { start: number; end: number }[];
    a1: { start: number; end: number }[];
}

interface TranscriptWord {
    word: string;
    start: number;
    end: number;
}

interface SubtitleConfig {
    font?: string;
    font_size?: number;
    color?: string;
    accent_color?: string;
    position?: string;
    x?: number;
    y?: number;
    use_shadow?: boolean;
    shadow_blur?: number;
    text_case?: string;
    max_words?: number;
    font_pairing?: string;
    word_styles?: string | null;
    inactive_opacity?: number | null;
    active_scale?: number | null;
    letter_spacing?: number;
    line_spacing?: number;
}

interface DrawnTextBox {
    id: string;
    isSub: boolean;
    editIndex?: number;
    chunkIndex?: number;
    left: number;
    top: number;
    width: number;
    height: number;
    x: number;
    y: number;
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
    targetFormat?: 'auto' | '16:9' | '9:16';
    mediaLibrary?: any[];
    transcript?: { words: TranscriptWord[] } | null;
    subtitleConfig?: SubtitleConfig | null;
    focusedClipId?: string | null;
    onUpdateEdit?: (index: number, updates: Record<string, any>) => void;
    onUpdateSubtitleGlobal?: (field: string, value: any) => void;
}

// ──────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const FONT_URLS: Record<string, string> = {
    'Inter': 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff2',
    'Manrope': 'https://cdn.jsdelivr.net/npm/@fontsource/manrope@5.0.8/files/manrope-latin-700-normal.woff2',
    'Rubik': 'https://cdn.jsdelivr.net/npm/@fontsource/rubik@5.0.8/files/rubik-latin-700-normal.woff2',
    'Oswald': 'https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.8/files/oswald-latin-700-normal.woff2',
    'Montserrat': 'https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.8/files/montserrat-latin-800-normal.woff2',
    'Comfortaa': 'https://cdn.jsdelivr.net/npm/@fontsource/comfortaa@5.0.8/files/comfortaa-latin-700-normal.woff2',
    'Lobster': 'https://cdn.jsdelivr.net/npm/@fontsource/lobster@5.0.8/files/lobster-latin-400-normal.woff2',
    'JetBrainsMono': 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.8/files/jetbrains-mono-latin-700-normal.woff2',
    'IBMPlexSans': 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5.0.8/files/ibm-plex-sans-latin-700-normal.woff2',
    'BebasNeue': 'https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.0.8/files/bebas-neue-latin-400-normal.woff2'
};

function getNormalizedFontName(fontName: string): string {
    return fontName
        .replace(/[-_](24pt|Bold|Regular|Medium|Italic|ExtraBold|SemiBold|Black|Light|Thin|ExtraLight|Extra-Bold|Semi-Bold).*$/i, '')
        .replace(/\.ttf$/i, '')
        .trim();
}


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
const SandboxPlayer = forwardRef<HTMLVideoElement, Props>(function SandboxPlayer({
    videoSrc,
    edits,
    edl,
    isPlaying,
    onTogglePlay,
    onTimeUpdate,
    onDurationChange,
    duration = 0,
    targetFormat,
    mediaLibrary,
    transcript,
    subtitleConfig,
    focusedClipId,
    onUpdateEdit,
    onUpdateSubtitleGlobal,
}, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const videoRef = (ref as React.RefObject<HTMLVideoElement | null>) || localVideoRef;
    const gsapIframeRef = useRef<HTMLIFrameElement>(null);
    const rafRef = useRef<number | null>(null);
    const edlRef = useRef(edl);
    const editsRef = useRef(edits);
    const drawnTextBoxesRef = useRef<DrawnTextBox[]>([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [dur, setDur] = useState(duration || 0);
    const [videoReady, setVideoReady] = useState(false);
    const [videoAspect, setVideoAspect] = useState<number>(16 / 9);
    const targetRatio = useMemo(() => {
        if (targetFormat === '16:9') return 16 / 9;
        if (targetFormat === '9:16') return 9 / 16;
        return videoAspect;
    }, [targetFormat, videoAspect]);
    const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());
    
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    const resolveMediaUrl = useCallback((path: string | undefined) => {
        if (!path) return "";
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        if (path.startsWith("uploads/")) return `${API_URL}/${path}`;
        return `${API_URL}/assets/${path}`;
    }, [API_URL]);

    useEffect(() => {
        const fontsToLoad = new Set<string>();
        fontsToLoad.add(subtitleConfig?.font || 'Inter');
        if (subtitleConfig?.font_pairing) {
            fontsToLoad.add(subtitleConfig.font_pairing);
        }

        // Scan all edits for custom fonts or pairing fonts
        edits.forEach((e) => {
            if (e.font) fontsToLoad.add(e.font);
            if (e.font_pairing) fontsToLoad.add(e.font_pairing);
        });

        fontsToLoad.forEach((rawFont) => {
            const normFont = getNormalizedFontName(rawFont);
            if (loadedFonts.has(normFont)) return;

            const url = FONT_URLS[normFont];
            if (!url) {
                // If it is a standard system font, mark as loaded
                if (['Arial', 'Helvetica', 'Times New Roman', 'sans-serif', 'serif'].includes(normFont)) {
                    setLoadedFonts(prev => {
                        const next = new Set(prev);
                        next.add(normFont);
                        return next;
                    });
                }
                return;
            }

            console.log(`[SandboxPlayer] Dynamic Font Loading: ${normFont} from ${url}`);
            const font = new FontFace(normFont, `url(${url})`, {
                weight: normFont === 'Lobster' || normFont === 'BebasNeue' ? '400' : '700'
            });

            font.load().then((loadedFont) => {
                document.fonts.add(loadedFont);
                setLoadedFonts(prev => {
                    const next = new Set(prev);
                    next.add(normFont);
                    return next;
                });
                console.log(`[SandboxPlayer] Font ${normFont} successfully loaded for Canvas rendering`);
            }).catch((err) => {
                console.warn(`[SandboxPlayer] FontFace failed to load ${normFont}:`, err);
            });
        });
    }, [subtitleConfig?.font, subtitleConfig?.font_pairing, edits, loadedFonts]);

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

    // ── Word-Level Multi-Line Layout & Styling Engine ──────────────
    const drawStyledTextOverlay = useCallback((
        ctx: CanvasRenderingContext2D,
        ov: Edit,
        t: number,
        W: number,
        H: number,
        isSub: boolean
    ) => {
        const text = ov.text || '';
        const wordsList = text.split(/\s+/).filter(w => w.trim().length > 0);
        if (wordsList.length === 0) return;

        // Parse word_styles JSON configuration if provided
        let wordStylesParsed: any[] = [];
        if (ov.word_styles) {
            try {
                const parsed = JSON.parse(ov.word_styles);
                if (Array.isArray(parsed)) {
                    if (parsed.length > 0 && Array.isArray(parsed[0])) {
                        wordStylesParsed = parsed[0];
                    } else {
                        wordStylesParsed = parsed;
                    }
                }
            } catch (err) {
                console.error("[SandboxPlayer] Failed to parse word_styles JSON:", err);
            }
        }

        // Timing calculations for karaoke subtitles
        let activeIdx = -1;
        let reconstructedWords: { word: string; start: number; end: number }[] = [];
        
        if (isSub && transcript?.words) {
            const rawWords = transcript.words.filter(w => w.start >= ov.start! && w.end <= ov.end!) || [];
            reconstructedWords = wordsList.map((wordStr, idx) => {
                let start = ov.start!;
                let end = ov.end!;
                if (wordsList.length === rawWords.length) {
                    start = rawWords[idx].start;
                    end = rawWords[idx].end;
                } else {
                    const duration = ov.end! - ov.start!;
                    const wDur = duration / wordsList.length;
                    start = ov.start! + idx * wDur;
                    end = ov.start! + (idx + 1) * wDur;
                }
                return { word: wordStr, start, end };
            });

            // Find currently spoken word index
            for (let i = 0; i < reconstructedWords.length; i++) {
                if (t >= reconstructedWords[i].start && t < reconstructedWords[i].end) {
                    activeIdx = i;
                    break;
                }
            }
            if (activeIdx === -1 && reconstructedWords.length > 0) {
                if (t < reconstructedWords[0].start) activeIdx = 0;
                else activeIdx = reconstructedWords.length - 1;
            }
        }

        // Base theme configuration
        const mainColor = ov.font_color || ov.color || subtitleConfig?.color || '#F5F5F7';
        const accentColor = ov.accent_color || subtitleConfig?.accent_color || '#F2E16A';
        const positionPreset = ov.position || subtitleConfig?.position || 'bottom';
        const shadowBlur = ov.shadow_blur ?? subtitleConfig?.shadow_blur ?? 18;
        const basePx = ov.fontsize || ov.font_size || subtitleConfig?.font_size || 58;
        
        const inactiveOpacity = ov.inactive_opacity !== undefined 
            ? ov.inactive_opacity 
            : (subtitleConfig?.inactive_opacity !== undefined && subtitleConfig.inactive_opacity !== null ? subtitleConfig.inactive_opacity : 0.45);
            
        const activeScaleFactor = ov.active_scale !== undefined 
            ? ov.active_scale 
            : (subtitleConfig?.active_scale !== undefined && subtitleConfig.active_scale !== null ? subtitleConfig.active_scale : 1.25);

        const scaleMul = Math.min(W, H) / 1080;

        // Pre-resolve styles for each word
        const wordsLayout = wordsList.map((wordStr, i) => {
            const styleOverride = wordStylesParsed[i] || {};
            
            // Format case style
            let formattedWord = wordStr;
            const caseStyle = styleOverride.text_case || ov.text_case || subtitleConfig?.text_case || 'Sentence_Case';
            if (caseStyle === 'UPPER') formattedWord = formattedWord.toUpperCase();
            else if (caseStyle === 'lower') formattedWord = formattedWord.toLowerCase();
            else if (caseStyle === 'Sentence_Case') {
                formattedWord = i === 0 
                    ? formattedWord.charAt(0).toUpperCase() + formattedWord.slice(1).toLowerCase()
                    : formattedWord.toLowerCase();
            }

            // Font override or pairing layout
            let fontOverride = styleOverride.font;
            if (!fontOverride) {
                // Determine if this is the accent word in the sequence (e.g. 2nd word of 3 words, or 2nd of 2 words)
                // This static layout approach avoids word jitter during active word shifting!
                let isAccentWord = false;
                if (wordsList.length === 3) {
                    isAccentWord = (i === 1);
                } else if (wordsList.length === 2) {
                    isAccentWord = (i === 1);
                } else if (wordsList.length === 4) {
                    isAccentWord = (i === 1 || i === 2);
                } else if (wordsList.length > 4) {
                    isAccentWord = (i === 1 || i === 3);
                }

                fontOverride = (isAccentWord && ov.font_pairing) 
                    ? ov.font_pairing 
                    : (ov.font || subtitleConfig?.font || 'Inter');
            }
            const fontFamily = getNormalizedFontName(fontOverride);

            const sizeMult = styleOverride.size !== undefined ? styleOverride.size : 1.0;
            const fontSize = Math.round(basePx * sizeMult * scaleMul);

            const italic = styleOverride.italic !== undefined ? styleOverride.italic : false;
            const bold = styleOverride.bold !== undefined ? styleOverride.bold : true;
            const newline = styleOverride.newline !== undefined ? styleOverride.newline : false;
            const x_offset = styleOverride.x_offset !== undefined ? styleOverride.x_offset : 0;
            const y_offset = styleOverride.y_offset !== undefined ? styleOverride.y_offset : 0;
            const rotation = styleOverride.rotation !== undefined ? styleOverride.rotation : 0;
            const glow = styleOverride.glow !== undefined ? styleOverride.glow : false;
            const color = styleOverride.color || null;

            return {
                word: formattedWord,
                fontFamily,
                fontSize,
                italic,
                bold,
                newline,
                x_offset,
                y_offset,
                rotation,
                glow,
                color,
                measuredWidth: 0,
                start: reconstructedWords[i]?.start || 0,
                end: reconstructedWords[i]?.end || 0
            };
        });

        // Measure layout metrics & calculate space width with letter spacing
        const letterSpacing = ov.letter_spacing !== undefined 
            ? ov.letter_spacing 
            : (subtitleConfig?.letter_spacing !== undefined && subtitleConfig.letter_spacing !== null ? subtitleConfig.letter_spacing : 0);

        const setCtxFontAndSpacing = (fontStr: string) => {
            ctx.font = fontStr;
            if ('letterSpacing' in ctx) {
                (ctx as any).letterSpacing = `${letterSpacing}px`;
            }
        };

        const customLineSpacing = ov.line_spacing !== undefined 
            ? ov.line_spacing 
            : (subtitleConfig?.line_spacing !== undefined && subtitleConfig.line_spacing !== null ? subtitleConfig.line_spacing : 0);
        const lineSpacing = Math.round((20 + customLineSpacing) * scaleMul);

        const customX = ov.x !== undefined ? ov.x : subtitleConfig?.x;
        const customY = ov.y !== undefined ? ov.y : subtitleConfig?.y;

        // Position Y setup
        let baseY = H * 0.78;
        if (customY !== undefined) {
            baseY = H * (customY / 100);
        } else {
            if (positionPreset.includes('top')) baseY = H * 0.18;
            else if (positionPreset.includes('center')) baseY = H * 0.5;
        }

        let alignX = 'center';
        if (positionPreset.includes('right')) alignX = 'right';
        else if (positionPreset.includes('left')) alignX = 'left';

        // Auto-fit loop: if total width > 90% or height > 85%, scale font size down
        let fitScale = 1.0;
        let lines: typeof wordsLayout[] = [[]];
        let lineWidths: number[] = [];
        let lineHeights: number[] = [];
        let totalBlockHeight = 0;
        let spaceW = 0;
        let minLineX = Infinity;
        let maxLineRight = -Infinity;

        for (let attempt = 0; attempt < 5; attempt++) {
            // Apply fitScale to word font sizes
            wordsLayout.forEach((w, idx) => {
                const styleOverride = wordStylesParsed[idx] || {};
                const sizeMult = styleOverride.size !== undefined ? styleOverride.size : 1.0;
                w.fontSize = Math.round(basePx * sizeMult * scaleMul * fitScale);
            });

            ctx.save();
            const scaledBasePx = Math.round(basePx * scaleMul * fitScale);
            const baseFontFamily = getNormalizedFontName(ov.font || subtitleConfig?.font || 'Inter');
            setCtxFontAndSpacing(`bold ${scaledBasePx}px '${baseFontFamily}', Inter, sans-serif`);
            spaceW = ctx.measureText(' ').width || (scaledBasePx * 0.28);

            // Populate measuredWidth for all words
            wordsLayout.forEach((w) => {
                setCtxFontAndSpacing(`${w.italic ? 'italic ' : ''}${w.bold ? 'bold ' : ''}${w.fontSize}px '${w.fontFamily}', Inter, sans-serif`);
                w.measuredWidth = ctx.measureText(w.word).width;
            });
            ctx.restore();

            // Calculate total single-line width
            let totalSingleLineWidth = 0;
            wordsLayout.forEach((w, idx) => {
                totalSingleLineWidth += w.measuredWidth;
                if (idx < wordsLayout.length - 1) {
                    totalSingleLineWidth += spaceW;
                }
            });

            // Group into lines with auto-wrapping & line balancing
            const maxLineWidth = W * 0.82; // Safe layout boundary width
            lines = [[]];
            const hasExplicitNewline = wordsLayout.some(w => w.newline);
            const needsWrap = (totalSingleLineWidth > maxLineWidth) || hasExplicitNewline;

            if (needsWrap) {
                if (hasExplicitNewline) {
                    wordsLayout.forEach((w, i) => {
                        if (w.newline && i > 0) {
                            lines.push([]);
                        }
                        lines[lines.length - 1].push(w);
                    });
                } else if (wordsLayout.length <= 5) {
                    const totalWords = wordsLayout.length;
                    const splitIdx = Math.max(1, Math.floor(totalWords / 2));
                    lines.push(wordsLayout.slice(0, splitIdx));
                    lines.push(wordsLayout.slice(splitIdx));
                } else {
                    wordsLayout.forEach((w, i) => {
                        const currentLine = lines[lines.length - 1];
                        let currentLineWidth = 0;
                        currentLine.forEach((lw, idx) => {
                            currentLineWidth += lw.measuredWidth;
                            if (idx < currentLine.length - 1) {
                                currentLineWidth += spaceW;
                            }
                        });

                        const wouldExceed = currentLine.length > 0 && (currentLineWidth + spaceW + w.measuredWidth > maxLineWidth);

                        if (wouldExceed) {
                            lines.push([w]);
                        } else {
                            currentLine.push(w);
                        }
                    });
                }
            } else {
                lines[0] = wordsLayout;
            }

            // Measure layout metrics
            lineWidths = [];
            lineHeights = [];
            totalBlockHeight = 0;

            lines.forEach((line, j) => {
                let lineWidth = 0;
                let maxLineHeight = 0;

                line.forEach((w, i) => {
                    lineWidth += w.measuredWidth;
                    if (i < line.length - 1) lineWidth += spaceW;
                    if (w.fontSize > maxLineHeight) maxLineHeight = w.fontSize;
                });

                lineWidths.push(lineWidth);
                lineHeights.push(maxLineHeight);
                totalBlockHeight += maxLineHeight + (j < lines.length - 1 ? lineSpacing : 0);
            });

            // Compute overall bounds
            minLineX = Infinity;
            maxLineRight = -Infinity;
            lines.forEach((line, j) => {
                let currentX = W / 2 - lineWidths[j] / 2;
                if (customX !== undefined) {
                    currentX = W * (customX / 100) - lineWidths[j] / 2;
                } else {
                    if (alignX === 'right') {
                        currentX = W * 0.85 - lineWidths[j];
                    } else if (alignX === 'left') {
                        currentX = W * 0.15;
                    }
                }
                if (currentX < minLineX) minLineX = currentX;
                if (currentX + lineWidths[j] > maxLineRight) maxLineRight = currentX + lineWidths[j];
            });

            const blockWidth = maxLineRight - minLineX;
            if (blockWidth <= W * 0.88 && totalBlockHeight <= H * 0.85) {
                break;
            }
            fitScale *= 0.85; // Scale down proportionally
        }

        // Draw line blocks
        let currentY = baseY - totalBlockHeight / 2;
        let globalWordIdx = 0;

        lines.forEach((line, j) => {
            let currentX = W / 2 - lineWidths[j] / 2;
            if (customX !== undefined) {
                currentX = W * (customX / 100) - lineWidths[j] / 2;
            } else {
                if (alignX === 'right') {
                    currentX = W * 0.85 - lineWidths[j]; // Align to right safety margin
                } else if (alignX === 'left') {
                    currentX = W * 0.15; // Align to left safety margin
                }
            }

            line.forEach((w) => {
                const isActive = isSub ? (globalWordIdx === activeIdx) : false;
                
                // Active word pop animation
                let scaleFactor = 1.0;
                if (isActive && isSub) {
                    const wordStart = w.start;
                    const dt = t - wordStart;
                    const baseActiveScale = 1.15; // Hold at a slightly larger size for a premium kinetic look
                    if (dt >= 0 && dt < 0.15) {
                        const progress = dt / 0.15;
                        scaleFactor = activeScaleFactor - (activeScaleFactor - baseActiveScale) * Math.sin(progress * Math.PI / 2);
                    } else {
                        scaleFactor = baseActiveScale;
                    }
                }

                const cx = currentX + w.measuredWidth / 2 + (w.x_offset * scaleMul);
                const cy = currentY + lineHeights[j] + (w.y_offset * scaleMul);

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';

                // Rotate/scale layout matrices
                const centerY = cy - w.fontSize * 0.35;
                ctx.translate(cx, centerY);
                if (scaleFactor !== 1.0) {
                    ctx.scale(scaleFactor, scaleFactor);
                }
                if (w.rotation !== 0) {
                    ctx.rotate(w.rotation * Math.PI / 180);
                }
                ctx.translate(-cx, -centerY);

                setCtxFontAndSpacing(`${w.italic ? 'italic ' : ''}${w.bold ? 'bold ' : ''}${w.fontSize}px '${w.fontFamily}', Inter, sans-serif`);

                // Fill style & Opacity mapping
                const isAccentWord = isSub 
                    ? isActive 
                    : (w.color !== null || (wordsList.length === 3 && globalWordIdx === 1) || (wordsList.length === 2 && globalWordIdx === 1));

                if (isSub) {
                    ctx.fillStyle = w.color || (isActive ? accentColor : mainColor);
                    ctx.globalAlpha = isActive ? 1.0 : inactiveOpacity;
                } else {
                    ctx.fillStyle = w.color || (isAccentWord ? accentColor : mainColor);
                    ctx.globalAlpha = 1.0;
                }

                // Shadows & Glow
                const useOutline = ov.use_outline !== false;
                const useShadow = ov.use_shadow !== false;

                if (w.glow || (isSub && isActive && ov.animation_style === 'glow')) {
                    ctx.shadowColor = w.color || accentColor || '#00E5FF';
                    ctx.shadowBlur = 25;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                } else if (useShadow) {
                    ctx.shadowColor = 'rgba(0,0,0,0.75)';
                    ctx.shadowBlur = shadowBlur;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 2;
                } else {
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                }

                if (useOutline && !useShadow) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
                    ctx.lineWidth = Math.max(2, w.fontSize * 0.06);
                    ctx.strokeText(w.word, cx, cy);
                }
                ctx.fillText(w.word, cx, cy);

                ctx.restore();

                currentX += w.measuredWidth + spaceW;
                globalWordIdx++;
            });

            currentY += lineHeights[j] + lineSpacing;
        });

        const boxLeft = minLineX;
        const boxTop = baseY - totalBlockHeight / 2;
        const boxWidth = maxLineRight - minLineX;
        const boxHeight = totalBlockHeight;

        // Find edit index in editsRef.current
        const editIndex = editsRef.current.indexOf(ov);

        drawnTextBoxesRef.current.push({
            id: isSub ? "subtitles" : `graphic-${editIndex}`,
            isSub,
            editIndex: editIndex !== -1 ? editIndex : undefined,
            chunkIndex: ov.chunk_index,
            left: boxLeft,
            top: boxTop,
            width: boxWidth,
            height: boxHeight,
            x: customX !== undefined ? customX : 50,
            y: customY !== undefined ? customY : (positionPreset.includes('top') ? 18 : positionPreset.includes('center') ? 50 : 78)
        });
    }, [transcript, subtitleConfig]);

    // ── Aesthetic Captions: word-by-word renderer ─────────────────
    const drawAestheticCaptions = useCallback((ctx: CanvasRenderingContext2D, t: number, W: number, H: number) => {
        const activeSub = editsRef.current.find(
            e => e.action === 'add_text_overlay' && e.is_subtitle && e.start != null && e.end != null && t >= e.start && t < e.end
        );
        if (!activeSub) return;
        drawStyledTextOverlay(ctx, activeSub, t, W, H, true);
    }, [drawStyledTextOverlay]);

    // ── Draw current video frame + overlays to canvas ─────────────
    const drawFrame = useCallback(() => {
        drawnTextBoxesRef.current = [];
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video || video.readyState < 2) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const VW = video.videoWidth || 1280;
        const VH = video.videoHeight || 720;
        const videoRatio = VW / VH;

        // Resize canvas to match target ratio (keep VH as height, adjust width)
        let canvasW = VW;
        let canvasH = VH;
        if (Math.abs(videoRatio - targetRatio) > 0.01) {
            canvasW = Math.round(VH * targetRatio);
            canvasH = VH;
        }

        if (canvas.width !== canvasW || canvas.height !== canvasH) {
            canvas.width = canvasW;
            canvas.height = canvasH;
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

        // Draw cropped and centered video
        let sWidth = VW;
        let sHeight = VH;
        let sx = 0;
        let sy = 0;

        if (videoRatio > targetRatio) {
            // Video is wider than canvas -> crop sides
            sWidth = VH * targetRatio;
            sx = (VW - sWidth) / 2;
        } else if (videoRatio < targetRatio) {
            // Video is taller than canvas -> crop top/bottom
            sHeight = VW / targetRatio;
            sy = (VH - sHeight) / 2;
        }

        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, W, H);
        ctx.restore();

        // ── Aesthetic Captions (word-by-word, from transcript) ──────
        // Only render if we have transcript data AND an add_subtitles edit is active
        const hasSubtitleEdit = editsRef.current.some(e => e.action === 'add_subtitles');
        if (transcript?.words && transcript.words.length > 0 && hasSubtitleEdit) {
            drawAestheticCaptions(ctx, t, W, H);
        }

        // ── Draw text overlays (add_text_overlay) ──────
        // If hasSubtitleEdit is true, we ONLY draw custom overlays (not subtitles)
        const activeTexts = textOverlays.filter(
            e => (!hasSubtitleEdit || !e.is_subtitle) && e.start != null && e.end != null && t >= (e.start as number) && t < (e.end as number)
        );
        for (const ov of activeTexts) {
            drawStyledTextOverlay(ctx, ov, t, W, H, false);
        }

        // Draw selection box around selected element if focused
        if (focusedClipId && drawnTextBoxesRef.current.length > 0) {
            const focusedBox = drawnTextBoxesRef.current.find(box => {
                if (focusedClipId === "T1-Subtitles" || focusedClipId === "subtitles") {
                    return box.isSub;
                }
                if (focusedClipId.startsWith("T1-Sub-")) {
                    return box.isSub;
                }
                if (focusedClipId.startsWith("G1-Graphic-")) {
                    const parts = focusedClipId.split('-');
                    const gIdx = parseInt(parts[parts.length - 1], 10);
                    const graphicEdits = editsRef.current.filter(x => 
                        x.action === "canvas_overlay" || x.action === "hyperframes_html" ||
                        x.action === 'add_hyperframes_graphics' || x.action === 'add_motion_graphic' ||
                        x.action === 'add_dynamic_graphic' || x.action === 'add_text_overlay'
                    );
                    const targetEdit = graphicEdits[gIdx];
                    const targetEditIndex = editsRef.current.indexOf(targetEdit);
                    return box.editIndex === targetEditIndex;
                }
                return false;
            });

            if (focusedBox) {
                ctx.save();
                const pad = 12;

                // 1. Soft glowing backdrop
                ctx.fillStyle = 'rgba(59, 130, 246, 0.04)';
                drawRoundedRect(
                    ctx,
                    focusedBox.left - pad,
                    focusedBox.top - pad,
                    focusedBox.width + pad * 2,
                    focusedBox.height + pad * 2,
                    8
                );
                ctx.fill();

                // 2. High-contrast dashed border
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
                ctx.lineWidth = 2.0;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(
                    focusedBox.left - pad,
                    focusedBox.top - pad,
                    focusedBox.width + pad * 2,
                    focusedBox.height + pad * 2
                );

                // 3. Thin solid border (rigid safe bounds)
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
                ctx.lineWidth = 1;
                ctx.setLineDash([]);
                ctx.strokeRect(
                    focusedBox.left - pad,
                    focusedBox.top - pad,
                    focusedBox.width + pad * 2,
                    focusedBox.height + pad * 2
                );
                
                // 4. Circular corner handles
                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#3B82F6';
                ctx.lineWidth = 2;
                const hs = 10;
                const corners = [
                    { x: focusedBox.left - pad, y: focusedBox.top - pad },
                    { x: focusedBox.left + focusedBox.width + pad, y: focusedBox.top - pad },
                    { x: focusedBox.left - pad, y: focusedBox.top + focusedBox.height + pad },
                    { x: focusedBox.left + focusedBox.width + pad, y: focusedBox.top + focusedBox.height + pad }
                ];
                corners.forEach(c => {
                    ctx.beginPath();
                    ctx.arc(c.x, c.y, hs / 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();
                });

                // 5. "TEXT ZONE" text tag
                ctx.font = 'bold 10px monospace';
                ctx.fillStyle = '#3B82F6';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText('TEXT ZONE', focusedBox.left - pad, focusedBox.top - pad - 6);

                ctx.restore();
            }
        }
    }, [textOverlays, drawAestheticCaptions, drawStyledTextOverlay, transcript, focusedClipId, targetRatio]);

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

    const isDraggingRef = useRef(false);
    const dragStartPointerRef = useRef({ x: 0, y: 0 });
    const dragStartCoordsRef = useRef({ x: 0, y: 0 });
    const draggedBoxRef = useRef<any>(null);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

        // Check if hit any box, reverse array so top overlays are hit first
        const hitBox = [...drawnTextBoxesRef.current].reverse().find(box => {
            return clickX >= box.left && clickX <= box.left + box.width &&
                   clickY >= box.top && clickY <= box.top + box.height;
        });

        if (hitBox) {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            
            // Pause video if playing
            if (isPlaying && onTogglePlay) {
                onTogglePlay();
            }

            isDraggingRef.current = true;
            draggedBoxRef.current = hitBox;
            dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
            dragStartCoordsRef.current = { x: hitBox.x, y: hitBox.y };

            // Select the item
            let focusId = "";
            if (hitBox.isSub) {
                focusId = hitBox.chunkIndex !== undefined ? `T1-Sub-${hitBox.chunkIndex}` : "T1-Sub-0";
            } else if (hitBox.editIndex !== undefined) {
                const graphicEdits = editsRef.current.filter(x => 
                    x.action === "canvas_overlay" || x.action === "hyperframes_html" ||
                    x.action === 'add_hyperframes_graphics' || x.action === 'add_motion_graphic' ||
                    x.action === 'add_dynamic_graphic' || x.action === 'add_text_overlay'
                );
                const relIdx = graphicEdits.indexOf(editsRef.current[hitBox.editIndex]);
                focusId = `G1-Graphic-${relIdx !== -1 ? relIdx : 0}`;
            }

            if (focusId) {
                window.dispatchEvent(new CustomEvent('select_clip_focus', { detail: focusId }));
            }
        } else {
            isDraggingRef.current = false;
            draggedBoxRef.current = null;
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDraggingRef.current || !draggedBoxRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        
        // Drag delta in client pixels
        const clientDx = e.clientX - dragStartPointerRef.current.x;
        const clientDy = e.clientY - dragStartPointerRef.current.y;

        // Convert delta to canvas percentage
        const pctDx = (clientDx / rect.width) * 100;
        const pctDy = (clientDy / rect.height) * 100;

        const newX = Math.round(Math.max(0, Math.min(100, dragStartCoordsRef.current.x + pctDx)));
        const newY = Math.round(Math.max(0, Math.min(100, dragStartCoordsRef.current.y + pctDy)));

        const box = draggedBoxRef.current;
        box.x = newX;
        box.y = newY;

        // Update coordinates in parent state
        if (box.isSub) {
            // Mutate in editsRef.current to give immediate 60fps draw feedback
            const subEdit = editsRef.current.find(x => x.action === 'add_subtitles');
            if (subEdit) {
                subEdit.x = newX;
                subEdit.y = newY;
            }
            // Also mutate all active subtitle overlay chunk edits so they are drawn at the new coords instantly
            editsRef.current.forEach(x => {
                if (x.action === 'add_text_overlay' && x.is_subtitle) {
                    x.x = newX;
                    x.y = newY;
                }
            });
            onUpdateSubtitleGlobal?.('x', newX);
            onUpdateSubtitleGlobal?.('y', newY);
        } else if (box.editIndex !== undefined) {
            const edit = editsRef.current[box.editIndex];
            if (edit) {
                edit.x = newX;
                edit.y = newY;
            }
            onUpdateEdit?.(box.editIndex, { x: newX, y: newY });
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isDraggingRef.current) {
            try {
                e.currentTarget.releasePointerCapture(e.pointerId);
            } catch (err) {}
            isDraggingRef.current = false;
            draggedBoxRef.current = null;
        } else {
            onTogglePlay();
        }
    };

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
                        width: targetRatio > 1 ? '100%' : 'auto',
                        height: targetRatio < 1 ? '100%' : 'auto',
                        aspectRatio: `${targetRatio}`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                    }}
                >
                    <canvas
                        ref={canvasRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
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
                                    src={resolveMediaUrl(s.transition_resolved)}
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
                                    src={resolveMediaUrl(s.sfx_resolved)}
                                    preload="auto"
                                />
                            ))}
                        </div>
                    )}

                    {/* Asset Overlays (Transitions, SFX) */}
                    {videoReady && assetEdits.map((edit, i) => {
                        const src = resolveMediaUrl(edit.resolved_path);
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
});

export default SandboxPlayer;
