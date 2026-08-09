"use client";
import { useRef, useEffect, useState, useCallback, useImperativeHandle, useMemo, forwardRef } from "react";
import { getApiUrl } from "@/utils/api";
import { useVibe } from "@/context/VibeContext";
import { SemanticSceneOverlay } from "@/components/SemanticSceneOverlay";
import { RemotionGraphicPlayer } from "@/components/RemotionGraphicPlayer";
import { ReactBitsPlayer } from "@/components/ReactBitsPlayer";


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
    type?: string;       // zoom_in | zoom_out | zoom_hold
    intensity?: number;  // peak zoom scale
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
    behind_speaker?: boolean;
    bg_color?: string;
    text_color?: string;
    text_opacity?: number;
    gradient_color2?: string;
    mode?: string;       // overlay | full_broll | fullscreen | split
    layout?: string;
    design_aspect?: string; // "16:9" | "9:16" — canvas HTML was authored for
    offset_x?: number;
    offset_y?: number;
    scale_x?: number;
    scale_y?: number;
    preset?: string;
    component?: string;

    volume?: number;
    accent_font?: string;
    accent_color?: string;
    use_shadow?: boolean;
    shadow_blur?: number;
    text_case?: string;
    is_subtitle?: boolean;
    chunk_index?: number;
    duration?: number;
    font_pairing?: string;
    word_styles?: string;
    inactive_opacity?: number;
    active_scale?: number;
    x?: number;
    y?: number;
    /** Manual drag offset of HTML graphic overlay (% of frame). */
    offset_x?: number;
    offset_y?: number;
    /** Manual scale of HTML graphic overlay (1 = 100%). */
    scale_x?: number;
    scale_y?: number;
    width?: number;
    height?: number;
    letter_spacing?: number;
    line_spacing?: number;
    scene_data?: any;
    lut?: string;

    brightness?: number;
    contrast?: number;
    saturation?: number;
    hue?: number;
    style?: string;
    subtext?: string;
    geometry?: string;
    material?: string;
    animation?: string;
    particle_count?: number;
    particle_size?: number;
    custom_shader?: string;
    vibe_config?: any;
    layout?: string;
    is_split?: boolean;
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
    behind_speaker?: boolean;
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
    isBgText?: boolean;
    editIndex?: number;
    chunkIndex?: number;
    left: number;
    top: number;
    width: number;
    height: number;
    x: number;
    y: number;
    isEntity?: boolean;
    entityId?: string;
    sceneEditIndex?: number;
}

interface Props {
    videoSrc: string | null;
    /** @deprecated Prefer rvmMaskSrc — VP8 WebM alpha is unreliable in canvas */
    rvmAlphaSrc?: string | null;
    /** Grayscale H.264 matte for reliable behind-speaker cutout */
    rvmMaskSrc?: string | null;
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
    onUpdateSubtitleGlobalMultiple?: (fields: Record<string, any>) => void;
    onUpdateSubtitleChunk?: (chunkIndex: number, text: string) => void;
    brandId?: string;
    brandAssets?: { fonts: any[]; luts: any[]; music?: any[] };
    selectedTemplate?: string;
}

// ──────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function easeInOutCubic(t: number): number {
    const x = Math.min(1, Math.max(0, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Soft punch envelope: rise → settle back to 0 so scale never cliffs when the edit ends */
function zoomPunchEnvelope(p: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return 0;
    if (p < 0.55) return easeInOutCubic(p / 0.55);
    return 1 - easeInOutCubic((p - 0.55) / 0.45);
}

// Google Fonts (Cyrillic-capable). Prefer CSS load over latin-only fontsource files.
const CYRILLIC_FONT_CSS =
    'https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Inter:wght@700;900&family=JetBrains+Mono:wght@700&family=Manrope:wght@700;800&family=Montserrat:wght@700;800;900&family=Oswald:wght@700&family=Playfair+Display:wght@700&family=Rubik:wght@700;800&family=Unbounded:wght@700;900&family=Bebas+Neue&family=IBM+Plex+Sans:wght@700&display=swap';

const FONT_URLS: Record<string, string> = {
    // Fallback files — prefer Cyrillic subsets from fontsource when CSS load fails
    'Inter': 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-cyrillic-700-normal.woff2',
    'Manrope': 'https://cdn.jsdelivr.net/npm/@fontsource/manrope@5.0.8/files/manrope-cyrillic-700-normal.woff2',
    'Rubik': 'https://cdn.jsdelivr.net/npm/@fontsource/rubik@5.0.8/files/rubik-cyrillic-700-normal.woff2',
    'Oswald': 'https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.8/files/oswald-cyrillic-700-normal.woff2',
    'Montserrat': 'https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.8/files/montserrat-cyrillic-800-normal.woff2',
    'Comfortaa': 'https://cdn.jsdelivr.net/npm/@fontsource/comfortaa@5.0.8/files/comfortaa-cyrillic-700-normal.woff2',
    'Lobster': 'https://cdn.jsdelivr.net/npm/@fontsource/lobster@5.0.8/files/lobster-cyrillic-400-normal.woff2',
    'JetBrainsMono': 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.8/files/jetbrains-mono-cyrillic-700-normal.woff2',
    'IBMPlexSans': 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5.0.8/files/ibm-plex-sans-cyrillic-700-normal.woff2',
    'Unbounded': 'https://cdn.jsdelivr.net/npm/@fontsource/unbounded@5.0.8/files/unbounded-cyrillic-700-normal.woff2',
    'PlayfairDisplay': 'https://cdn.jsdelivr.net/npm/@fontsource/playfair-display@5.0.8/files/playfair-display-cyrillic-700-normal.woff2',
    'BebasNeue': 'https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.0.8/files/bebas-neue-latin-400-normal.woff2',
};

const LUT_PRESETS: Record<string, { brightness: number; contrast: number; saturation: number; hue: number }> = {
    cinema: { brightness: 1.0, contrast: 1.1, saturation: 1.1, hue: 0 },
    vintage: { brightness: 0.95, contrast: 0.9, saturation: 0.8, hue: 5 },
    cyberpunk: { brightness: 1.0, contrast: 1.2, saturation: 1.4, hue: -10 },
    monochrome: { brightness: 1.0, contrast: 1.2, saturation: 0.0, hue: 0 },
    teal_orange: { brightness: 1.0, contrast: 1.1, saturation: 1.2, hue: 10 },
    vibrant: { brightness: 1.0, contrast: 1.1, saturation: 1.3, hue: 0 },
    cold: { brightness: 1.0, contrast: 1.05, saturation: 0.9, hue: -15 },
    warm: { brightness: 1.05, contrast: 1.0, saturation: 1.1, hue: 15 }
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

    const start = zoom.start as number;
    const end = zoom.end as number;
    const dur = Math.max(0.05, end - start);
    const p = Math.min(1, Math.max(0, (t - start) / dur));
    const peak = typeof (zoom as any).intensity === 'number'
        ? Math.min(1.35, Math.max(1.05, (zoom as any).intensity))
        : 1.14;

    const zType = zoom.type || 'zoom_in';

    // Hold zoomed with soft ramp in/out — no hard cut at boundaries
    if (zType === 'zoom_hold' || zType === 'hold') {
        if (p < 0.18) return lerp(1, peak, easeInOutCubic(p / 0.18));
        if (p > 0.82) return lerp(peak, 1, easeInOutCubic((p - 0.82) / 0.18));
        return peak;
    }

    // Default punch: ease to peak then settle back to 1 before edit ends
    const envelope = zoomPunchEnvelope(p);
    if (zType === 'zoom_out') {
        // Slow pull-back that also settles (starts zoomed, eases toward 1)
        return lerp(peak, 1, easeInOutCubic(p));
    }
    // zoom_in / punch
    return lerp(1, peak, envelope);
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

function getEmojiForIcon(id: string): string {
    const mapping: Record<string, string> = {
        'rocket': '🚀', 'fire': '🔥', 'warning': '⚠️', 'check': '✅',
        'star': '⭐', 'lightning': '⚡', 'chart': '📊', 'crm': '💻',
        'sales': '📈', 'money': '💰', 'arrow': '➡️', 'brain': '🧠'
    };
    return mapping[id] || id;
}

function drawArrowhead(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, size: number) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
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
    rvmAlphaSrc = null,
    rvmMaskSrc = null,
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
    onUpdateSubtitleGlobalMultiple,
    onUpdateSubtitleChunk,
    brandId,
    brandAssets,
    selectedTemplate,
}, ref) {
    const { vibeConfig } = useVibe();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const videoRef = (ref as React.RefObject<HTMLVideoElement | null>) || localVideoRef;
    const rvmAlphaVideoRef = useRef<HTMLVideoElement>(null);
    const rvmMaskVideoRef = useRef<HTMLVideoElement>(null);
    const cutoutCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const maskAlphaCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [rvmAlphaReady, setRvmAlphaReady] = useState(false);
    const [rvmMaskReady, setRvmMaskReady] = useState(false);

    // Behind-speaker must use 2D canvas — Three.js path never draws the layered stack
    const behindModeActive = useMemo(() => {
        const setBg = edits.some(e => e.action === 'set_video_background');
        const sub = edits.find(e => e.action === 'add_subtitles');
        const behindSubs = !!(
            sub?.behind_speaker ||
            sub?.position === 'behind_speaker' ||
            (subtitleConfig as any)?.behind_speaker ||
            (subtitleConfig as any)?.position === 'behind_speaker'
        );
        return !!(setBg || behindSubs);
    }, [edits, subtitleConfig]);
    const gsapIframeRef = useRef<HTMLIFrameElement>(null);
    const rafRef = useRef<number | null>(null);
    const edlRef = useRef(edl);
    const editsRef = useRef(edits);
    const drawnTextBoxesRef = useRef<DrawnTextBox[]>([]);
    const [selectedEntity, setSelectedEntity] = useState<{ sceneEditIndex: number; entityId: string } | null>(null);
    const [selectedGraphicEditIndex, setSelectedGraphicEditIndex] = useState<number | null>(null);
    const [editingEntity, setEditingEntity] = useState<{
        sceneEditIndex: number;
        entityId: string;
        left: number;
        top: number;
        width: number;
        height: number;
        text: string;
    } | null>(null);
    const dragStartDimsRef = useRef({ width: 0, height: 0, fontSize: 0 });
    const dragModeRef = useRef<'move' | 'resize-TL' | 'resize-TR' | 'resize-BL' | 'resize-BR' | 'resize-T' | 'resize-B' | 'resize-L' | 'resize-R' | null>(null);

    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const webglCanvasRef = useRef<HTMLCanvasElement | null>(null); // Dedicated WebGL canvas — never gets a 2D context
    const threeCompositorRef = useRef<any>(null);
    const [threeReady, setThreeReady] = useState(false); // Controls DOM rendering and updates dependency array

    const [currentTime, setCurrentTime] = useState(0);
    const [dur, setDur] = useState(duration || 0);
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => {
        if (videoReady) {
            if (!overlayCanvasRef.current) {
                overlayCanvasRef.current = document.createElement('canvas');
            }

            // Size the WebGL and Overlay canvas to match the main canvas dimensions
            const mainCanvas = canvasRef.current;
            if (mainCanvas && webglCanvasRef.current) {
                webglCanvasRef.current.width = mainCanvas.width || 1280;
                webglCanvasRef.current.height = mainCanvas.height || 720;
                overlayCanvasRef.current.width = mainCanvas.width || 1280;
                overlayCanvasRef.current.height = mainCanvas.height || 720;
            }

            if (threeCompositorRef.current) {
                threeCompositorRef.current.destroy();
                threeCompositorRef.current = null;
                setThreeReady(false);
            }

            import('@/utils/threeCompositor').then(({ ThreeCompositor }) => {
                if (!videoRef.current || !webglCanvasRef.current || !overlayCanvasRef.current) return;
                try {
                    threeCompositorRef.current = new ThreeCompositor(
                        webglCanvasRef.current,
                        videoRef.current,
                        overlayCanvasRef.current
                    );
                    setThreeReady(true);
                    console.log("[SandboxPlayer] WebGL ThreeCompositor successfully initialized!");
                } catch (err) {
                    console.error("[SandboxPlayer] Failed to create ThreeCompositor:", err);
                    setThreeReady(false);
                }
            }).catch(err => {
                console.error("[SandboxPlayer] Failed to load ThreeCompositor:", err);
            });
        }

        return () => {
            setThreeReady(false);
            if (threeCompositorRef.current) {
                threeCompositorRef.current.destroy();
                threeCompositorRef.current = null;
            }
        };
    }, [videoReady]);

    const [videoAspect, setVideoAspect] = useState<number>(16 / 9);
    const targetRatio = useMemo(() => {
        if (targetFormat === '16:9') return 16 / 9;
        if (targetFormat === '9:16') return 9 / 16;
        return videoAspect;
    }, [targetFormat, videoAspect]);

    const activeMG = useMemo(() => {
        if (!videoReady) return null;
        const raw = edits.find(e => (e.action === 'add_motion_graphic' || e.action === 'add_broll') && e.start != null && e.end != null && currentTime >= e.start && currentTime < e.end);
        if (raw && raw.action === 'add_broll') {
            if (raw.broll_url === 'remotion_three_js_dynamic' || (!raw.resolved_path && !raw.broll_url)) {
                const query = raw.query || 'technology';
                let style = 'cinematic';
                if (/tech|data|code|blueprint|logic|graph/i.test(query)) {
                    style = 'blueprint';
                } else if (/fluid|flow|energy|liquid|particles/i.test(query)) {
                    style = 'liquid';
                }
                return {
                    ...raw,
                    action: 'add_motion_graphic',
                    style: style,
                    text: query.toUpperCase(),
                    subtext: 'A-ROLL VISUALIZATION',
                    accent_color: '#a78bfa'
                };
            }
            return null;
        }
        return raw;
    }, [edits, currentTime, videoReady]);
    const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());
    
    const API_URL = getApiUrl();

    const [proxyFailed, setProxyFailed] = useState(false);

    const isMobile = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    }, []);

    const resolveMediaUrl = useCallback((path: string | undefined) => {
        if (!path) return "";
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        if (path.startsWith("uploads/")) return `${API_URL}/${path}`;
        return `${API_URL}/assets/${path}`;
    }, [API_URL]);

    useEffect(() => {
        setProxyFailed(false);
    }, [videoSrc]);

    useEffect(() => {
        setRvmAlphaReady(false);
    }, [rvmAlphaSrc]);

    useEffect(() => {
        setRvmMaskReady(false);
    }, [rvmMaskSrc]);

    const activeVideoSrc = useMemo(() => {
        if (!videoSrc) return null;
        
        let src = videoSrc;
        if (isMobile && !proxyFailed) {
            // Try to find if there is a proxy path in mediaLibrary
            if (mediaLibrary && mediaLibrary.length > 0) {
                const filenameFromSrc = videoSrc.split('/').pop()?.toLowerCase();
                if (filenameFromSrc) {
                    const foundItem = mediaLibrary.find((item: any) => {
                        const itemPath = item.path || "";
                        return itemPath.toLowerCase().endsWith(filenameFromSrc);
                    });
                    if (foundItem && foundItem.proxy_path) {
                        src = resolveMediaUrl(foundItem.proxy_path);
                    }
                }
            } else if (videoSrc.includes('/uploads/') && !videoSrc.includes('_rendered') && !videoSrc.includes('_proxy') && !videoSrc.includes('_rvm_preview')) {
                // Fallback: guess proxy name if it's in uploads/ and not a rendered video
                const parts = videoSrc.split('.');
                if (parts.length > 1) {
                    const ext = parts.pop();
                    const base = parts.join('.');
                    src = `${base}_proxy.${ext}`;
                }
            }
        }

        // Add a query parameter to bypass browser CORS cache for WebGL texture loader
        if (src.includes('?')) {
            return `${src}&cors=1`;
        }
        return `${src}?cors=1`;
    }, [videoSrc, isMobile, proxyFailed, mediaLibrary, resolveMediaUrl]);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const id = 'vibe-cyrillic-fonts';
        if (!document.getElementById(id)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = CYRILLIC_FONT_CSS;
            document.head.appendChild(link);
        }
    }, []);

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

            const markLoaded = () => {
                setLoadedFonts(prev => {
                    const next = new Set(prev);
                    next.add(normFont);
                    return next;
                });
            };

            const cssFamily = normFont === 'JetBrainsMono' ? 'JetBrains Mono'
                : normFont === 'IBMPlexSans' ? 'IBM Plex Sans'
                : normFont === 'PlayfairDisplay' ? 'Playfair Display'
                : normFont === 'BebasNeue' ? 'Bebas Neue'
                : normFont;

            // Google Fonts CSS (with Cyrillic) → document.fonts, then optional woff2 fallback
            if (typeof document !== 'undefined' && document.fonts?.load) {
                document.fonts.load(`700 64px "${cssFamily}"`).then((faces) => {
                    if (faces.length > 0) markLoaded();
                }).catch(() => { /* fallback below */ });
            }

            let url = FONT_URLS[normFont];
            if (!url && brandAssets?.fonts) {
                const bFont = brandAssets.fonts.find(f => f.name.toLowerCase() === normFont.toLowerCase() || f.filename.toLowerCase() === normFont.toLowerCase());
                if (bFont) {
                    url = bFont.path.startsWith("http") ? bFont.path : `${getApiUrl()}/${bFont.path}`;
                }
            }

            if (!url) {
                if (['Arial', 'Helvetica', 'Times New Roman', 'sans-serif', 'serif'].includes(normFont)) {
                    markLoaded();
                }
                return;
            }

            console.log(`[SandboxPlayer] Dynamic Font Loading: ${normFont} from ${url}`);
            const font = new FontFace(normFont, `url(${url})`, {
                weight: normFont === 'Lobster' || normFont === 'BebasNeue' ? '400' : '700',
            });

            font.load().then((loadedFont) => {
                document.fonts.add(loadedFont);
                markLoaded();
                console.log(`[SandboxPlayer] Font ${normFont} successfully loaded for Canvas rendering`);
            }).catch((err) => {
                console.warn(`[SandboxPlayer] FontFace failed to load ${normFont}:`, err);
            });
        });
    }, [subtitleConfig?.font, subtitleConfig?.font_pairing, edits, loadedFonts, brandAssets]);

    const assetEdits = edits.filter(e => e.action === 'add_asset' && e.resolved_path);
    const assetRefs = useRef<(HTMLMediaElement | null)[]>([]);
    const brollEdits = edits.filter(e => e.action === 'add_broll' && (e.resolved_path || e.broll_url));
    const brollRefs = useRef<(HTMLVideoElement | null)[]>([]);
    const sceneIframeRef = useRef<HTMLIFrameElement>(null);
    const sceneTransitionRefs = useRef<(HTMLMediaElement | null)[]>([]);
    const [isSceneActive, setIsSceneActive] = useState(false);

    const sceneEditsRef = useRef<Edit[]>([]);

    const forceHtmlTransparency = (html: string) => {
        if (!html) return '';
        return html
            .replace(/\bbg-white\b/g, 'bg-transparent')
            .replace(/\bbg-slate-50\b/g, 'bg-transparent')
            .replace(/\bbg-neutral-50\b/g, 'bg-transparent')
            .replace(/\bbg-zinc-50\b/g, 'bg-transparent')
            .replace(/\bbg-gray-50\b/g, 'bg-transparent')
            .replace(/background(-color)?\s*:\s*([^;"'}]+)/gi, (match, group1, value) => {
                const val = value.trim().toLowerCase().replace(/\s*!important/g, '');
                const isWhiteLike = val === 'white' || 
                                    val === '#fff' || 
                                    val === '#ffffff' || 
                                    val === '#f8fafc' || 
                                    val === '#f3f4f6' || 
                                    val === '#fafafa' || 
                                    val === '#f5f5f5' || 
                                    val === '#f9fafb' || 
                                    val.includes('255,255,255') || 
                                    val.includes('255, 255, 255') || 
                                    val.includes('248,250,252') || 
                                    val.includes('243,244,246');
                if (isWhiteLike) {
                    return 'background-color: transparent !important';
                }
                return match;
            });
    };

    // ── Scene Override Edits ──────────────────────────────────────
    const sceneEdits = edits.filter(e => e.action === 'scene_override' && e.html_content);

    // keep refs in sync to avoid stale closures in RAF
    useEffect(() => { edlRef.current = edl; }, [edl]);
    useEffect(() => { editsRef.current = edits; }, [edits]);
    const activeSemanticScenes = useMemo(() => {
        return edits.filter(
            e => e.action === 'semantic_scene' && e.scene_data && e.start != null && e.end != null && currentTime >= e.start && currentTime < e.end
        );
    }, [edits, currentTime]);
    useEffect(() => { if (duration > 0) setDur(duration); }, [duration]);
    useEffect(() => { sceneEditsRef.current = sceneEdits; }, [sceneEdits]);
    useEffect(() => {
        if (isPlaying) setSelectedGraphicEditIndex(null);
    }, [isPlaying]);

    // ── Graphics HTML ──────────────────────────────────────────────
    const graphicsEdits = edits.filter(e => 
        (e.action === 'canvas_overlay' || 
         e.action === 'hyperframes_html' || 
         e.action === 'add_hyperframes_graphics' || 
         e.action === 'add_motion_graphic' || 
         e.action === 'add_dynamic_graphic') && 
        (e.html_content || e.html)
    );
    const buildSingleGraphicHtml = useCallback((edit: Edit) => {
        const extractBody = (raw: string): string => {
            if (!/<html[\s>]/i.test(raw)) return raw; // raw fragment
            const bodyM = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            const headM = raw.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
            const headStyles: string[] = [];
            if (headM) {
                const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
                let m;
                while ((m = re.exec(headM[1])) !== null) headStyles.push(m[1]);
            }
            const prefix = headStyles.length ? `<style>${headStyles.join('\n')}</style>\n` : '';
            return prefix + (bodyM ? bodyM[1] : raw);
        };

        const isFullCover = edit.mode === 'full_broll' || edit.mode === 'fullscreen' || edit.action === 'scene_override';
        const rawHtml = edit.html_content || edit.html || '';
        const rawFragment = extractBody(isFullCover ? rawHtml : forceHtmlTransparency(rawHtml));
        const fragment = rawFragment
            .replace(/src=(['"])\/assets\//g, `src=$1${API_URL}/assets/`)
            .replace(/url\((['"]?)\/assets\//g, `url($1${API_URL}/assets/`);

        // Pull <script> blocks out of fragment so we can defer them after GSAP loads
        const scriptBlocks: string[] = [];
        const fragmentWithoutScripts = fragment.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, code) => {
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
  <script>
(function(){
  function ft(){
    try {
      var h=document.documentElement,b=document.body;
      if(h){h.style.setProperty('background','transparent','important');h.style.setProperty('background-color','transparent','important');}
      if(b){b.style.setProperty('background','transparent','important');b.style.setProperty('background-color','transparent','important');}
      
      var els = document.querySelectorAll('*');
      var w = window.innerWidth || 1080;
      var h = window.innerHeight || 1920;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.tagName === 'HTML' || el.tagName === 'BODY' || el.id === 'root') continue;
        
        var isWrapper = false;
        if (el.parentNode === b || (el.parentNode && el.parentNode.id === 'root')) {
          isWrapper = true;
        } else {
          var rect = el.getBoundingClientRect();
          if (rect.width >= w * 0.7 && rect.height >= h * 0.7) {
            isWrapper = true;
          }
        }
        
        if (isWrapper) {
          el.style.setProperty('background', 'transparent', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
          el.style.setProperty('background-image', 'none', 'important');
        }
      }
    } catch(e) {}
  }
  ft();
  document.addEventListener('DOMContentLoaded',ft);
  window.addEventListener('load',ft);
  setInterval(ft, 100);
  if(window.MutationObserver){
    new MutationObserver(function(ms){
      ft();
      for(var i=0; i<ms.length; i++){
        var m=ms[i];
        if(m.addedNodes){
          for(var j=0; j<m.addedNodes.length; j++){
            var n=m.addedNodes[j];
            if(n.nodeName==='STYLE'||n.nodeName==='LINK'||n.nodeType===1) setTimeout(ft,0);
          }
        }
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@700&family=Manrope:wght@400;700;800&family=Montserrat:wght@400;700;800;900&family=Oswald:wght@700&family=Playfair+Display:ital,wght@0,700;1,700&family=Rubik:wght@400;700;800&family=Unbounded:wght@700;900&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:100% !important;height:100% !important;overflow:hidden !important;background:transparent !important;background-color:transparent !important;color-scheme:dark !important;}
    .clip{position:absolute;}
    #root{
      width:${targetRatio >= 1 ? 1920 : 1080}px;height:${targetRatio >= 1 ? 1080 : 1920}px;
      position:absolute;top:0;left:0;
      transform-origin:top left;
      background:transparent !important;background-color:transparent !important;overflow:hidden;
    }
    html, body, #root, .clip,
    body > *, #root > *, #preview-container > *,
    .min-h-screen, .h-screen, .w-screen, .inset-0,
    [class*="min-h-screen"], [class*="h-screen"], [class*="w-screen"], [class*="inset-0"],
    [style*="height: 100vh"], [style*="height: 100%"], [style*="width: 100%"] {
        background: transparent !important;
        background-color: transparent !important;
    }
  </style>
</head>
<body style="background: transparent !important; background-color: transparent !important;">
  <div id="root">
    ${fragmentWithoutScripts}
  </div>
  <script>
    // Scale #root to fit viewport (match video aspect)
    const DESIGN_W=${targetRatio >= 1 ? 1920 : 1080};
    const DESIGN_H=${targetRatio >= 1 ? 1080 : 1920};
    function scaleRoot(){
      const r=document.getElementById('root');
      if(!r)return;
      r.style.width=DESIGN_W+'px';
      r.style.height=DESIGN_H+'px';
      const s=Math.min(window.innerWidth/DESIGN_W,window.innerHeight/DESIGN_H);
      r.style.transform='scale('+s+')';
      // Center the scaled container
      const scaledW=DESIGN_W*s, scaledH=DESIGN_H*s;
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
        const clipStart=${edit.start || 0};
        const clipEnd=${edit.end != null ? edit.end : ((edit.start || 0) + (edit.duration || 999999))};
        const clipDuration=Math.max(0.15, clipEnd - clipStart);
        const relTime = ev.data.relTime !== undefined ? ev.data.relTime : (t - clipStart);

        // Timeline edit window is authoritative after user stretch/trim
        const inWindow = t >= clipStart - 0.05 && t <= clipEnd + 0.05;
        const clips=document.querySelectorAll('.clip');
        clips.forEach(function(clip){
          clip.style.display = inWindow ? 'block' : 'none';
          if (inWindow) {
            clip.setAttribute('data-start', String(clipStart));
            clip.setAttribute('data-duration', String(clipDuration));
          }
        });

        // Sync GSAP timelines; hold visible pose when clip is stretched past baked anim length
        const tls=window.__timelines||{};
        const found=Object.values(tls);
        if(found.length===0 && window.gsap && window.gsap.globalTimeline){
          found.push(window.gsap.globalTimeline);
        }
        found.forEach(function(tl){
          if(tl&&tl.seek){
            tl.pause();
            const tlDur = tl.duration ? tl.duration() : 999;
            if (tlDur > 0 && tlDur <= 120) {
              const exitWindow = Math.min(0.6, Math.max(0.35, tlDur * 0.18));
              const holdAt = Math.max(0, Math.min(tlDur * 0.72, tlDur - 0.7));
              let seekTo = Math.max(0, relTime);
              if (relTime > holdAt && clipDuration > tlDur + 0.05) {
                if (relTime < clipDuration - exitWindow) {
                  seekTo = holdAt;
                } else {
                  const p = Math.min(1, Math.max(0, (relTime - (clipDuration - exitWindow)) / exitWindow));
                  seekTo = holdAt + p * (tlDur - holdAt);
                }
              } else {
                seekTo = Math.min(relTime, tlDur);
              }
              tl.seek(seekTo);
            } else {
              tl.seek(t);
            }
          }
        });
      });
    };
    document.head.appendChild(gsapScript);
  </script>
  <style>
    html, body, #root, .clip,
    body > *, #root > *, #preview-container > *,
    .min-h-screen, .h-screen, .w-screen, .inset-0,
    [class*="min-h-screen"], [class*="h-screen"], [class*="w-screen"], [class*="inset-0"],
    [style*="height: 100vh"], [style*="height: 100%"], [style*="width: 100%"] {
        background: transparent !important;
        background-color: transparent !important;
    }
  </style>
</body>
</html>`;
    }, [API_URL, forceHtmlTransparency, targetRatio]);

    // ── Scene Override HTML (full-frame opaque scenes) ─────────────
    const buildSceneHtml = (sceneEdit: Edit) => {
        // Never strip solid covers — scene_override / full_broll must stay opaque
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
  <script>
(function(){
  function ft(){
    try {
      var h=document.documentElement,b=document.body;
      if(h){h.style.setProperty('background','transparent','important');h.style.setProperty('background-color','transparent','important');}
      if(b){b.style.setProperty('background','transparent','important');b.style.setProperty('background-color','transparent','important');}
      
      var els = document.querySelectorAll('*');
      var w = window.innerWidth || 1080;
      var h = window.innerHeight || 1920;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.tagName === 'HTML' || el.tagName === 'BODY' || el.id === 'root') continue;
        
        var isWrapper = false;
        if (el.parentNode === b || (el.parentNode && el.parentNode.id === 'root')) {
          isWrapper = true;
        } else {
          var rect = el.getBoundingClientRect();
          if (rect.width >= w * 0.7 && rect.height >= h * 0.7) {
            isWrapper = true;
          }
        }
        
        if (isWrapper) {
          el.style.setProperty('background', 'transparent', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
          el.style.setProperty('background-image', 'none', 'important');
        }
      }
    } catch(e) {}
  }
  ft();
  document.addEventListener('DOMContentLoaded',ft);
  window.addEventListener('load',ft);
  setInterval(ft, 100);
  if(window.MutationObserver){
    new MutationObserver(function(ms){
      ft();
      for(var i=0; i<ms.length; i++){
        var m=ms[i];
        if(m.addedNodes){
          for(var j=0; j<m.addedNodes.length; j++){
            var n=m.addedNodes[j];
            if(n.nodeName==='STYLE'||n.nodeName==='LINK'||n.nodeType===1) setTimeout(ft,0);
          }
        }
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@700&family=Manrope:wght@400;700;800&family=Montserrat:wght@400;700;800;900&family=Oswald:wght@700&family=Playfair+Display:ital,wght@0,700;1,700&family=Rubik:wght@400;700;800&family=Unbounded:wght@700;900&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:100% !important;height:100% !important;overflow:hidden !important;background:transparent !important;background-color:transparent !important;color-scheme:dark !important;}
    .clip{position:absolute;}
    #root{
      width:${targetRatio >= 1 ? 1920 : 1080}px;height:${targetRatio >= 1 ? 1080 : 1920}px;
      position:absolute;top:0;left:0;
      transform-origin:top left;
      background:transparent !important;background-color:transparent !important;overflow:hidden;
    }
    img{max-width:none;}
  </style>
</head>
<body style="background: transparent !important; background-color: transparent !important;">
  <div id="root">
    ${htmlWithoutScripts}
  </div>
  <script>
    const DESIGN_W=${targetRatio >= 1 ? 1920 : 1080};
    const DESIGN_H=${targetRatio >= 1 ? 1080 : 1920};
    function scaleRoot(){
      const r=document.getElementById('root');
      if(!r)return;
      r.style.width=DESIGN_W+'px';
      r.style.height=DESIGN_H+'px';
      const s=Math.min(window.innerWidth/DESIGN_W,window.innerHeight/DESIGN_H);
      r.style.transform='scale('+s+')';
      const scaledW=DESIGN_W*s, scaledH=DESIGN_H*s;
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
  <style>
    html, body, #root, .clip,
    body > *, #root > *, #preview-container > *,
    .min-h-screen, .h-screen, .w-screen, .inset-0,
    [class*="min-h-screen"], [class*="h-screen"], [class*="w-screen"], [class*="inset-0"],
    [style*="height: 100vh"], [style*="height: 100%"], [style*="width: 100%"] {
        background: transparent !important;
        background-color: transparent !important;
    }
  </style>
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
        // behind_speaker is a layering flag, not a layout preset — keep bottom placement
        const rawPosition = ov.position || subtitleConfig?.position || 'bottom';
        const positionPreset = rawPosition === 'behind_speaker' ? 'bottom' : rawPosition;
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
            let fontOverride = styleOverride.font || ov.font || subtitleConfig?.font || 'Inter';

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

        // Calculate entrance/exit animation metrics
        const animStyle = ov.animation_style || 'fade';
        const duration = (ov.end || 0) - (ov.start || 0);
        const dt = t - (ov.start || 0);
        const dt_end = (ov.end || 0) - t;
        
        let blockOpacity = 1.0;
        let blockScale = 1.0;
        let blockTranslateX = 0;
        let blockTranslateY = 0;
        let blockBlur = 0;

        const entranceDur = 0.35;
        const exitDur = 0.25;

        let animProgress = 1.0;
        let isAnimating = false;

        if (dt >= 0 && dt < entranceDur) {
            animProgress = dt / entranceDur;
            isAnimating = true;
        } else if (dt_end >= 0 && dt_end < exitDur) {
            animProgress = dt_end / exitDur;
            isAnimating = true;
        }

        if (isAnimating) {
            if (animStyle === 'fade') {
                blockOpacity = animProgress;
            } else if (animStyle === 'pop') {
                blockOpacity = animProgress;
                blockScale = 0.82 + 0.18 * animProgress;
            } else if (animStyle === 'slide_up') {
                blockOpacity = animProgress;
                blockTranslateY = (1 - animProgress) * 40 * scaleMul;
            } else if (animStyle === 'bounce') {
                blockOpacity = animProgress;
                blockScale = 0.3 + 0.7 * Math.sin(animProgress * Math.PI * 0.65);
            } else if (animStyle === 'glow') {
                blockOpacity = animProgress;
                blockBlur = (1 - animProgress) * 16 * scaleMul;
            } else if (animStyle === 'slide_left') {
                blockOpacity = animProgress;
                blockTranslateX = -(1 - animProgress) * 60 * scaleMul;
            } else if (animStyle === 'slide_right') {
                blockOpacity = animProgress;
                blockTranslateX = (1 - animProgress) * 60 * scaleMul;
            }
        }

        ctx.save();
        
        if (blockOpacity !== 1.0) {
            ctx.globalAlpha = ctx.globalAlpha * blockOpacity;
        }
        
        if (blockBlur > 0) {
            try {
                ctx.filter = `blur(${Math.round(blockBlur)}px)`;
            } catch (err) {
                // fallback if not supported
            }
        }

        const blockCenterX = (minLineX + maxLineRight) / 2;
        const blockCenterY = baseY;

        if (blockTranslateX !== 0 || blockTranslateY !== 0 || blockScale !== 1.0) {
            ctx.translate(blockCenterX, blockCenterY);
            if (blockScale !== 1.0) {
                ctx.scale(blockScale, blockScale);
            }
            if (blockTranslateX !== 0 || blockTranslateY !== 0) {
                ctx.translate(blockTranslateX / blockScale, blockTranslateY / blockScale);
            }
            ctx.translate(-blockCenterX, -blockCenterY);
        }

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
                // For typewriter animation, only show words that have started!
                if (ov.animation_style === 'typewriter' && w.start > t) {
                    currentX += w.measuredWidth + spaceW;
                    globalWordIdx++;
                    return;
                }

                const useKaraokeHighlight = isSub && ov.animation_style === 'karaoke';
                const isActive = useKaraokeHighlight ? (globalWordIdx === activeIdx) : false;
                
                // Active word pop animation
                let scaleFactor = 1.0;
                if (isActive && useKaraokeHighlight) {
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
                if (useKaraokeHighlight) {
                    ctx.fillStyle = w.color || (isActive ? accentColor : mainColor);
                    ctx.globalAlpha = isActive ? 1.0 : inactiveOpacity;
                } else {
                    ctx.fillStyle = w.color || mainColor;
                    ctx.globalAlpha = 1.0;
                }


                // Shadows & Glow
                const useOutline = ov.use_outline !== false;
                const useShadow = ov.use_shadow !== false;

                if (w.glow || (useKaraokeHighlight && isActive && ov.animation_style === 'glow')) {
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

        ctx.restore();

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

    // ── Direct Semantic Scene Canvas Renderer (No Iframe) ──────────
    const drawSemanticSceneDirect = useCallback((
        ctx: CanvasRenderingContext2D,
        sceneData: any,
        start: number,
        end: number,
        t: number,
        W: number,
        H: number,
        sceneEditIndex: number
    ) => {
        if (t < start || t >= end) return;
        const styleProfile = sceneData.style_profile || {};
        const entities = sceneData.entities || [];
        const relations = sceneData.relations || [];
        const bgColor = styleProfile.bg_color || 'rgba(20, 20, 25, 0.65)';
        const borderColor = styleProfile.border_color || 'rgba(255, 255, 255, 0.15)';
        const glowColor = styleProfile.glow_color || 'rgba(255, 255, 255, 0.04)';
        const baseFontFamily = styleProfile.font_family || 'Inter, sans-serif';
        const elapsed = t - start;

        entities.forEach((entity: any) => {
            const xPercent = entity.x ?? 50;
            const yPercent = entity.y ?? 50;
            const wPercent = entity.width ?? 28;
            const hPercent = entity.height ?? 12;
            const targetX = (xPercent / 100) * W;
            const targetY = (yPercent / 100) * H;
            const targetW = (wPercent / 100) * W;
            const targetH = (hPercent / 100) * H;
            const anim = entity.animation || {};
            const animType = anim.type || 'fade';
            const animDuration = anim.duration || 0.6;
            const animDelay = anim.delay || 0.0;
            const progress = Math.min(1, Math.max(0, (elapsed - animDelay) / animDuration));
            let easeProgress = progress;
            if (anim.easing === 'linear') {
                easeProgress = progress;
            } else if (anim.easing === 'bounce' || anim.easing === 'ease-out-back') {
                const c4 = (2 * Math.PI) / 3;
                easeProgress = progress === 0 ? 0 : progress === 1 ? 1 : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;
            } else if (anim.easing === 'ease-out-expo' || anim.easing === 'expo-out') {
                easeProgress = progress === 0 ? 0 : progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            } else if (anim.easing === 'ease-out') {
                easeProgress = 1 - (1 - progress) * (1 - progress);
            } else if (anim.easing === 'ease-in') {
                easeProgress = progress * progress;
            } else {
                easeProgress = progress * progress * (3 - 2 * progress);
            }
            let currentX = targetX;
            let currentY = targetY;
            let currentOpacity = 1.0;
            let currentScale = 1.0;
            let currentRotation = 0;
            const startOpacity = anim.opacity_start !== undefined ? anim.opacity_start : (animType === 'fade' || animType === 'pop' || animType === 'slide_in' ? 0.0 : 1.0);
            const endOpacity = anim.opacity_end !== undefined ? anim.opacity_end : 1.0;
            currentOpacity = startOpacity + (endOpacity - startOpacity) * easeProgress;
            const startScale = anim.scale_start !== undefined ? anim.scale_start : (animType === 'pop' ? 0.5 : 1.0);
            const endScale = anim.scale_end !== undefined ? anim.scale_end : 1.0;
            currentScale = startScale + (endScale - startScale) * easeProgress;
            const startRotation = anim.rotation_start !== undefined ? anim.rotation_start : 0;
            const endRotation = anim.rotation_end !== undefined ? anim.rotation_end : 0;
            currentRotation = startRotation + (endRotation - startRotation) * easeProgress;
            const xOffsetPercent = anim.x_offset !== undefined ? anim.x_offset : (animType === 'slide_in' ? -10 : 0);
            const yOffsetPercent = anim.y_offset !== undefined ? anim.y_offset : 0;
            const startX = targetX + (xOffsetPercent / 100) * W;
            const startY = targetY + (yOffsetPercent / 100) * H;
            currentX = startX + (targetX - startX) * easeProgress;
            currentY = startY + (targetY - startY) * easeProgress;

            // Push coordinates for interaction hit test and selection outline
            drawnTextBoxesRef.current.push({
                id: `entity-${sceneEditIndex}-${entity.id}`,
                isSub: false,
                editIndex: sceneEditIndex,
                left: currentX - targetW / 2,
                top: currentY - targetH / 2,
                width: targetW,
                height: targetH,
                x: entity.x ?? 50,
                y: entity.y ?? 50,
                isEntity: true,
                entityId: entity.id,
                sceneEditIndex: sceneEditIndex
            });
            
            // Skip 2D canvas drawing in preview player, rendered via high-fidelity Magic UI HTML overlays
            return;
            ctx.save();
            ctx.globalAlpha = currentOpacity;
            if (currentScale !== 1.0) {
                ctx.translate(currentX, currentY);
                ctx.scale(currentScale, currentScale);
                ctx.translate(-currentX, -currentY);
            }
            if (currentRotation !== 0) {
                ctx.translate(currentX, currentY);
                ctx.rotate(currentRotation * Math.PI / 180);
                ctx.translate(-currentX, -currentY);
            }
            const styles = entity.styles || {};
            const itemBg = styles.bg_color || bgColor;
            const itemBorder = styles.border_color || borderColor;
            const itemGlow = styles.glow_color || glowColor;
            const itemFont = styles.font_family || baseFontFamily;
            
            if (entity.type === 'loading_bar' || entity.is_loading_bar) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.strokeStyle = itemBorder;
                ctx.lineWidth = 1.0;
                drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, targetH / 2);
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = styleProfile.color_accent || '#0A84FF';
                const activeW = targetW * easeProgress;
                drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, activeW, targetH, targetH / 2);
                ctx.fill();
                
                const textVal = entity.text || '';
                if (textVal) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold ' + Math.round(targetH * 0.5) + 'px "' + itemFont + '", sans-serif';
                    ctx.fillText(textVal + ' ' + Math.round(easeProgress * 100) + '%', currentX, currentY);
                }
            } else if (entity.type === 'navbar') {
                // Draw Glassmorphic Capsule Navbar
                ctx.shadowColor = itemGlow;
                ctx.shadowBlur = 24;
                ctx.shadowOffsetY = 4;
                ctx.fillStyle = itemBg;
                ctx.strokeStyle = itemBorder;
                ctx.lineWidth = 1.5;
                const r = targetH / 2;
                drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, r);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.stroke();

                // 1. Logo / Title (Left-aligned)
                const logoText = entity.text || 'Logo';
                const logoSize = Math.round(targetH * 0.38);
                ctx.fillStyle = styles.color || '#FFFFFF';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold ' + logoSize + 'px "' + itemFont + '", sans-serif';
                ctx.fillText(logoText, currentX - targetW / 2 + targetH * 0.6, currentY);

                // 2. Navigation items (Center-aligned)
                const navItems = entity.items || ["Home", "Features", "Pricing"];
                if (navItems.length > 0) {
                    const navSize = Math.round(targetH * 0.28);
                    ctx.font = '500 ' + navSize + 'px "' + itemFont + '", sans-serif';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                    ctx.textAlign = 'center';
                    const linkSpacing = targetW * 0.15;
                    const totalLinksW = (navItems.length - 1) * linkSpacing;
                    const startLinkX = currentX - totalLinksW / 2;
                    navItems.forEach((item: string, idx: number) => {
                        ctx.fillText(item, startLinkX + idx * linkSpacing, currentY);
                    });
                }

                // 3. Action Button (Right-aligned CTA)
                const actText = entity.action_text || 'Get Started';
                const actSize = Math.round(targetH * 0.28);
                const actBtnW = targetW * 0.18;
                const actBtnH = targetH * 0.64;
                const actBtnX = currentX + targetW / 2 - actBtnW - targetH * 0.4;
                const actBtnY = currentY - actBtnH / 2;
                ctx.fillStyle = styleProfile.color_accent || '#0A84FF';
                drawRoundedRect(ctx, actBtnX, actBtnY, actBtnW, actBtnH, actBtnH / 2);
                ctx.fill();
                
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold ' + actSize + 'px "' + itemFont + '", sans-serif';
                ctx.fillText(actText, actBtnX + actBtnW / 2, currentY);

            } else if (entity.type === 'input_field') {
                // Draw Figma-style Input field
                const labelText = (entity.label || 'INPUT FIELD').toUpperCase();
                const labelSize = Math.round(targetH * 0.22);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.font = 'bold ' + labelSize + 'px "' + itemFont + '", sans-serif';
                ctx.fillText(labelText, currentX - targetW / 2 + 4, currentY - targetH / 2 - 4);

                ctx.shadowColor = 'rgba(0,0,0,0.15)';
                ctx.shadowBlur = 12;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.strokeStyle = itemBorder;
                ctx.lineWidth = 1.5;
                drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, 8);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.stroke();

                let textOffset = targetH * 0.4;
                const iconId = entity.icon || entity.asset_id;
                if (iconId) {
                    ctx.font = Math.round(targetH * 0.45) + 'px "' + itemFont + '", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(getEmojiForIcon(iconId), currentX - targetW / 2 + targetH * 0.5, currentY);
                    textOffset = targetH * 1.0;
                }

                const textVal = entity.text || 'Enter text...';
                const textCol = entity.text ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
                ctx.fillStyle = textCol;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.font = 'normal ' + Math.round(targetH * 0.34) + 'px "' + itemFont + '", sans-serif';
                ctx.fillText(textVal, currentX - targetW / 2 + textOffset, currentY);

            } else if (entity.type === 'button') {
                const btnStyle = entity.style_variant || 'filled';
                ctx.shadowColor = 'rgba(0,0,0,0.1)';
                ctx.shadowBlur = 8;
                
                if (btnStyle === 'filled') {
                    ctx.fillStyle = styleProfile.color_accent || '#0A84FF';
                    ctx.strokeStyle = 'transparent';
                } else if (btnStyle === 'outline') {
                    ctx.fillStyle = 'rgba(255,255,255,0.02)';
                    ctx.strokeStyle = styleProfile.color_accent || '#0A84FF';
                } else {
                    ctx.fillStyle = itemBg;
                    ctx.strokeStyle = itemBorder;
                }
                ctx.lineWidth = 1.5;
                drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, targetH / 2);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                if (btnStyle !== 'filled') ctx.stroke();

                const textVal = entity.text || 'Button';
                const iconId = entity.icon || entity.asset_id;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold ' + Math.round(targetH * 0.38) + 'px "' + itemFont + '", sans-serif';
                ctx.fillStyle = btnStyle === 'outline' ? (styleProfile.color_accent || '#0A84FF') : '#FFFFFF';
                
                if (iconId) {
                    const iconEmoji = getEmojiForIcon(iconId);
                    ctx.fillText(iconEmoji + ' ' + textVal, currentX, currentY);
                } else {
                    ctx.fillText(textVal, currentX, currentY);
                }

            } else if (entity.type === 'tab_bar') {
                ctx.fillStyle = 'rgba(20, 20, 25, 0.45)';
                ctx.strokeStyle = itemBorder;
                ctx.lineWidth = 1.0;
                drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, targetH / 2);
                ctx.fill();
                ctx.stroke();

                const tabs = entity.items || ["Overview", "Settings"];
                const activeIndex = entity.active_index ?? 0;
                const tabW = targetW / tabs.length;
                const tabH = targetH - 6;

                const activeX = currentX - targetW / 2 + activeIndex * tabW + 3;
                const activeY = currentY - tabH / 2;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
                drawRoundedRect(ctx, activeX, activeY, tabW - 6, tabH, tabH / 2);
                ctx.fill();

                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                const tabSize = Math.round(targetH * 0.34);
                
                tabs.forEach((tabText: string, idx: number) => {
                    const labelX = currentX - targetW / 2 + idx * tabW + tabW / 2;
                    ctx.fillStyle = idx === activeIndex ? '#FFFFFF' : 'rgba(255,255,255,0.6)';
                    ctx.font = (idx === activeIndex ? 'bold ' : 'normal ') + tabSize + 'px "' + itemFont + '", sans-serif';
                    ctx.fillText(tabText, labelX, currentY);
                });

            } else if (entity.type === 'code_block') {
                // macOS Terminal window backdrop
                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 32;
                ctx.shadowOffsetY = 8;
                ctx.fillStyle = '#0F0F12'; // Sleek dark theme
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = 1.5;
                drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, 12);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.stroke();

                // Draw top bar header line separator
                const headerH = Math.min(32, targetH * 0.22);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(currentX - targetW / 2, currentY - targetH / 2 + headerH);
                ctx.lineTo(currentX + targetW / 2, currentY - targetH / 2 + headerH);
                ctx.stroke();

                // Draw window controls (macOS red/yellow/green dots)
                const dotRadius = Math.max(3, headerH * 0.16);
                const dotY = currentY - targetH / 2 + headerH / 2;
                const dotSpacing = dotRadius * 3;
                const startDotX = currentX - targetW / 2 + dotSpacing * 1.5;

                const colors = ['#FF5F56', '#FFBD2E', '#27C93F'];
                colors.forEach((col, idx) => {
                    ctx.beginPath();
                    ctx.arc(startDotX + idx * dotSpacing, dotY, dotRadius, 0, 2 * Math.PI);
                    ctx.fillStyle = col;
                    ctx.fill();
                });

                // Monospace window title label
                const labelText = entity.label || entity.title || 'terminal.sh';
                const labelSize = Math.max(8, Math.round(headerH * 0.45));
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${labelSize}px "JetBrains Mono", monospace`;
                ctx.fillText(labelText, currentX, dotY);

            } else if (entity.type !== 'headline') {
                ctx.shadowColor = itemGlow;
                ctx.shadowBlur = 28;
                ctx.shadowOffsetY = 4;
                ctx.fillStyle = itemBg;
                ctx.strokeStyle = itemBorder;
                ctx.lineWidth = 1.5;
                drawRoundedRect(ctx, currentX - targetW / 2, currentY - targetH / 2, targetW, targetH, 16);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.stroke();
            }
            
            if (entity.type !== 'loading_bar' && !entity.is_loading_bar && entity.type !== 'navbar' && entity.type !== 'input_field' && entity.type !== 'button' && entity.type !== 'tab_bar' && entity.type !== 'code_block' && entity.type !== 'metric_card' && entity.type !== 'circular_progress' && entity.type !== 'audio_waveform' && entity.type !== 'sparkline' && entity.type !== 'toggle_card' && entity.type !== 'profile_card' && entity.type !== 'comparison_table' && entity.type !== 'feature_grid' && entity.type !== 'progress_steps' && entity.type !== 'user_review' && entity.type !== 'bar_chart') {
                const textVal = entity.text || '';
                if (textVal) {
                    const textColor = styles.color || '#F5F7FA';
                    const isHeadline = entity.type === 'headline';
                    let baseFontSize = styles.font_size || (isHeadline ? Math.round(H * 0.028) : Math.round(H * 0.015));
                    
                    ctx.font = (styles.bold ? 'bold ' : '') + (styles.italic ? 'italic ' : '') + baseFontSize + 'px "' + itemFont + '", sans-serif';
                    
                    // Word wrapping logic
                    const maxW = targetW - 24; // 12px padding on each side
                    const words = textVal.split(' ');
                    let lines: string[] = [];
                    let currentLine = '';
                    
                    words.forEach((word: string) => {
                        const testLine = currentLine ? `${currentLine} ${word}` : word;
                        const metrics = ctx.measureText(testLine);
                        if (metrics.width > maxW && currentLine) {
                            lines.push(currentLine);
                            currentLine = word;
                        } else {
                            currentLine = testLine;
                        }
                    });
                    if (currentLine) {
                        lines.push(currentLine);
                    }
                    
                    // Scale down font size if height overflows
                    let finalFontSize = baseFontSize;
                    const maxAllowedHeight = targetH - 16;
                    while (lines.length * (finalFontSize * 1.35) > maxAllowedHeight && finalFontSize > 12) {
                        finalFontSize -= 2;
                        ctx.font = (styles.bold ? 'bold ' : '') + (styles.italic ? 'italic ' : '') + finalFontSize + 'px "' + itemFont + '", sans-serif';
                        
                        // Re-wrap with new font size
                        lines = [];
                        currentLine = '';
                        words.forEach((word: string) => {
                            const testLine = currentLine ? `${currentLine} ${word}` : word;
                            const metrics = ctx.measureText(testLine);
                            if (metrics.width > maxW && currentLine) {
                                lines.push(currentLine);
                                currentLine = word;
                            } else {
                                currentLine = testLine;
                            }
                        });
                        if (currentLine) {
                            lines.push(currentLine);
                        }
                    }
                    
                    ctx.fillStyle = textColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const totalTextHeight = lines.length * (finalFontSize * 1.35);
                    const startY = currentY - (totalTextHeight / 2) + (finalFontSize / 2);
                    
                    const isDarkText = textColor.startsWith('#1') || textColor.startsWith('#2') || textColor.startsWith('#3') || textColor === 'black';
                    
                    lines.forEach((lineText: string, lIdx: number) => {
                        const lineY = startY + lIdx * (finalFontSize * 1.35);
                        if (isHeadline) {
                            ctx.save();
                            ctx.strokeStyle = isDarkText ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
                            ctx.lineWidth = Math.max(2, finalFontSize * 0.06);
                            ctx.strokeText(lineText, currentX, lineY);
                            
                            ctx.shadowColor = isDarkText ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.7)';
                            ctx.shadowBlur = 8;
                            ctx.shadowOffsetY = 2;
                            ctx.shadowOffsetX = 1;
                            
                            ctx.fillText(lineText, currentX, lineY);
                            ctx.restore();
                        } else {
                            ctx.fillText(lineText, currentX, lineY);
                        }
                    });
                }
                const iconId = entity.asset_id || entity.icon;
                if (entity.type === 'icon' && iconId) {
                    ctx.fillStyle = styles.color || '#3B82F6';
                    ctx.font = Math.round(targetH * 0.5) + 'px "' + itemFont + '", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(getEmojiForIcon(iconId), currentX, currentY);
                }
            }

            // Draw customized text content for code_block
            if (entity.type === 'code_block') {
                const textVal = entity.text || '';
                if (textVal) {
                    const rawLines = textVal.split('\\n');
                    const headerH = Math.min(32, targetH * 0.22);
                    const clientAreaH = targetH - headerH;
                    
                    const lineCount = rawLines.length;
                    const maxLines = Math.max(1, lineCount);
                    const fontSize = Math.max(9, Math.min(18, Math.round(clientAreaH * 0.72 / maxLines)));
                    
                    ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    
                    const padX = Math.max(12, targetW * 0.06);
                    const startX = currentX - targetW / 2 + padX;
                    const startY = currentY - targetH / 2 + headerH + (clientAreaH / (maxLines + 1));
                    const stepY = clientAreaH / (maxLines + 1);

                    rawLines.forEach((lineText: string, lIdx: number) => {
                        const lineY = startY + lIdx * stepY;
                        if (lineText.trim().startsWith('//')) {
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                        } else {
                            ctx.fillStyle = '#F4F4F5';
                        }
                        ctx.fillText(lineText, startX, lineY);
                    });
                }
            }

            // Draw customized text content for metric_card
            if (entity.type === 'metric_card') {
                const valueText = entity.value || entity.number || entity.text || '$12,450';
                const subLabel = entity.label || entity.sublabel || entity.text_label || 'Metric';
                const trendVal = entity.trend || '';
                const accentColor = styleProfile.color_accent || '#0A84FF';
                
                const valFontSize = Math.round(targetH * 0.32);
                const subFontSize = Math.round(targetH * 0.15);
                
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${valFontSize}px "${itemFont}", sans-serif`;
                const valW = ctx.measureText(valueText).width;
                
                let trendW = 0;
                let trendBadgeH = 0;
                if (trendVal) {
                    trendBadgeH = Math.round(valFontSize * 0.45);
                    ctx.font = `bold ${Math.round(trendBadgeH * 0.7)}px "${itemFont}", sans-serif`;
                    trendW = ctx.measureText(trendVal).width + trendBadgeH * 1.2;
                }
                
                const gap = 16;
                const totalRowW = valW + (trendVal ? gap + trendW : 0);
                
                const rowStartX = currentX - totalRowW / 2;
                const rowY = currentY - targetH * 0.12;
                const subY = currentY + targetH * 0.24;
                
                // Draw value
                ctx.fillStyle = styles.color || accentColor;
                ctx.font = `bold ${valFontSize}px "${itemFont}", sans-serif`;
                ctx.textAlign = 'left';
                ctx.fillText(valueText, rowStartX, rowY);
                
                // Draw trend badge
                if (trendVal) {
                    const trendX = rowStartX + valW + gap;
                    const trendY = rowY - trendBadgeH * 0.08;
                    const isPositive = trendVal.startsWith('+') || !trendVal.startsWith('-');
                    const badgeBg = isPositive ? 'rgba(52, 199, 89, 0.15)' : 'rgba(255, 59, 48, 0.15)';
                    const badgeFg = isPositive ? '#34C759' : '#FF3B30';
                    
                    ctx.fillStyle = badgeBg;
                    drawRoundedRect(ctx, trendX, trendY - trendBadgeH / 2, trendW, trendBadgeH, trendBadgeH / 2);
                    ctx.fill();
                    
                    ctx.fillStyle = badgeFg;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = `bold ${Math.round(trendBadgeH * 0.65)}px "${itemFont}", sans-serif`;
                    ctx.fillText(trendVal, trendX + trendW / 2, trendY);
                }
                
                // Draw sublabel
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.font = `500 ${subFontSize}px "${itemFont}", sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(subLabel, currentX, subY);
            }

            // Draw customized content for circular_progress
            if (entity.type === 'circular_progress') {
                const accentColor = styleProfile.color_accent || '#0A84FF';
                
                const staticProgress = entity.progress !== undefined ? Number(entity.progress) : undefined;
                let currentProgress = 0;
                if (staticProgress !== undefined) {
                    currentProgress = easeProgress * (staticProgress as number);
                } else {
                    currentProgress = easeProgress * 100;
                }
                currentProgress = Math.max(0, Math.min(100, currentProgress));

                const subLabel = entity.text || entity.label || 'Progress';
                
                const radius = Math.min(targetW, targetH) * 0.28;
                const circleX = currentX;
                const circleY = currentY - targetH * 0.08;
                const subY = currentY + targetH * 0.32;
                
                // Draw track ring
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = Math.max(4, radius * 0.12);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(circleX, circleY, radius, 0, 2 * Math.PI);
                ctx.stroke();
                
                // Draw active progress arc
                ctx.strokeStyle = styles.color || accentColor;
                ctx.lineWidth = Math.max(4, radius * 0.12);
                ctx.beginPath();
                const startAngle = -Math.PI / 2;
                const endAngle = -Math.PI / 2 + (currentProgress / 100) * 2 * Math.PI;
                ctx.arc(circleX, circleY, radius, startAngle, endAngle);
                ctx.stroke();
                
                // Draw percentage text
                const textVal = Math.round(currentProgress) + '%';
                const pctFontSize = Math.round(radius * 0.45);
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${pctFontSize}px "${itemFont}", sans-serif`;
                ctx.fillText(textVal, circleX, circleY);
                
                // Draw sublabel text
                const subFontSize = Math.round(targetH * 0.14);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.font = `500 ${subFontSize}px "${itemFont}", sans-serif`;
                ctx.fillText(subLabel, currentX, subY);
            }

            // Draw customized content for audio_waveform
            if (entity.type === 'audio_waveform') {
                const accentColor = styleProfile.color_accent || '#0A84FF';
                const barCount = 12;
                const barW = Math.max(3, targetW * 0.035);
                const gap = (targetW - barCount * barW) / (barCount + 1);
                const startX = currentX - targetW / 2 + gap;
                
                ctx.fillStyle = styles.color || accentColor;
                for (let i = 0; i < barCount; i++) {
                    const waveVal = Math.abs(Math.sin(elapsed * 5 + i * 0.65));
                    const barH = targetH * 0.15 + targetH * 0.65 * waveVal;
                    const barX = startX + i * (barW + gap);
                    const barY = currentY - barH / 2;
                    
                    drawRoundedRect(ctx, barX, barY, barW, barH, barW / 2);
                    ctx.fill();
                }
            }

            // Draw customized content for sparkline
            if (entity.type === 'sparkline') {
                const accentColor = styleProfile.color_accent || '#0A84FF';
                let data = entity.data || [20, 45, 30, 80, 60, 95];
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        data = [20, 45, 30, 80, 60, 95];
                    }
                }
                if (!Array.isArray(data) || data.length < 2) {
                    data = [20, 45, 30, 80, 60, 95];
                }
                
                const startX = currentX - targetW / 2 + targetW * 0.08;
                const endX = currentX + targetW / 2 - targetW * 0.08;
                const chartW = endX - startX;
                const chartH = targetH * 0.5;
                const baseY = currentY + targetH * 0.22;
                
                const points = data.map((val: number, i: number) => {
                    const px = startX + (i / (data.length - 1)) * chartW;
                    const py = baseY - (val / 100) * chartH;
                    return { x: px, y: py };
                });
                
                const currentWidth = easeProgress * chartW;
                const limitX = startX + currentWidth;
                
                const activePoints: {x: number, y: number}[] = [];
                for (let i = 0; i < points.length; i++) {
                    const p = points[i];
                    if (p.x <= limitX) {
                        activePoints.push(p);
                    } else {
                        const prev = points[i - 1];
                        if (prev) {
                            const ratio = (limitX - prev.x) / (p.x - prev.x);
                            const interY = prev.y + (p.y - prev.y) * ratio;
                            activePoints.push({ x: limitX, y: interY });
                        }
                        break;
                    }
                }
                
                if (activePoints.length > 0) {
                    ctx.save();
                    ctx.strokeStyle = styles.color || accentColor;
                    ctx.lineWidth = Math.max(3, targetH * 0.05);
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    
                    ctx.shadowColor = accentColor;
                    ctx.shadowBlur = 15;
                    
                    ctx.beginPath();
                    ctx.moveTo(activePoints[0].x, activePoints[0].y);
                    for (let i = 1; i < activePoints.length; i++) {
                        ctx.lineTo(activePoints[i].x, activePoints[i].y);
                    }
                    ctx.stroke();
                    ctx.restore();
                    
                    const tip = activePoints[activePoints.length - 1];
                    ctx.save();
                    ctx.fillStyle = '#FFFFFF';
                    ctx.shadowColor = accentColor;
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(tip.x, tip.y, Math.max(5, targetH * 0.06), 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.restore();
                }
                
                const subLabel = entity.text || entity.label || '';
                if (subLabel) {
                    const subFontSize = Math.round(targetH * 0.12);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.font = `500 ${subFontSize}px "${itemFont}", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(subLabel, currentX, currentY - targetH * 0.3);
                }
            }

            // Draw customized content for toggle_card
            if (entity.type === 'toggle_card') {
                const accentColor = styleProfile.color_accent || '#0A84FF';
                
                const labelText = entity.text || entity.label || 'Enable Setting';
                const fontSize = Math.round(targetH * 0.22);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = `bold ${fontSize}px "${itemFont}", sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, currentX - targetW / 2 + targetW * 0.08, currentY);
                
                const tw = targetH * 0.62 * 1.7;
                const th = targetH * 0.62;
                const trx = currentX + targetW / 2 - targetW * 0.08 - tw;
                const try_ = currentY - th / 2;
                
                const r = Math.round(57 + (52 - 57) * easeProgress);
                const g = Math.round(57 + (199 - 57) * easeProgress);
                const b = Math.round(60 + (89 - 60) * easeProgress);
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                
                drawRoundedRect(ctx, trx, try_, tw, th, th / 2);
                ctx.fill();
                
                const radius = th * 0.42;
                const startThumbX = trx + th / 2;
                const endThumbX = trx + tw - th / 2;
                const thumbX = startThumbX + (endThumbX - startThumbX) * easeProgress;
                
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetY = 1;
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(thumbX, currentY, radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
            }

            // Draw customized content for profile_card
            if (entity.type === 'profile_card') {
                const d = targetH * 0.46;
                const ax = currentX - targetW / 2 + targetW * 0.08 + d / 2;
                const ay = currentY - targetH * 0.16;
                
                ctx.save();
                const grad = ctx.createLinearGradient(ax - d / 2, ay - d / 2, ax + d / 2, ay + d / 2);
                grad.addColorStop(0, '#FF5E3A');
                grad.addColorStop(1, '#FF2A68');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(ax, ay, d / 2, 0, 2 * Math.PI);
                ctx.fill();
                
                const initials = entity.initials || entity.label?.substring(0, 2).toUpperCase() || 'AI';
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${Math.round(d * 0.42)}px "${itemFont}", sans-serif`;
                ctx.fillText(initials, ax, ay);
                ctx.restore();
                
                const nameText = entity.name || entity.username || '@user_account';
                const nameSize = Math.round(targetH * 0.16);
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${nameSize}px "${itemFont}", sans-serif`;
                const nx = currentX - targetW / 2 + targetW * 0.08 + d + 12;
                ctx.fillText(nameText, nx, ay);
                
                const nameW = ctx.measureText(nameText).width;
                const bx = nx + nameW + 16;
                const by = ay;
                const br = targetH * 0.075;
                
                ctx.fillStyle = '#0A84FF';
                ctx.beginPath();
                ctx.arc(bx, by, br, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = Math.max(1.5, br * 0.25);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(bx - br * 0.4, by + br * 0.1);
                ctx.lineTo(bx - br * 0.1, by + br * 0.4);
                ctx.lineTo(bx + br * 0.4, by - br * 0.3);
                ctx.stroke();
                
                const bodyText = entity.text || 'This tool changed how I edit videos!';
                const bodySize = Math.round(targetH * 0.125);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.font = `italic 500 ${bodySize}px "${itemFont}", sans-serif`;
                
                const bxText = currentX - targetW / 2 + targetW * 0.08;
                const byText = currentY + targetH * 0.16;
                const maxTextW = targetW * 0.84;
                
                const words = bodyText.split(' ');
                let line = '';
                let currentYOffset = 0;
                const lineHeight = bodySize * 1.35;
                
                words.forEach((word: string) => {
                    const testLine = line + word + ' ';
                    const testW = ctx.measureText(testLine).width;
                    if (testW > maxTextW && line !== '') {
                        ctx.fillText(line, bxText, byText + currentYOffset);
                        line = word + ' ';
                        currentYOffset += lineHeight;
                    } else {
                        line = testLine;
                    }
                });
                if (line) {
                    ctx.fillText(line, bxText, byText + currentYOffset);
                }
            }

            // Draw customized content for comparison_table
            if (entity.type === 'comparison_table') {
                const leftTitle = entity.left_title || "Before";
                const rightTitle = entity.right_title || "After";
                const leftItems = entity.left_items || ["Manual cuts", "No graphics"];
                const rightItems = entity.right_items || ["Smart trim", "Interactive graphics"];
                
                const titleSize = Math.round(targetH * 0.16);
                const itemSize = Math.round(targetH * 0.12);
                
                ctx.strokeStyle = itemBorder;
                ctx.lineWidth = 2.0;
                ctx.beginPath();
                ctx.moveTo(currentX, currentY - targetH * 0.42);
                ctx.lineTo(currentX, currentY + targetH * 0.42);
                ctx.stroke();
                
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${titleSize}px "${itemFont}", sans-serif`;
                ctx.fillStyle = '#FF3B30';
                ctx.fillText(leftTitle, currentX - targetW / 4, currentY - targetH * 0.28);
                
                ctx.fillStyle = '#34C759';
                ctx.fillText(rightTitle, currentX + targetW / 4, currentY - targetH * 0.28);
                
                ctx.font = `normal ${itemSize}px "${itemFont}", sans-serif`;
                const startY = currentY - targetH * 0.08;
                const stepY = targetH * 0.15;
                
                ctx.textAlign = 'left';
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                leftItems.slice(0, 4).forEach((item: string, idx: number) => {
                    ctx.fillText("❌  " + item, currentX - targetW * 0.42, startY + idx * stepY);
                });
                
                ctx.fillStyle = '#FFFFFF';
                rightItems.slice(0, 4).forEach((item: string, idx: number) => {
                    ctx.fillText("✅  " + item, currentX + targetW * 0.08, startY + idx * stepY);
                });
            }

            // Draw customized content for feature_grid
            if (entity.type === 'feature_grid') {
                const features = entity.features || [
                    {icon: "⚡", title: "Speed", desc: "10x render"},
                    {icon: "🎨", title: "Design", desc: "Premium styles"},
                    {icon: "🧠", title: "AI Cut", desc: "Auto trim silence"},
                    {icon: "🔊", title: "Audio", desc: "Smart recommendation"}
                ];
                
                const colW = (targetW - 24) / 2;
                const rowH = (targetH - 24) / 2;
                const titleSize = Math.round(targetH * 0.12);
                const descSize = Math.round(targetH * 0.08);
                
                ctx.lineWidth = 1.0;
                ctx.strokeStyle = itemBorder;
                
                features.slice(0, 4).forEach((f: any, idx: number) => {
                    const col = idx % 2;
                    const row = Math.floor(idx / 2);
                    const bx = currentX - targetW / 2 + col * (colW + 24);
                    const by = currentY - targetH / 2 + row * (rowH + 24);
                    
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                    drawRoundedRect(ctx, bx, by, colW, rowH, 10);
                    ctx.fill();
                    ctx.stroke();
                    
                    ctx.font = `${Math.round(rowH * 0.28)}px "${itemFont}", sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(f.icon || "🌟", bx + 12, by + 10);
                    
                    ctx.font = `bold ${titleSize}px "${itemFont}", sans-serif`;
                    ctx.fillText(f.title || "Feature", bx + 12, by + 10 + Math.round(rowH * 0.28));
                    
                    ctx.font = `normal ${descSize}px "${itemFont}", sans-serif`;
                    ctx.fillStyle = 'rgba(255,255,255,0.6)';
                    ctx.fillText(f.desc || "Description", bx + 12, by + 10 + Math.round(rowH * 0.28) + titleSize + 6);
                });
            }

            // Draw customized content for progress_steps
            if (entity.type === 'progress_steps') {
                const steps = entity.steps || ["Upload", "Analyze", "Export"];
                const colorAccent = styleProfile.color_accent || '#0A84FF';
                
                const stepCount = steps.length;
                const stepW = targetW / stepCount;
                const circleR = Math.min(targetH * 0.25, stepW * 0.2);
                const lineY = currentY - targetH * 0.1;
                
                ctx.strokeStyle = itemBorder;
                ctx.lineWidth = 4.0;
                ctx.beginPath();
                ctx.moveTo(currentX - targetW / 2 + stepW / 2, lineY);
                ctx.lineTo(currentX + targetW / 2 - stepW / 2, lineY);
                ctx.stroke();
                
                ctx.strokeStyle = colorAccent;
                ctx.beginPath();
                ctx.moveTo(currentX - targetW / 2 + stepW / 2, lineY);
                ctx.lineTo(currentX - targetW / 2 + stepW / 2 + (easeProgress * (targetW - stepW)), lineY);
                ctx.stroke();
                
                steps.forEach((stepName: string, idx: number) => {
                    const cx = currentX - targetW / 2 + idx * stepW + stepW / 2;
                    const cy = lineY;
                    const stepActive = easeProgress >= (idx / (stepCount - 1 || 1));
                    
                    ctx.fillStyle = stepActive ? colorAccent : '#1C1C1E';
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 2.0;
                    ctx.beginPath();
                    ctx.arc(cx, cy, circleR, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();
                    
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = `bold ${Math.round(circleR * 1.1)}px "${itemFont}", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(idx + 1), cx, cy);
                    
                    ctx.font = `bold ${Math.round(targetH * 0.12)}px "${itemFont}", sans-serif`;
                    ctx.fillStyle = stepActive ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
                    ctx.fillText(stepName, cx, cy + circleR + 14);
                });
            }

            // Draw customized content for user_review
            if (entity.type === 'user_review') {
                const name = entity.name || "Alexander";
                const username = entity.username || "@alex_v";
                const reviewText = entity.text || "Great tool! Saves so much time.";
                const rating = Number(entity.rating || 5);
                
                const avatarD = targetH * 0.32;
                const ax = currentX - targetW / 2 + targetW * 0.08 + avatarD / 2;
                const ay = currentY - targetH * 0.28;
                
                ctx.fillStyle = styleProfile.color_accent || '#0A84FF';
                ctx.beginPath();
                ctx.arc(ax, ay, avatarD / 2, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${Math.round(avatarD * 0.45)}px "${itemFont}", sans-serif`;
                ctx.fillText(name.substring(0, 2).toUpperCase(), ax, ay);
                
                const nameSize = Math.round(targetH * 0.12);
                ctx.font = `bold ${nameSize}px "${itemFont}", sans-serif`;
                ctx.textAlign = 'left';
                const nx = currentX - targetW / 2 + targetW * 0.08 + avatarD + 12;
                ctx.fillText(name, nx, ay - nameSize / 2 - 2);
                
                ctx.font = `normal ${Math.round(targetH * 0.09)}px "${itemFont}", sans-serif`;
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fillText(username, nx, ay + nameSize / 2 + 2);
                
                ctx.textAlign = 'right';
                ctx.font = `${Math.round(targetH * 0.12)}px "${itemFont}", sans-serif`;
                ctx.fillText("⭐".repeat(rating), currentX + targetW / 2 - targetW * 0.08, ay);
                
                const bodySize = Math.round(targetH * 0.11);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.font = `normal 500 ${bodySize}px "${itemFont}", sans-serif`;
                
                const bxText = currentX - targetW / 2 + targetW * 0.08;
                const byText = currentY + targetH * 0.02;
                const maxTextW = targetW * 0.84;
                
                const words = reviewText.split(' ');
                let line = '';
                let currentYOffset = 0;
                const lineHeight = bodySize * 1.35;
                
                words.forEach((word: string) => {
                    const testLine = line + word + ' ';
                    const testW = ctx.measureText(testLine).width;
                    if (testW > maxTextW && line !== '') {
                        ctx.fillText(line, bxText, byText + currentYOffset);
                        line = word + ' ';
                        currentYOffset += lineHeight;
                    } else {
                        line = testLine;
                    }
                });
                if (line) {
                    ctx.fillText(line, bxText, byText + currentYOffset);
                }
            }

            // Draw customized content for bar_chart
            if (entity.type === 'bar_chart') {
                const bars = entity.bars || [
                    {label: "Direct", value: 75},
                    {label: "Social", value: 50},
                    {label: "Organic", value: 90}
                ];
                const colorAccent = styleProfile.color_accent || '#0A84FF';
                
                const barCount = Math.min(3, bars.length);
                const startY = currentY - targetH * 0.34;
                const stepY = targetH * 0.26;
                const labelSize = Math.round(targetH * 0.1);
                const valSize = Math.round(targetH * 0.09);
                const maxBarW = targetW * 0.54;
                
                bars.slice(0, barCount).forEach((bar: any, idx: number) => {
                    const by = startY + idx * stepY;
                    const val = Number(bar.value || 50);
                    
                    ctx.fillStyle = '#FFFFFF';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.font = `bold ${labelSize}px "${itemFont}", sans-serif`;
                    ctx.fillText(bar.label || "Bar", currentX - targetW / 2 + targetW * 0.08, by);
                    
                    const bx = currentX - targetW / 2 + targetW * 0.32;
                    const bH = Math.round(targetH * 0.08);
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    drawRoundedRect(ctx, bx, by - bH / 2, maxBarW, bH, bH / 2);
                    ctx.fill();
                    
                    ctx.fillStyle = colorAccent;
                    const actW = maxBarW * (val / 100) * easeProgress;
                    drawRoundedRect(ctx, bx, by - bH / 2, actW, bH, bH / 2);
                    ctx.fill();
                    
                    ctx.fillStyle = 'rgba(255,255,255,0.78)';
                    ctx.font = `bold ${valSize}px "${itemFont}", sans-serif`;
                    ctx.fillText(Math.round(val * easeProgress) + '%', bx + maxBarW + 10, by);
                });
            }

            // Draw common capsule status badge on any entity
            if (entity.badge) {
                const badgeText = String(entity.badge).toUpperCase();
                const badgeSize = Math.max(8, Math.round(targetH * 0.14));
                ctx.font = `bold ${badgeSize}px "${itemFont}", sans-serif`;
                const textW = ctx.measureText(badgeText).width;
                const badgeH = badgeSize * 1.6;
                const badgeW = textW + badgeSize * 1.5;
                
                const badgeX = currentX + targetW / 2 - badgeW / 2;
                const badgeY = currentY - targetH / 2 - badgeH / 2;
                const badgeBg = entity.badge_color || styleProfile.color_accent || '#5856D6';
                
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 2;
                
                ctx.fillStyle = badgeBg;
                drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
                ctx.fill();
                ctx.restore();
                
                ctx.save();
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${badgeSize}px "${itemFont}", sans-serif`;
                ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
                ctx.restore();
            }

            ctx.restore();
        });
        relations.forEach((rel: any) => {
            const fromEnt = entities.find((e: any) => e.id === rel.from);
            const toEnt = entities.find((e: any) => e.id === rel.to);
            if (!fromEnt || !toEnt) return;
            const fromX = ( (fromEnt.x ?? 50) / 100 ) * W;
            const fromY = ( (fromEnt.y ?? 50) / 100 ) * H;
            const toX = ( (toEnt.x ?? 50) / 100 ) * W;
            const toY = ( (toEnt.y ?? 50) / 100 ) * H;
            ctx.save();
            ctx.strokeStyle = styleProfile.arrow_color || styleProfile.border_color || 'rgba(59, 130, 246, 0.6)';
            ctx.lineWidth = styleProfile.arrow_width || 3.0;
            const anim = styleProfile.relation_animation || {};
            const rDelay = anim.delay || 0.4;
            const rDur = anim.duration || 0.8;
            const rProgress = Math.min(1, Math.max(0, (elapsed - rDelay) / rDur));
            const rEase = rProgress * rProgress * (3 - 2 * rProgress);
            if (rProgress > 0) {
                const currentEndX = fromX + (toX - fromX) * rEase;
                const currentEndY = fromY + (toY - fromY) * rEase;
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(currentEndX, currentEndY);
                ctx.stroke();
                if (rProgress >= 0.95) {
                    drawArrowhead(ctx, fromX, fromY, toX, toY, 12);
                }
            }
            ctx.restore();
        });
    }, []);

    // ── Draw current video frame + overlays to canvas ─────────────
    const drawFrame = useCallback(() => {
        drawnTextBoxesRef.current = [];
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video || video.readyState < 2) return;

        // Use the ThreeCompositor only when it is fully initialized (threeReady guards the async gap)
        // Behind-speaker layers require 2D canvas — Three path never draws them
        const isThreeActive = threeReady && !!threeCompositorRef.current && !behindModeActive;
        const overlayCanvas = overlayCanvasRef.current;
        const ctx = isThreeActive && overlayCanvas
            ? overlayCanvas.getContext('2d')
            : canvas.getContext('2d');
            
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
            // Also resize the dedicated WebGL canvas to keep them in sync
            if (webglCanvasRef.current && (webglCanvasRef.current.width !== canvasW || webglCanvasRef.current.height !== canvasH)) {
                webglCanvasRef.current.width = canvasW;
                webglCanvasRef.current.height = canvasH;
            }
            if (threeCompositorRef.current) {
                threeCompositorRef.current.resize(canvasW, canvasH);
            }
        }

        if (overlayCanvas && (overlayCanvas.width !== canvasW || overlayCanvas.height !== canvasH)) {
            overlayCanvas.width = canvasW;
            overlayCanvas.height = canvasH;
        }

        const W = canvas.width;
        const H = canvas.height;
        const t = video.currentTime;
        const scale = getZoomScale(editsRef.current, t);

        ctx.save();
        ctx.clearRect(0, 0, W, H);

        let finalB = 1.0;
        let finalC = 1.0;
        let finalS = 1.0;
        let finalH = 0.0;
        let vignette = 0.0;
        let filmGrain = 0.0;

        const activeColor = editsRef.current.find(e => 
            e.action === 'color_correction' && e.start != null && e.end != null && t >= e.start && t < e.end
        );

        if (!isThreeActive) {
            if (scale !== 1) {
                ctx.translate(W / 2, H / 2);
                ctx.scale(scale, scale);
                ctx.translate(-W / 2, -H / 2);
            }

            // Apply color correction filter if active
            if (activeColor) {
                const presetKey = activeColor.preset || activeColor.lut || 'cinema';
                if (presetKey.endsWith('.cube') || presetKey.includes('luts/')) {
                    // Highly stylized professional film grade preview
                    ctx.filter = `contrast(1.15) saturate(1.2) brightness(1.05) sepia(0.08) hue-rotate(-4deg)`;
                } else {
                    const base = LUT_PRESETS[presetKey] || { brightness: 1.0, contrast: 1.0, saturation: 1.0, hue: 0 };
                    const userB = activeColor.brightness !== undefined ? activeColor.brightness : 100;
                    const userC = activeColor.contrast !== undefined ? activeColor.contrast : 100;
                    const userS = activeColor.saturation !== undefined ? activeColor.saturation : 100;
                    const userH = activeColor.hue !== undefined ? activeColor.hue : 0;

                    const fb = base.brightness * (userB / 100);
                    const fc = base.contrast * (userC / 100);
                    const fs = base.saturation * (userS / 100);
                    const fh = base.hue + userH;

                    ctx.filter = `brightness(${fb}) contrast(${fc}) saturate(${fs}) hue-rotate(${fh}deg)`;
                }
            } else {
                ctx.filter = 'none';
            }

            // Draw cropped and centered video
            let sWidth = VW;
            let sHeight = VH;
            let sx = 0;
            let sy = 0;

            if (videoRatio > targetRatio) {
                sWidth = VH * targetRatio;
                sx = (VW - sWidth) / 2;
            } else if (videoRatio < targetRatio) {
                sHeight = VW / targetRatio;
                sy = (VH - sHeight) / 2;
            }

            const hasActiveOverlay = editsRef.current.some(e =>
                (e.action === 'semantic_scene' || e.action === 'add_motion_graphic' || e.action === 'add_broll') &&
                e.start != null && e.end != null && t >= e.start && t < e.end
            );

            const setBgEdit = editsRef.current.find(e => e.action === 'set_video_background' || e.action === 'remove_background');
            const subEdit = editsRef.current.find(e => e.action === 'add_subtitles');
            const isSubBehind = !!(subEdit?.behind_speaker || subEdit?.position === 'behind_speaker' || (subtitleConfig as any)?.behind_speaker || (subtitleConfig as any)?.position === 'behind_speaker');
            const wantsBehindLayers = !!(setBgEdit || isSubBehind);
            const maskVid = rvmMaskVideoRef.current;
            const hasMaskCutout = !!(rvmMaskSrc && rvmMaskReady && maskVid && maskVid.readyState >= 2);
            const hasRealRvmPreview = !!(videoSrc && String(videoSrc).includes('_rvm_preview'));

            // Layered behind-speaker mode: bg → editable text → speaker cutout on top
            if (wantsBehindLayers && !hasRealRvmPreview) {
                // Reset any color-grade / overlay filters — they were darkening the whole stack
                ctx.filter = 'none';
                ctx.globalAlpha = 1;

                const bgColor = setBgEdit?.bg_color && setBgEdit.bg_color !== 'transparent'
                    ? setBgEdit.bg_color
                    : '#0a0a14';
                const text = setBgEdit?.text;
                const textColor = setBgEdit?.text_color || '#FFFFFF';
                const textOpacity = setBgEdit?.text_opacity !== undefined ? setBgEdit.text_opacity : 0.22;
                const fontSize = setBgEdit?.font_size || 220;
                const grad2 = setBgEdit?.gradient_color2;
                const bgTextX = setBgEdit?.x != null ? Number(setBgEdit.x) : 50;
                const bgTextY = setBgEdit?.y != null ? Number(setBgEdit.y) : 40;

                const drawBehindTextLayers = () => {
                    if (text) {
                        ctx.save();
                        ctx.globalAlpha = Math.max(0.35, textOpacity);
                        ctx.fillStyle = textColor;
                        const fontPx = Math.round(fontSize * (W / 1080));
                        ctx.font = `900 ${fontPx}px "Montserrat", "Bebas Neue", "Inter", sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        const tx = (bgTextX / 100) * W;
                        const ty = (bgTextY / 100) * H;
                        const label = String(text).toUpperCase();
                        ctx.fillText(label, tx, ty);
                        const metrics = ctx.measureText(label);
                        const boxW = Math.max(40, metrics.width);
                        const boxH = fontPx * 1.2;
                        const bgEditIndex = editsRef.current.indexOf(setBgEdit!);
                        drawnTextBoxesRef.current.push({
                            id: 'bg-text',
                            isSub: false,
                            isBgText: true,
                            editIndex: bgEditIndex !== -1 ? bgEditIndex : undefined,
                            left: tx - boxW / 2,
                            top: ty - boxH / 2,
                            width: boxW,
                            height: boxH,
                            x: bgTextX,
                            y: bgTextY,
                        });
                        ctx.restore();
                    }
                    if (isSubBehind && transcript?.words && transcript.words.length > 0) {
                        ctx.save();
                        drawAestheticCaptions(ctx, t, W, H);
                        ctx.restore();
                    }
                    // Custom titles marked behind_speaker (not transcript subs)
                    const behindOverlays = editsRef.current.filter(e =>
                        e.action === 'add_text_overlay' &&
                        !e.is_subtitle &&
                        (e.behind_speaker || e.position === 'behind_speaker') &&
                        e.start != null && e.end != null && t >= e.start! && t < e.end!
                    );
                    for (const ov of behindOverlays) {
                        drawStyledTextOverlay(ctx, ov, t, W, H, false);
                    }
                };

                if (hasMaskCutout && maskVid) {
                    // CapCut-style stack: original scene → text → speaker cutout
                    // (solid black plate looked like a void — keep the real room)
                    const replacePlate = !!(
                        setBgEdit?.action === 'set_video_background' &&
                        setBgEdit?.bg_color &&
                        setBgEdit.bg_color !== 'transparent' &&
                        setBgEdit?.replace_background === true
                    );

                    ctx.save();
                    ctx.filter = 'none';
                    ctx.globalAlpha = 1;
                    if (replacePlate) {
                        if (grad2) {
                            const grad = ctx.createLinearGradient(0, 0, 0, H);
                            grad.addColorStop(0, bgColor);
                            grad.addColorStop(1, grad2);
                            ctx.fillStyle = grad;
                        } else {
                            ctx.fillStyle = bgColor;
                        }
                        ctx.fillRect(0, 0, W, H);
                    } else {
                        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, W, H);
                    }
                    ctx.restore();

                    drawBehindTextLayers();

                    if (!cutoutCanvasRef.current) {
                        cutoutCanvasRef.current = document.createElement('canvas');
                    }
                    if (!maskAlphaCanvasRef.current) {
                        maskAlphaCanvasRef.current = document.createElement('canvas');
                    }
                    const tc = cutoutCanvasRef.current;
                    const mc = maskAlphaCanvasRef.current;
                    if (tc.width !== W || tc.height !== H) {
                        tc.width = W;
                        tc.height = H;
                    }
                    const tctx = tc.getContext('2d', { willReadFrequently: false });
                    const mctx = mc.getContext('2d', { willReadFrequently: true });
                    if (tctx && mctx) {
                        const coverCrop = (vw: number, vh: number) => {
                            const ratio = vw / vh;
                            let csW = vw, csH = vh, csx = 0, csy = 0;
                            if (ratio > targetRatio) {
                                csW = vh * targetRatio;
                                csx = (vw - csW) / 2;
                            } else if (ratio < targetRatio) {
                                csH = vw / targetRatio;
                                csy = (vh - csH) / 2;
                            }
                            return { csx, csy, csW, csH };
                        };
                        const mw = maskVid.videoWidth || 270;
                        const mh = maskVid.videoHeight || 480;
                        const m = coverCrop(mw, mh);
                        const matteW = Math.max(1, Math.round(m.csW));
                        const matteH = Math.max(1, Math.round(m.csH));

                        if (mc.width !== matteW || mc.height !== matteH) {
                            mc.width = matteW;
                            mc.height = matteH;
                        }
                        mctx.clearRect(0, 0, matteW, matteH);
                        mctx.globalCompositeOperation = 'source-over';
                        mctx.drawImage(maskVid, m.csx, m.csy, m.csW, m.csH, 0, 0, matteW, matteH);
                        try {
                            const img = mctx.getImageData(0, 0, matteW, matteH);
                            const d = img.data;
                            for (let i = 0; i < d.length; i += 4) {
                                const luma = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
                                d[i] = 255;
                                d[i + 1] = 255;
                                d[i + 2] = 255;
                                d[i + 3] = luma;
                            }
                            mctx.putImageData(img, 0, 0);
                        } catch (err) {
                            console.warn('[SandboxPlayer] mask luma→alpha failed', err);
                        }

                        tctx.clearRect(0, 0, W, H);
                        tctx.filter = 'none';
                        tctx.globalAlpha = 1;
                        tctx.globalCompositeOperation = 'source-over';
                        tctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, W, H);
                        tctx.globalCompositeOperation = 'destination-in';
                        tctx.drawImage(mc, 0, 0, matteW, matteH, 0, 0, W, H);
                        tctx.globalCompositeOperation = 'source-over';
                        ctx.save();
                        ctx.filter = 'none';
                        ctx.globalAlpha = 1;
                        ctx.drawImage(tc, 0, 0);
                        ctx.restore();
                    }
                } else {
                    // RVM still running: keep preview bright. Do NOT draw behind-text on top —
                    // that looked like "text in front of speaker". Wait for matte.
                    ctx.save();
                    ctx.filter = 'none';
                    ctx.globalAlpha = 1;
                    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, W, H);
                    ctx.restore();
                }
            } else {
                // Normal / baked RVM preview path
                ctx.save();
                if (hasActiveOverlay) {
                    ctx.filter = 'blur(10px) brightness(0.35)';
                }
                ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, W, H);
                ctx.restore();
            }

        } else {
            // Three.js (WebGL) handles the color correction on GPU
            if (activeColor) {
                const presetKey = activeColor.preset || activeColor.lut || 'cinema';
                if (presetKey.endsWith('.cube') || presetKey.includes('luts/')) {
                    finalB = 1.05;
                    finalC = 1.15;
                    finalS = 1.2;
                    finalH = -4;
                    vignette = 0.45;
                    filmGrain = 0.02;
                } else {
                    const base = LUT_PRESETS[presetKey] || { brightness: 1.0, contrast: 1.0, saturation: 1.0, hue: 0 };
                    const userB = activeColor.brightness !== undefined ? activeColor.brightness : 100;
                    const userC = activeColor.contrast !== undefined ? activeColor.contrast : 100;
                    const userS = activeColor.saturation !== undefined ? activeColor.saturation : 100;
                    const userH = activeColor.hue !== undefined ? activeColor.hue : 0;

                    finalB = base.brightness * (userB / 100);
                    finalC = base.contrast * (userC / 100);
                    finalS = base.saturation * (userS / 100);
                    finalH = base.hue + userH;

                    if (['cinema', 'cyberpunk', 'teal_orange'].includes(presetKey)) {
                        vignette = 0.5;
                        filmGrain = 0.015;
                    }
                }
            }
        }
        ctx.restore();

        // ── Aesthetic Captions (word-by-word, from transcript) ──────
        // Only render foreground captions if NOT placed behind speaker
        const hasSubtitleEdit = editsRef.current.some(e => e.action === 'add_subtitles');
        const subEditCheck = editsRef.current.find(e => e.action === 'add_subtitles');
        const isSubBehindCheck = !!(subEditCheck?.behind_speaker || subEditCheck?.position === 'behind_speaker' || (subtitleConfig as any)?.behind_speaker || (subtitleConfig as any)?.position === 'behind_speaker');

        if (transcript?.words && transcript.words.length > 0 && hasSubtitleEdit && !isSubBehindCheck) {
            drawAestheticCaptions(ctx, t, W, H);
        }


        // ── Draw text overlays (add_text_overlay) ──────
        // If hasSubtitleEdit is true, we ONLY draw custom overlays (not subtitles)
        // Skip overlays that belong in the behind-speaker stack
        const activeTexts = textOverlays.filter(
            e => (!hasSubtitleEdit || !e.is_subtitle)
                && !(e.behind_speaker || e.position === 'behind_speaker')
                && e.start != null && e.end != null && t >= (e.start as number) && t < (e.end as number)
        );
        for (const ov of activeTexts) {
            drawStyledTextOverlay(ctx, ov, t, W, H, false);
        }

        // ── Direct Semantic Scene Canvas Drawing ──────
        const activeSemanticScenes = editsRef.current.filter(
            e => e.action === 'semantic_scene' && e.scene_data && e.start != null && e.end != null && t >= (e.start as number) && t < (e.end as number)
        );
        for (const se of activeSemanticScenes) {
            const seIndex = editsRef.current.indexOf(se);
            drawSemanticSceneDirect(ctx, se.scene_data, se.start!, se.end!, t, W, H, seIndex);
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
                
                // 4. Circular handles (4 corners + 4 edge centers)
                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#3B82F6';
                ctx.lineWidth = 2;
                const hs = 10;
                const xMin = focusedBox.left - pad;
                const xMax = focusedBox.left + focusedBox.width + pad;
                const yMin = focusedBox.top - pad;
                const yMax = focusedBox.top + focusedBox.height + pad;
                const xMid = (xMin + xMax) / 2;
                const yMid = (yMin + yMax) / 2;

                const handles = [
                    { x: xMin, y: yMin }, // TL
                    { x: xMax, y: yMin }, // TR
                    { x: xMin, y: yMax }, // BL
                    { x: xMax, y: yMax }, // BR
                    { x: xMid, y: yMin }, // T
                    { x: xMid, y: yMax }, // B
                    { x: xMin, y: yMid }, // L
                    { x: xMax, y: yMid }  // R
                ];
                handles.forEach(h => {
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, hs / 2, 0, 2 * Math.PI);
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

        // Draw selection box around selected entity if active
        if (selectedEntity && drawnTextBoxesRef.current.length > 0) {
            const entityBox = drawnTextBoxesRef.current.find(box => 
                box.isEntity && box.sceneEditIndex === selectedEntity.sceneEditIndex && box.entityId === selectedEntity.entityId
            );
            if (entityBox) {
                ctx.save();
                const pad = 12;

                // 1. Soft glowing backdrop
                ctx.fillStyle = 'rgba(59, 130, 246, 0.04)';
                drawRoundedRect(
                    ctx,
                    entityBox.left - pad,
                    entityBox.top - pad,
                    entityBox.width + pad * 2,
                    entityBox.height + pad * 2,
                    8
                );
                ctx.fill();

                // 2. High-contrast dashed border
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
                ctx.lineWidth = 2.0;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(
                    entityBox.left - pad,
                    entityBox.top - pad,
                    entityBox.width + pad * 2,
                    entityBox.height + pad * 2
                );

                // 3. Thin solid border
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
                ctx.lineWidth = 1;
                ctx.setLineDash([]);
                ctx.strokeRect(
                    entityBox.left - pad,
                    entityBox.top - pad,
                    entityBox.width + pad * 2,
                    entityBox.height + pad * 2
                );
                
                // 4. Circular handles (4 corners + 4 edge centers)
                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#3B82F6';
                ctx.lineWidth = 2;
                const hs = 10;
                const xMin = entityBox.left - pad;
                const xMax = entityBox.left + entityBox.width + pad;
                const yMin = entityBox.top - pad;
                const yMax = entityBox.top + entityBox.height + pad;
                const xMid = (xMin + xMax) / 2;
                const yMid = (yMin + yMax) / 2;

                const handles = [
                    { x: xMin, y: yMin }, // TL
                    { x: xMax, y: yMin }, // TR
                    { x: xMin, y: yMax }, // BL
                    { x: xMax, y: yMax }, // BR
                    { x: xMid, y: yMin }, // T
                    { x: xMid, y: yMax }, // B
                    { x: xMin, y: yMid }, // L
                    { x: xMax, y: yMid }  // R
                ];
                handles.forEach(h => {
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, hs / 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();
                });

                // 5. Entity ID and type label tag
                const edit = editsRef.current[entityBox.sceneEditIndex!];
                const entity = edit?.scene_data?.entities?.find((ent: any) => ent.id === entityBox.entityId);
                const typeText = entity ? `${entity.type || 'element'}: ${entity.id}` : 'element';
                
                ctx.font = 'bold 10px monospace';
                ctx.fillStyle = '#3B82F6';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(typeText.toUpperCase(), entityBox.left - pad, entityBox.top - pad - 6);

                ctx.restore();
            }
        }

        // Render Three.js compositor with latest overlay texture and color settings
        if (isThreeActive) {
            const showTransition = editsRef.current.some(e => 
                (e.action === 'build_transition' || (e.action === 'add_asset' && e.asset_query?.toLowerCase().includes('transition'))) && 
                e.start != null && t >= e.start && t < (e.start + 0.8)
            );
            const rawMG = editsRef.current.find(e =>
                (e.action === 'add_motion_graphic' || (e.action === 'add_broll' && (e.broll_url === 'remotion_three_js_dynamic' || (!e.resolved_path && !e.broll_url)))) && e.start != null && e.end != null && t >= e.start && t < e.end
            );
            let activeMG = rawMG;
            if (!activeMG && activeSemanticScenes.length > 0) {
                activeMG = {
                    action: 'add_motion_graphic',
                    style: 'custom',
                    geometry: vibeConfig.threeJsEnv.geometryType,
                    material: vibeConfig.threeJsEnv.materialStyle,
                    accent_color: vibeConfig.palette.glow,
                    animation: vibeConfig.threeJsEnv.cameraMotion === 'music_pulse' ? 'pulse' : 'rotate',
                    speed: 1.0,
                    particle_count: 500
                };
            }
            if (activeMG && activeMG.action === 'add_broll') {
                const query = activeMG.query || 'technology';
                let style = 'cinematic';
                if (/tech|data|code|blueprint|logic|graph/i.test(query)) {
                    style = 'blueprint';
                } else if (/fluid|flow|energy|liquid|particles/i.test(query)) {
                    style = 'liquid';
                }
                activeMG = {
                    ...activeMG,
                    action: 'add_motion_graphic',
                    style: style,
                    text: query.toUpperCase(),
                    subtext: 'A-ROLL VISUALIZATION',
                    accent_color: '#a78bfa'
                };
            }
            threeCompositorRef.current.render({
                brightness: finalB,
                contrast: finalC,
                saturation: finalS,
                hue: finalH,
                vignette,
                filmGrain,
                zoom: scale,
                templateId: selectedTemplate,
            }, t, showTransition, activeMG);
        }
    }, [textOverlays, drawAestheticCaptions, drawStyledTextOverlay, transcript, focusedClipId, targetRatio, selectedEntity, threeReady, behindModeActive, activeSemanticScenes, vibeConfig, rvmAlphaSrc, rvmAlphaReady, rvmMaskSrc, rvmMaskReady, videoSrc, subtitleConfig]);

    // ── RAF Render + EDL enforcement loop ────────────────────────
    useEffect(() => {
        if (!videoReady) return;

        const tick = () => {
            const video = videoRef.current;
            if (!video) return;

            const t = video.currentTime;
            setCurrentTime(t);
            onTimeUpdate?.(t);

            // Keep RVM alpha cutout in sync with main playhead
            const alphaVid = rvmAlphaVideoRef.current;
            if (alphaVid && rvmAlphaSrc) {
                if (Math.abs((alphaVid.currentTime || 0) - t) > 0.12) {
                    try { alphaVid.currentTime = t; } catch { /* seeking */ }
                }
                if (isPlaying && alphaVid.paused) {
                    alphaVid.play().catch(() => {});
                } else if (!isPlaying && !alphaVid.paused) {
                    alphaVid.pause();
                }
            }
            const maskVid = rvmMaskVideoRef.current;
            if (maskVid && rvmMaskSrc) {
                if (Math.abs((maskVid.currentTime || 0) - t) > 0.12) {
                    try { maskVid.currentTime = t; } catch { /* seeking */ }
                }
                if (isPlaying && maskVid.paused) {
                    maskVid.play().catch(() => {});
                } else if (!isPlaying && !maskVid.paused) {
                    maskVid.pause();
                }
            }

            // Sync GSAP graphics timeline (send to all active graphics iframes to support multi-track isolated render)
            const mIframes = document.querySelectorAll('.motion-graphic-iframe') as NodeListOf<HTMLIFrameElement>;
            mIframes.forEach((iframe, idx) => {
                if (iframe.contentWindow) {
                    const edit = graphicsEdits[idx];
                    const start = edit?.start ?? 0;
                    const relTime = t - start;
                    iframe.contentWindow.postMessage({ type: 'sync_time', time: t, relTime: relTime }, '*');
                }
            });

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
                            el.style.display = 'block';
                        }
                    } else {
                        if (!el.paused) el.pause();
                        if (isVideo) {
                            el.style.opacity = '0';
                            el.style.display = 'none';
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
            if (!video.paused && !video.seeking && edlRef.current && isCutAt(edlRef.current, t)) {
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
                    } else if (!video.paused && !el.seeking && Math.abs(el.currentTime - (t - edit.start)) > 0.3) {
                        el.currentTime = t - edit.start;
                    }
                    if (el.tagName === 'VIDEO') {
                        el.style.opacity = el.readyState >= 2 ? '1' : '0';
                        el.style.display = el.readyState >= 2 ? 'block' : 'none';
                    }
                } else {
                    if (!el.paused) el.pause();
                    if (el.tagName === 'VIDEO') {
                        el.style.opacity = '0';
                        el.style.display = 'none';
                    }
                }
            });

            // Find active color correction filter string for B-rolls
            const activeColorForBroll = editsRef.current.find(e => 
                e.action === 'color_correction' && e.start != null && e.end != null && t >= e.start && t < e.end
            );
            let brollFilter = 'none';
            if (activeColorForBroll) {
                const presetKey = activeColorForBroll.preset || activeColorForBroll.lut || 'cinema';
                if (presetKey.endsWith('.cube') || presetKey.includes('luts/')) {
                    brollFilter = `contrast(1.15) saturate(1.2) brightness(1.05) sepia(0.08) hue-rotate(-4deg)`;
                } else {
                    const base = LUT_PRESETS[presetKey] || { brightness: 1.0, contrast: 1.0, saturation: 1.0, hue: 0 };
                    const userB = activeColorForBroll.brightness !== undefined ? activeColorForBroll.brightness : 100;
                    const userC = activeColorForBroll.contrast !== undefined ? activeColorForBroll.contrast : 100;
                    const userS = activeColorForBroll.saturation !== undefined ? activeColorForBroll.saturation : 100;
                    const userH = activeColorForBroll.hue !== undefined ? activeColorForBroll.hue : 0;

                    const finalB = base.brightness * (userB / 100);
                    const finalC = base.contrast * (userC / 100);
                    const finalS = base.saturation * (userS / 100);
                    const finalH = base.hue + userH;

                    brollFilter = `brightness(${finalB}) contrast(${finalC}) saturate(${finalS}) hue-rotate(${finalH}deg)`;
                }
            }

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
                    } else if (!video.paused && !el.seeking && Math.abs(el.currentTime - (t - edit.start)) > 0.3) {
                        el.currentTime = t - edit.start;
                    }
                    if (edit.broll_url === 'remotion_three_js_dynamic') {
                        el.style.opacity = '0';
                        el.style.display = 'none';
                    } else {
                        el.style.opacity = el.readyState >= 2 ? '1' : '0';
                        el.style.display = el.readyState >= 2 ? 'block' : 'none';
                    }
                    el.style.filter = brollFilter;
                } else {
                    if (!el.paused) el.pause();
                    el.style.opacity = '0';
                    el.style.display = 'none';
                    el.style.filter = 'none';
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
            rvmAlphaVideoRef.current?.play().catch(() => {});
            rvmMaskVideoRef.current?.play().catch(() => {});
        } else {
            video.pause();
            rvmAlphaVideoRef.current?.pause();
            rvmMaskVideoRef.current?.pause();
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

    const getActiveSelectedBox = useCallback(() => {
        if (selectedEntity) {
            const box = drawnTextBoxesRef.current.find(b => 
                b.isEntity && b.sceneEditIndex === selectedEntity.sceneEditIndex && b.entityId === selectedEntity.entityId
            );
            if (box) return box;
        }
        if (focusedClipId && drawnTextBoxesRef.current.length > 0) {
            const box = drawnTextBoxesRef.current.find(b => {
                if (focusedClipId === "T1-Subtitles" || focusedClipId === "subtitles") {
                    return b.isSub;
                }
                if (focusedClipId.startsWith("T1-Sub-")) {
                    return b.isSub;
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
                    return b.editIndex === targetEditIndex;
                }
                return false;
            });
            if (box) return box;
        }
        return null;
    }, [selectedEntity, focusedClipId]);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
        if (!canvas) return;

        if (isPlaying) {
            if (onTogglePlay) onTogglePlay();
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

        // 1. Check if click hits a handle or border of the currently selected/focused box
        const activeBox = getActiveSelectedBox();
        if (activeBox) {
            const pad = 12;
            const handleSize = 15; // Hit area radius for handles
            const lineThresh = 8;  // Hit tolerance for lines
            
            const xMin = activeBox.left - pad;
            const xMax = activeBox.left + activeBox.width + pad;
            const yMin = activeBox.top - pad;
            const yMax = activeBox.top + activeBox.height + pad;
            const xMid = (xMin + xMax) / 2;
            const yMid = (yMin + yMax) / 2;

            const dist = (x1: number, y1: number, x2: number, y2: number) => Math.sqrt((x1-x2)*(x1-x2) + (y1-y2)*(y1-y2));

            let hitMode: 'TL' | 'TR' | 'BL' | 'BR' | 'T' | 'B' | 'L' | 'R' | null = null;

            // Check circular handles first
            if (dist(clickX, clickY, xMin, yMin) <= handleSize) hitMode = 'TL';
            else if (dist(clickX, clickY, xMax, yMin) <= handleSize) hitMode = 'TR';
            else if (dist(clickX, clickY, xMin, yMax) <= handleSize) hitMode = 'BL';
            else if (dist(clickX, clickY, xMax, yMax) <= handleSize) hitMode = 'BR';
            else if (dist(clickX, clickY, xMid, yMin) <= handleSize) hitMode = 'T';
            else if (dist(clickX, clickY, xMid, yMax) <= handleSize) hitMode = 'B';
            else if (dist(clickX, clickY, xMin, yMid) <= handleSize) hitMode = 'L';
            else if (dist(clickX, clickY, xMax, yMid) <= handleSize) hitMode = 'R';

            // Check line borders next
            if (!hitMode) {
                if (Math.abs(clickY - yMin) <= lineThresh && clickX >= xMin - lineThresh && clickX <= xMax + lineThresh) {
                    hitMode = 'T';
                } else if (Math.abs(clickY - yMax) <= lineThresh && clickX >= xMin - lineThresh && clickX <= xMax + lineThresh) {
                    hitMode = 'B';
                } else if (Math.abs(clickX - xMin) <= lineThresh && clickY >= yMin - lineThresh && clickY <= yMax + lineThresh) {
                    hitMode = 'L';
                } else if (Math.abs(clickX - xMax) <= lineThresh && clickY >= yMin - lineThresh && clickY <= yMax + lineThresh) {
                    hitMode = 'R';
                }
            }

            if (hitMode) {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);

                if (isPlaying && onTogglePlay) {
                    onTogglePlay();
                }

                isDraggingRef.current = true;
                draggedBoxRef.current = activeBox;
                dragModeRef.current = `resize-${hitMode}`;
                dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
                dragStartCoordsRef.current = { x: activeBox.x, y: activeBox.y };

                let originalFontSize = 58;
                if (activeBox.isSub) {
                    originalFontSize = subtitleConfig?.font_size || 58;
                } else if (activeBox.editIndex !== undefined) {
                    const edit = editsRef.current[activeBox.editIndex];
                    originalFontSize = edit?.font_size || edit?.fontsize || 58;
                }

                if (activeBox.isEntity && activeBox.sceneEditIndex !== undefined) {
                    const edit = editsRef.current[activeBox.sceneEditIndex];
                    const entity = edit?.scene_data?.entities?.find((ent: any) => ent.id === activeBox.entityId);
                    dragStartDimsRef.current = {
                        width: entity?.width ?? 28,
                        height: entity?.height ?? 12,
                        fontSize: originalFontSize
                    };
                } else {
                    dragStartDimsRef.current = {
                        width: activeBox.width,
                        height: activeBox.height,
                        fontSize: originalFontSize
                    };
                }
                return;
            }
        }

        // 2. Check if click hits any drawn box (for dragging / selecting)
        const hitBox = [...drawnTextBoxesRef.current].reverse().find(box => {
            return clickX >= box.left && clickX <= box.left + box.width &&
                   clickY >= box.top && clickY <= box.top + box.height;
        });

        if (hitBox) {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            
            if (isPlaying && onTogglePlay) {
                onTogglePlay();
            }

            isDraggingRef.current = true;
            draggedBoxRef.current = hitBox;
            dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
            dragStartCoordsRef.current = { x: hitBox.x, y: hitBox.y };

                if (hitBox.isEntity) {
                    dragModeRef.current = 'move';
                    setSelectedEntity({ sceneEditIndex: hitBox.sceneEditIndex!, entityId: hitBox.entityId! });
                    
                    const focusId = `S1-Scene-${hitBox.sceneEditIndex}`;
                    window.dispatchEvent(new CustomEvent('select_clip_focus', { detail: focusId }));
                } else if (hitBox.isBgText) {
                    dragModeRef.current = 'move';
                    setSelectedEntity(null);
                    window.dispatchEvent(new CustomEvent('select_clip_focus', { detail: 'BG-Text' }));
                } else {
                    dragModeRef.current = 'move';
                    setSelectedEntity(null);
                    
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
                }
        } else {
            isDraggingRef.current = false;
            draggedBoxRef.current = null;
            dragModeRef.current = null;
            setSelectedEntity(null);
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();

        // 1. Update hover cursor style when not dragging
        if (!isDraggingRef.current) {
            const hoverX = ((e.clientX - rect.left) / rect.width) * canvas.width;
            const hoverY = ((e.clientY - rect.top) / rect.height) * canvas.height;
            
            const activeBox = getActiveSelectedBox();
            if (activeBox) {
                const pad = 12;
                const handleSize = 15;
                const lineThresh = 8;
                
                const xMin = activeBox.left - pad;
                const xMax = activeBox.left + activeBox.width + pad;
                const yMin = activeBox.top - pad;
                const yMax = activeBox.top + activeBox.height + pad;
                const xMid = (xMin + xMax) / 2;
                const yMid = (yMin + yMax) / 2;
                
                const dist = (x1: number, y1: number, x2: number, y2: number) => Math.sqrt((x1-x2)*(x1-x2) + (y1-y2)*(y1-y2));
                
                let cursorMode: 'TL' | 'TR' | 'BL' | 'BR' | 'T' | 'B' | 'L' | 'R' | null = null;
                
                if (dist(hoverX, hoverY, xMin, yMin) <= handleSize) cursorMode = 'TL';
                else if (dist(hoverX, hoverY, xMax, yMin) <= handleSize) cursorMode = 'TR';
                else if (dist(hoverX, hoverY, xMin, yMax) <= handleSize) cursorMode = 'BL';
                else if (dist(hoverX, hoverY, xMax, yMax) <= handleSize) cursorMode = 'BR';
                else if (dist(hoverX, hoverY, xMid, yMin) <= handleSize) cursorMode = 'T';
                else if (dist(hoverX, hoverY, xMid, yMax) <= handleSize) cursorMode = 'B';
                else if (dist(hoverX, hoverY, xMin, yMid) <= handleSize) cursorMode = 'L';
                else if (dist(hoverX, hoverY, xMax, yMid) <= handleSize) cursorMode = 'R';
                
                if (!cursorMode) {
                    if (Math.abs(hoverY - yMin) <= lineThresh && hoverX >= xMin - lineThresh && hoverX <= xMax + lineThresh) {
                        cursorMode = 'T';
                    } else if (Math.abs(hoverY - yMax) <= lineThresh && hoverX >= xMin - lineThresh && hoverX <= xMax + lineThresh) {
                        cursorMode = 'B';
                    } else if (Math.abs(hoverX - xMin) <= lineThresh && hoverY >= yMin - lineThresh && hoverY <= yMax + lineThresh) {
                        cursorMode = 'L';
                    } else if (Math.abs(hoverX - xMax) <= lineThresh && hoverY >= yMin - lineThresh && hoverY <= yMax + lineThresh) {
                        cursorMode = 'R';
                    }
                }
                
                if (cursorMode) {
                    if (cursorMode === 'TL' || cursorMode === 'BR') {
                        canvas.style.cursor = 'nwse-resize';
                    } else if (cursorMode === 'TR' || cursorMode === 'BL') {
                        canvas.style.cursor = 'nesw-resize';
                    } else if (cursorMode === 'L' || cursorMode === 'R') {
                        canvas.style.cursor = 'ew-resize';
                    } else if (cursorMode === 'T' || cursorMode === 'B') {
                        canvas.style.cursor = 'ns-resize';
                    }
                    return;
                }
            }
            
            // Check if hovering body of any drawn box
            const hoverHitBox = [...drawnTextBoxesRef.current].reverse().find(box => {
                return hoverX >= box.left && hoverX <= box.left + box.width &&
                       hoverY >= box.top && hoverY <= box.top + box.height;
            });
            if (hoverHitBox) {
                canvas.style.cursor = 'move';
            } else {
                canvas.style.cursor = 'default';
            }
            return;
        }

        if (!draggedBoxRef.current) return;
        const box = draggedBoxRef.current;
        
        // Drag delta in client pixels
        const clientDx = e.clientX - dragStartPointerRef.current.x;
        const clientDy = e.clientY - dragStartPointerRef.current.y;

        // Convert delta to canvas percentage
        const pctDx = (clientDx / rect.width) * 100;
        const pctDy = (clientDy / rect.height) * 100;

        if (dragModeRef.current === 'move') {
            const newX = Math.round(Math.max(0, Math.min(100, dragStartCoordsRef.current.x + pctDx)));
            const newY = Math.round(Math.max(0, Math.min(100, dragStartCoordsRef.current.y + pctDy)));

            box.x = newX;
            box.y = newY;

            // Update coordinates in parent state
            if (box.isSub) {
                const subEdit = editsRef.current.find(x => x.action === 'add_subtitles');
                if (subEdit) {
                    subEdit.x = newX;
                    subEdit.y = newY;
                }
                editsRef.current.forEach(x => {
                    if (x.action === 'add_text_overlay' && x.is_subtitle) {
                        x.x = newX;
                        x.y = newY;
                    }
                });
                onUpdateSubtitleGlobal?.('x', newX);
                onUpdateSubtitleGlobal?.('y', newY);
            } else if (box.isBgText && box.editIndex !== undefined) {
                const edit = editsRef.current[box.editIndex];
                if (edit) {
                    edit.x = newX;
                    edit.y = newY;
                    onUpdateEdit?.(box.editIndex, { x: newX, y: newY });
                }
            } else if (box.isEntity && box.sceneEditIndex !== undefined) {
                const edit = editsRef.current[box.sceneEditIndex];
                if (edit && edit.scene_data && edit.scene_data.entities) {
                    const updatedEntities = edit.scene_data.entities.map((ent: any) => {
                        if (ent.id === box.entityId) {
                            return { ...ent, x: newX, y: newY };
                        }
                        return ent;
                    });
                    const updatedSceneData = { ...edit.scene_data, entities: updatedEntities };
                    edit.scene_data = updatedSceneData;
                    onUpdateEdit?.(box.sceneEditIndex, { scene_data: updatedSceneData });
                }
            } else if (box.editIndex !== undefined) {
                const edit = editsRef.current[box.editIndex];
                if (edit) {
                    edit.x = newX;
                    edit.y = newY;
                }
                onUpdateEdit?.(box.editIndex, { x: newX, y: newY });
            }
        } else if (dragModeRef.current && dragModeRef.current.startsWith('resize-')) {
            const corner = dragModeRef.current.replace('resize-', '');
            const W_orig = dragStartDimsRef.current.width;
            const H_orig = dragStartDimsRef.current.height;
            const X_orig = dragStartCoordsRef.current.x;
            const Y_orig = dragStartCoordsRef.current.y;

            if (box.isEntity) {
                let newW = W_orig;
                let newH = H_orig;

                if (corner === 'BR' || corner === 'TR' || corner === 'R') {
                    newW = W_orig + pctDx;
                } else if (corner === 'BL' || corner === 'TL' || corner === 'L') {
                    newW = W_orig - pctDx;
                }

                if (corner === 'BR' || corner === 'BL' || corner === 'B') {
                    newH = H_orig + pctDy;
                } else if (corner === 'TR' || corner === 'TL' || corner === 'T') {
                    newH = H_orig - pctDy;
                }

                // Cap dimensions to a safe min boundary
                newW = Math.max(2, Math.min(100, newW));
                newH = Math.max(2, Math.min(100, newH));

                let newX = X_orig;
                let newY = Y_orig;

                if (corner === 'BR' || corner === 'TR' || corner === 'R') {
                    newX = X_orig - W_orig / 2 + newW / 2;
                } else if (corner === 'BL' || corner === 'TL' || corner === 'L') {
                    newX = X_orig + W_orig / 2 - newW / 2;
                }

                if (corner === 'BR' || corner === 'BL' || corner === 'B') {
                    newY = Y_orig - H_orig / 2 + newH / 2;
                } else if (corner === 'TR' || corner === 'TL' || corner === 'T') {
                    newY = Y_orig + H_orig / 2 - newH / 2;
                }

                newX = Math.round(Math.max(0, Math.min(100, newX)));
                newY = Math.round(Math.max(0, Math.min(100, newY)));
                newW = Math.round(newW);
                newH = Math.round(newH);

                box.x = newX;
                box.y = newY;
                box.width = (newW / 100) * canvas.width;
                box.height = (newH / 100) * canvas.height;

                if (box.sceneEditIndex !== undefined) {
                    const edit = editsRef.current[box.sceneEditIndex];
                    if (edit && edit.scene_data && edit.scene_data.entities) {
                        const updatedEntities = edit.scene_data.entities.map((ent: any) => {
                            if (ent.id === box.entityId) {
                                return { ...ent, x: newX, y: newY, width: newW, height: newH };
                            }
                            return ent;
                        });
                        const updatedSceneData = { ...edit.scene_data, entities: updatedEntities };
                        edit.scene_data = updatedSceneData;
                        onUpdateEdit?.(box.sceneEditIndex, { scene_data: updatedSceneData });
                    }
                }
            } else {
                // Subtitles or Text/Graphic Overlays -> Adjust font size proportionally
                let scaleFactor = 1.0;
                const canvasDx = (clientDx / rect.width) * canvas.width;
                const canvasDy = (clientDy / rect.height) * canvas.height;

                if (corner === 'R' || corner === 'TR' || corner === 'BR') {
                    scaleFactor = (W_orig + canvasDx) / W_orig;
                } else if (corner === 'L' || corner === 'TL' || corner === 'BL') {
                    scaleFactor = (W_orig - canvasDx) / W_orig;
                } else if (corner === 'B') {
                    scaleFactor = (H_orig + canvasDy) / H_orig;
                } else if (corner === 'T') {
                    scaleFactor = (H_orig - canvasDy) / H_orig;
                }

                if (isNaN(scaleFactor) || scaleFactor <= 0.05) {
                    scaleFactor = 0.05;
                }

                const newFontSize = Math.max(8, Math.min(250, Math.round(dragStartDimsRef.current.fontSize * scaleFactor)));

                if (box.isSub) {
                    onUpdateSubtitleGlobal?.('font_size', newFontSize);
                } else if (box.editIndex !== undefined) {
                    const edit = editsRef.current[box.editIndex];
                    if (edit) {
                        edit.font_size = newFontSize;
                        edit.fontsize = newFontSize;
                    }
                    onUpdateEdit?.(box.editIndex, { font_size: newFontSize, fontsize: newFontSize });
                }
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isDraggingRef.current) {
            try {
                e.currentTarget.releasePointerCapture(e.pointerId);
            } catch (err) {}
            isDraggingRef.current = false;
            draggedBoxRef.current = null;
            dragModeRef.current = null;
        }
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPlaying) return;
        const canvas = e.currentTarget;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

        const hitBox = [...drawnTextBoxesRef.current].reverse().find(box => {
            return clickX >= box.left && clickX <= box.left + box.width &&
                   clickY >= box.top && clickY <= box.top + box.height;
        });

        if (hitBox && hitBox.isEntity && hitBox.sceneEditIndex !== undefined) {
            const edit = editsRef.current[hitBox.sceneEditIndex];
            const entity = edit?.scene_data?.entities?.find((ent: any) => ent.id === hitBox.entityId);
            if (entity) {
                setEditingEntity({
                    sceneEditIndex: hitBox.sceneEditIndex,
                    entityId: hitBox.entityId!,
                    left: hitBox.left,
                    top: hitBox.top,
                    width: hitBox.width,
                    height: hitBox.height,
                    text: entity.text || ''
                });
            }
        }
    };

    const handleSaveEntityText = () => {
        if (!editingEntity) return;
        const { sceneEditIndex, entityId, text } = editingEntity;
        const edit = editsRef.current[sceneEditIndex];
        if (edit && edit.scene_data && edit.scene_data.entities) {
            const updatedEntities = edit.scene_data.entities.map((ent: any) => {
                if (ent.id === entityId) {
                    return { ...ent, text: text };
                }
                return ent;
            });
            const updatedSceneData = { ...edit.scene_data, entities: updatedEntities };
            edit.scene_data = updatedSceneData;
            onUpdateEdit?.(sceneEditIndex, { scene_data: updatedSceneData });
        }
        setEditingEntity(null);
    };

    const seek = (e: React.MouseEvent<HTMLDivElement>) => {
        const bar = e.currentTarget;
        const rect = bar.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = pct * dur;
        if (videoRef.current) videoRef.current.currentTime = newTime;
        if (rvmAlphaVideoRef.current) {
            try { rvmAlphaVideoRef.current.currentTime = newTime; } catch { /* seeking */ }
        }
        if (rvmMaskVideoRef.current) {
            try { rvmMaskVideoRef.current.currentTime = newTime; } catch { /* seeking */ }
        }
        setCurrentTime(newTime);
    };

    // ── Badge counts ──────────────────────────────────────────────
    const cutCount = edits.filter(e => e.action === 'cut_out').length;
    const zoomCount = edits.filter(e => e.action === 'camera_zoom').length;
    const brollCount = edits.filter(e => e.action === 'add_broll').length;
    const textCount = edits.filter(e => e.action === 'add_text_overlay').length;

    const activeBroll = useMemo(() => {
        return brollEdits.find(e => e.start != null && e.end != null && currentTime >= e.start && currentTime < e.end);
    }, [brollEdits, currentTime]);

    const isSplitActive = useMemo(() => {
        const hasSplitBroll = activeBroll && (activeBroll.layout === 'split' || (activeBroll as any).is_split);
        const hasSplitScene = activeSemanticScenes.length > 0 && (
            activeSemanticScenes[0].layout === 'split' || 
            (activeSemanticScenes[0].scene_data && activeSemanticScenes[0].scene_data.layout === 'split')
        );
        return !!(hasSplitBroll || hasSplitScene);
    }, [activeBroll, activeSemanticScenes]);

    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: '#000', minHeight: 0 }}>

            {/* Hidden video element — always mounted, canvas reads from it */}
            <video
                ref={videoRef}
                src={activeVideoSrc || undefined}
                preload="auto"
                playsInline
                crossOrigin="anonymous"
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
                onError={(e) => {
                    const video = videoRef.current;
                    if (video && video.src.includes('_proxy')) {
                        console.warn('[SandboxPlayer] Proxy video failed to load, falling back to original:', videoSrc);
                        setProxyFailed(true);
                    } else {
                        console.error('SandboxPlayer video error:', e);
                    }
                }}
            />

            {/* RVM alpha cutout (legacy) + grayscale mask (preferred for canvas) */}
            {rvmAlphaSrc && (
                <video
                    ref={rvmAlphaVideoRef}
                    key={`alpha-${rvmAlphaSrc}`}
                    src={`${rvmAlphaSrc}${rvmAlphaSrc.includes('?') ? '&' : '?'}cors=1`}
                    preload="auto"
                    playsInline
                    muted
                    crossOrigin="anonymous"
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, top: 0, left: 0 }}
                    onLoadedData={() => setRvmAlphaReady(true)}
                    onError={() => {
                        console.warn('[SandboxPlayer] RVM alpha video failed to load');
                        setRvmAlphaReady(false);
                    }}
                />
            )}
            {rvmMaskSrc && (
                <video
                    ref={rvmMaskVideoRef}
                    key={`mask-${rvmMaskSrc}`}
                    src={`${rvmMaskSrc}${rvmMaskSrc.includes('?') ? '&' : '?'}cors=1`}
                    preload="auto"
                    playsInline
                    muted
                    crossOrigin="anonymous"
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, top: 0, left: 0 }}
                    onLoadedData={() => setRvmMaskReady(true)}
                    onError={() => {
                        console.warn('[SandboxPlayer] RVM mask video failed to load');
                        setRvmMaskReady(false);
                    }}
                />
            )}

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
                    {/* 2D Fallback / Interaction Canvas — forced on for behind-speaker */}
                    <canvas
                        ref={canvasRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onDoubleClick={handleDoubleClick}
                        style={{
                            width: '100%',
                            height: isSplitActive ? '50%' : '100%',
                            position: isSplitActive ? 'absolute' : 'relative',
                            top: 0,
                            left: 0,
                            objectFit: isSplitActive ? 'cover' : 'contain',
                            cursor: 'pointer',
                            display: videoReady && (!threeReady || behindModeActive) ? 'block' : 'none',
                        }}
                    />

                    {/* WebGL Composer Canvas */}
                    <canvas
                        ref={webglCanvasRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onDoubleClick={handleDoubleClick}
                        style={{
                            width: '100%',
                            height: isSplitActive ? '50%' : '100%',
                            position: isSplitActive ? 'absolute' : 'relative',
                            top: 0,
                            left: 0,
                            objectFit: isSplitActive ? 'cover' : 'contain',
                            cursor: 'pointer',
                            display: videoReady && threeReady && !behindModeActive ? 'block' : 'none',
                        }}
                    />

                    {/* 3D Motion Graphics Typography overlay */}
                    {activeMG && videoReady && !isSceneActive && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: '15%',
                                width: '90%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                                fontFamily: activeMG.style === 'blueprint' ? '"Courier New", Courier, monospace' : '"Outfit", "Inter", sans-serif',
                                color: '#ffffff',
                                zIndex: 100,
                                pointerEvents: 'none',
                            }}
                        >
                            {activeMG.style === 'blueprint' && (
                                <div style={{ color: activeMG.accent_color || '#06b6d4', fontSize: '10px', letterSpacing: '4px', marginBottom: '4px', opacity: 0.8, fontWeight: 'bold' }}>
                                    // SEQUENCE_INITIALIZED //
                                </div>
                            )}
                            <h1 style={{
                                fontSize: '32px',
                                fontWeight: 900,
                                margin: 0,
                                letterSpacing: '-0.5px',
                                lineHeight: 1.1,
                                textShadow: '0 4px 15px rgba(0,0,0,0.8)',
                                textTransform: 'uppercase',
                                background: activeMG.style === 'liquid' ? `linear-gradient(45deg, #ffffff, ${activeMG.accent_color || '#ec4899'})` : undefined,
                                WebkitBackgroundClip: activeMG.style === 'liquid' ? 'text' : undefined,
                                WebkitTextFillColor: activeMG.style === 'liquid' ? 'transparent' : undefined,
                            }}>
                                {activeMG.text}
                            </h1>
                            {activeMG.subtext && (
                                <p style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    margin: '6px 0 0 0',
                                    opacity: 0.8,
                                    letterSpacing: '1px',
                                    textTransform: 'uppercase',
                                    color: activeMG.style === 'blueprint' ? activeMG.accent_color || '#06b6d4' : '#e2e8f0',
                                    textShadow: '0 2px 6px rgba(0,0,0,0.7)',
                                }}>
                                    {activeMG.subtext}
                                </p>
                            )}
                            {activeMG.style === 'blueprint' && (
                                <div style={{
                                    marginTop: '8px',
                                    fontSize: '8px',
                                    opacity: 0.6,
                                    color: '#a1a1aa',
                                    borderTop: `1px solid ${activeMG.accent_color || '#06b6d4'}`,
                                    paddingTop: '4px',
                                    display: 'inline-block',
                                }}>
                                    SYSTEM: OK | TEMP: 32C | FPS: 30.0
                                </div>
                            )}
                        </div>
                    )}

                    {editingEntity && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${(editingEntity.left / (canvasRef.current?.width || 1)) * 100}%`,
                                top: `${(editingEntity.top / (canvasRef.current?.height || 1)) * 100}%`,
                                width: `${(editingEntity.width / (canvasRef.current?.width || 1)) * 100}%`,
                                height: `${(editingEntity.height / (canvasRef.current?.height || 1)) * 100}%`,
                                zIndex: 300,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <textarea
                                autoFocus
                                value={editingEntity.text}
                                onChange={(e) => setEditingEntity({ ...editingEntity, text: e.target.value })}
                                onBlur={() => handleSaveEntityText()}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSaveEntityText();
                                    }
                                    if (e.key === 'Escape') {
                                        setEditingEntity(null);
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    background: 'rgba(20, 20, 25, 0.95)',
                                    color: '#FFFFFF',
                                    border: '2px solid #3B82F6',
                                    borderRadius: '8px',
                                    padding: '8px',
                                    fontSize: '14px',
                                    fontFamily: 'Inter, sans-serif',
                                    outline: 'none',
                                    resize: 'none',
                                    textAlign: 'center',
                                    boxShadow: '0 0 16px rgba(59, 130, 246, 0.5)',
                                }}
                            />
                        </div>
                    )}

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

                    {/* GSAP Motion Graphics overlay via RemotionGraphicPlayer (isolated, transparent, frame-sync) */}
                    {graphicsEdits.length > 0 && videoReady && !isSceneActive && graphicsEdits.map((edit, idx) => {
                        const start = edit.start ?? 0;
                        const duration = edit.duration ?? (edit.end ? (edit.end - start) : 999999);
                        const end = edit.end ?? (start + duration);
                        const globalIndex = edits.indexOf(edit);
                        const isGraphicActive = currentTime >= start && currentTime < end;
                        const interactive = !isPlaying && isGraphicActive;
                        return (
                            <RemotionGraphicPlayer
                                key={`graphic-remotion-${idx}-${start}-${end}-${edit.design_aspect || (targetRatio > 1 ? 'h' : 'v')}`}
                                htmlContent={edit.html_content || edit.html || ''}
                                currentTime={currentTime}
                                clipStart={start}
                                clipEnd={end}
                                isFullBroll={edit.mode === 'full_broll' || edit.mode === 'fullscreen' || edit.action === 'scene_override'}
                                targetRatio={targetRatio}
                                designAspect={edit.design_aspect}
                                offsetX={edit.offset_x ?? 0}
                                offsetY={edit.offset_y ?? 0}
                                scaleX={edit.scale_x ?? 1}
                                scaleY={edit.scale_y ?? 1}
                                interactive={interactive}
                                selected={selectedGraphicEditIndex === globalIndex}
                                onSelect={() => setSelectedGraphicEditIndex(globalIndex)}
                                onTransformChange={({ offsetX: ox, offsetY: oy, scaleX: sx, scaleY: sy }) => {
                                    if (globalIndex < 0) return;
                                    setSelectedGraphicEditIndex(globalIndex);
                                    const target = editsRef.current[globalIndex];
                                    if (target) {
                                        target.offset_x = ox;
                                        target.offset_y = oy;
                                        target.scale_x = sx;
                                        target.scale_y = sy;
                                    }
                                    onUpdateEdit?.(globalIndex, {
                                        offset_x: ox,
                                        offset_y: oy,
                                        scale_x: sx,
                                        scale_y: sy,
                                    });
                                }}
                            />
                        );
                    })}

                    {/* ReactBits Motion Component Overlays (BlurText, ShinyText, DecryptedText, TrueFocus, GlitchText, Subtitles) */}
                    {videoReady && editsRef.current.filter(e => (e.action === 'reactbits_preset' || (e as any).preset || (e as any).component || (e.action === 'add_subtitles' && ['blur', 'shiny', 'decrypted', 'true_focus', 'glitch', 'gradient', 'echo'].includes((e as any).animation_style))) && e.start != null && e.end != null && currentTime >= e.start && currentTime < e.end).map((edit, idx) => (
                        <ReactBitsPlayer
                            key={`reactbits-${idx}-${edit.start}`}
                            preset={(edit as any).preset || (edit as any).component || ((edit as any).animation_style ? (edit as any).animation_style : 'BlurText')}
                            props={edit}
                            currentTime={currentTime}
                            start={edit.start ?? 0}
                            end={edit.end ?? (edit.start! + 4.0)}
                        />
                    ))}




                    {/* Direct Semantic Scene React HTML/DOM Overlay */}
                    {videoReady && activeSemanticScenes.map((se, sIdx) => {
                        const sceneTime = currentTime - se.start!;
                        const isSceneSplit = se.layout === 'split' || (se.scene_data && se.scene_data.layout === 'split');
                        return (
                            <div
                                key={(se as any).id || `semantic-scene-overlay-${se.start}`}
                                className="absolute left-0 w-full z-[120] overflow-hidden pointer-events-none"
                                style={{
                                    fontFamily: vibeConfig.global.fontFamily,
                                    top: isSceneSplit ? '50%' : 0,
                                    height: isSceneSplit ? '50%' : '100%',
                                    maxHeight: '100%',
                                }}
                            >

                                <SemanticSceneOverlay
                                    sceneData={se.scene_data}
                                    sceneTime={sceneTime}
                                    sceneDuration={se.end! - se.start!}
                                />
                            </div>
                        );
                    })}

                    {/* Scene Override (full-frame opaque scene replacing video) */}
                    {activeSceneHtml && videoReady && (
                        <div className="absolute inset-0 z-[200]" onClick={onTogglePlay} style={{ cursor: 'pointer', background: 'transparent', backgroundColor: 'transparent' }}>
                            <iframe
                                ref={sceneIframeRef}
                                srcDoc={activeSceneHtml}
                                className="w-full h-full"
                                style={{ border: 'none', background: 'transparent', backgroundColor: 'transparent' }}
                                {...({ allowtransparency: "true" } as any)}
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
                                    style={{ mixBlendMode: 'screen', zIndex: 210, opacity: 0, display: 'none', transition: 'opacity 0.2s ease-out' }}
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
                                    style={{ opacity: 0, display: 'none', mixBlendMode: 'screen', background: 'transparent', backgroundColor: 'transparent' }}
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

                        let activeBrollSrc = src;
                        if (isMobile && src && !src.includes('_proxy')) {
                            const filenameFromSrc = src.split('/').pop()?.toLowerCase();
                            if (filenameFromSrc && mediaLibrary) {
                                const foundItem = mediaLibrary.find((item: any) => {
                                    const itemPath = item.path || "";
                                    return itemPath.toLowerCase().endsWith(filenameFromSrc);
                                });
                                if (foundItem && foundItem.proxy_path) {
                                    activeBrollSrc = resolveMediaUrl(foundItem.proxy_path);
                                } else if (src.includes('/uploads/')) {
                                    const parts = src.split('.');
                                    if (parts.length > 1) {
                                        const ext = parts.pop();
                                        const base = parts.join('.');
                                        activeBrollSrc = `${base}_proxy.${ext}`;
                                    }
                                }
                            }
                        }

                        const isBrollSplit = edit.layout === 'split' || edit.is_split;
                        return (
                            <video
                                key={`broll-${i}`}
                                ref={el => { brollRefs.current[i] = el; }}
                                src={activeBrollSrc}
                                preload="auto"
                                playsInline
                                muted
                                className="absolute left-0 w-full z-[95]"
                                style={{
                                    opacity: 0,
                                    display: 'none',
                                    pointerEvents: 'none',
                                    top: isBrollSplit ? '50%' : 0,
                                    height: isBrollSplit ? '50%' : '100%',
                                    objectFit: isBrollSplit ? 'cover' : 'contain',
                                    background: 'transparent',
                                    backgroundColor: 'transparent'
                                }}
                                onError={(e) => {
                                    const el = e.currentTarget;
                                    if (el.src.includes('_proxy')) {
                                        console.warn('[SandboxPlayer] B-roll proxy failed, falling back to original:', src);
                                        el.src = src;
                                    }
                                }}
                            />
                        );
                    })}

                    {/* Cinematic vignette overlay */}
                    <div
                        className="absolute inset-0 pointer-events-none z-[5]"
                        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }}
                    />

                    {/* Play/Pause overlay — above graphic hit-layer so play still works */}
                    {!isPlaying && videoReady && selectedGraphicEditIndex == null && (
                        <div
                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-[280]"
                        >
                            <button
                                onClick={onTogglePlay}
                                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 hover:scale-105 pointer-events-auto cursor-pointer"
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    backdropFilter: 'blur(12px)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                    outline: 'none',
                                }}
                            >
                                <svg className="w-6 h-6 ml-0.5" fill="#F5F7FA" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </button>
                        </div>
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
            {/* ── Player Controls ── */}
            <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 pt-16 flex flex-col gap-3 z-[250]" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)' }}>
                
                {/* Scrubber track */}
                <div
                    className="w-full h-1.5 rounded-full cursor-pointer relative group bg-white/20"
                    onClick={seek}
                >
                    {/* Progress fill */}
                    {dur > 0 && (
                        <div
                            className="absolute top-0 bottom-0 left-0 rounded-full bg-[#E5E5EA]"
                            style={{ width: `${(currentTime / dur) * 100}%` }}
                        />
                    )}
                    {/* Playhead pill */}
                    {dur > 0 && (
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-all shadow-md"
                            style={{
                                left: `calc(${(currentTime / dur) * 100}% - 6px)`,
                            }}
                        />
                    )}
                </div>

                {/* Bottom Row */}
                <div className="flex items-center justify-between relative h-8">
                    {/* Time */}
                    <div className="text-[12px] font-mono text-neutral-300 tracking-wide w-32 flex-shrink-0 flex items-center">
                        {fmtTime(currentTime)} / {fmtTime(dur)}
                    </div>

                    {/* Play/pause button (Center) */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                        <button
                            onClick={onTogglePlay}
                            disabled={!videoReady}
                            className="flex items-center justify-center w-9 h-9 rounded-full bg-white text-black hover:scale-105 transition-all disabled:opacity-30 disabled:hover:scale-100 shadow-sm"
                        >
                            {isPlaying
                                ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                : <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            }
                        </button>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-4 text-neutral-300 w-32 justify-end flex-shrink-0">
                        <button className="hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z"/>
                            </svg>
                        </button>
                        <button className="hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default SandboxPlayer;
