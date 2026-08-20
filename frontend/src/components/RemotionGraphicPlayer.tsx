import React, { useRef, useEffect, useMemo, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { getApiUrl } from '@/utils/api';
import { GRAPHIC_ANTI_CLIP_CSS, GRAPHIC_CANVAS_FIT_CSS, GRAPHIC_FIT_ROOT_SCRIPT } from '@/utils/graphicCanvasFit';
import { extractPlateCopy, replacePlateCopy } from '@/utils/graphicPlateCopy';

type DragMode =
    | 'move'
    | 'resize-TL' | 'resize-TR' | 'resize-BL' | 'resize-BR'
    | 'resize-T' | 'resize-B' | 'resize-L' | 'resize-R';

interface ContentBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface RemotionGraphicPlayerProps {
    htmlContent: string;
    currentTime: number;
    clipStart: number;
    clipEnd: number;
    isFullBroll?: boolean;
    targetRatio?: number;
    /** Aspect the HTML was authored for, e.g. "16:9" | "9:16" */
    designAspect?: string;
    offsetX?: number;
    offsetY?: number;
    scaleX?: number;
    scaleY?: number;
    interactive?: boolean;
    selected?: boolean;
    onSelect?: () => void;
    onDeselect?: () => void;
    onTransformChange?: (next: {
        offsetX: number;
        offsetY: number;
        scaleX: number;
        scaleY: number;
    }) => void;
    onHtmlChange?: (html: string) => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Rewrite vw/vh → cqw/cqh so fonts/sizes track the design canvas, not the iframe window. */
function rewriteViewportUnits(html: string): string {
    return html
        .replace(/(\d+(?:\.\d+)?)vw\b/gi, '$1cqw')
        .replace(/(\d+(?:\.\d+)?)vh\b/gi, '$1cqh')
        .replace(/(\d+(?:\.\d+)?)vmin\b/gi, '$1cqw')
        .replace(/(\d+(?:\.\d+)?)vmax\b/gi, '$1cqh');
}

/**
 * Measure the primary plate in iframe-local percentages.
 * getBoundingClientRect() inside a same-origin iframe is relative to the iframe
 * viewport — never subtract the parent host rect (that sends the box off-screen).
 */
function measurePlateBox(iframe: HTMLIFrameElement): ContentBox | null {
    try {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        if (!doc || !win) return null;

        const vw = win.innerWidth || iframe.clientWidth;
        const vh = win.innerHeight || iframe.clientHeight;
        if (vw < 2 || vh < 2) return null;

        const root = doc.getElementById('root');
        if (!root) return null;

        const rootRect = root.getBoundingClientRect();
        const rootArea = Math.max(1, rootRect.width * rootRect.height);

        const idea = root.querySelector<HTMLElement>('[data-idea-visual]');
        if (idea) {
            const r = idea.getBoundingClientRect();
            if (r.width >= 12 && r.height >= 8) {
                const pad = 4;
                return {
                    left: round1(((r.left - pad) / vw) * 100),
                    top: round1(((r.top - pad) / vh) * 100),
                    width: round1(((r.width + pad * 2) / vw) * 100),
                    height: round1(((r.height + pad * 2) / vh) * 100),
                };
            }
        }

        const preferred = root.querySelectorAll<HTMLElement>(
            '[data-idea-visual], .glass-card, .card, .plate, .lower-third, [data-plate], [data-synapix-plate], [class*="glass"], [class*="bento"], [class*="Card"]'
        );
        const nodes = preferred.length
            ? preferred
            : root.querySelectorAll<HTMLElement>(
                  'div, section, article, aside, header, footer, main, p, h1, h2, h3, h4, span, img, canvas, svg'
              );

        type Cand = { left: number; top: number; right: number; bottom: number; score: number };
        const cands: Cand[] = [];

        nodes.forEach((el) => {
            const style = win.getComputedStyle(el);
            if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                parseFloat(style.opacity || '1') < 0.05
            ) {
                return;
            }

            const r = el.getBoundingClientRect();
            if (r.width < 12 || r.height < 12) return;
            if (r.width > vw * 0.92 && r.height > vh * 0.92) return;
            const area = r.width * r.height;
            if (area > rootArea * 0.72) return;

            const hasText = (el.textContent || '').trim().length > 0;
            const hasBg =
                style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                style.backgroundColor !== 'transparent';
            const hasBorder = parseFloat(style.borderWidth || '0') > 0 || style.boxShadow !== 'none';
            const isMedia = el.tagName === 'IMG' || el.tagName === 'CANVAS' || el.tagName === 'SVG';
            const isPlate =
                el.classList.contains('glass-card') ||
                el.hasAttribute('data-plate') ||
                /glass|card|plate|bento|lower/i.test(el.className || '');

            if (!hasText && !hasBg && !hasBorder && !isMedia && !isPlate) return;

            const aspect = r.width / Math.max(1, r.height);
            const stripPenalty = aspect > 4 || aspect < 0.2 ? 0.35 : 1;
            const score =
                area *
                (isPlate ? 5 : 1) *
                (hasBg ? 2.5 : 1) *
                (hasBorder ? 1.4 : 1) *
                (hasText ? 1.3 : 0.55) *
                stripPenalty;

            cands.push({
                left: r.left,
                top: r.top,
                right: r.right,
                bottom: r.bottom,
                score,
            });
        });

        let minL: number;
        let minT: number;
        let maxR: number;
        let maxB: number;

        if (!cands.length) {
            const clip = root.querySelector('.clip') as HTMLElement | null;
            if (!clip) return null;
            const kids = Array.from(clip.children) as HTMLElement[];
            minL = Infinity;
            minT = Infinity;
            maxR = -Infinity;
            maxB = -Infinity;
            let any = false;
            for (const el of kids) {
                const r = el.getBoundingClientRect();
                if (r.width < 4 || r.height < 4) continue;
                any = true;
                minL = Math.min(minL, r.left);
                minT = Math.min(minT, r.top);
                maxR = Math.max(maxR, r.right);
                maxB = Math.max(maxB, r.bottom);
            }
            if (!any) return null;
        } else {
            cands.sort((a, b) => b.score - a.score);
            const primary = cands[0];
            minL = primary.left;
            minT = primary.top;
            maxR = primary.right;
            maxB = primary.bottom;
            for (let i = 1; i < Math.min(cands.length, 4); i++) {
                const c = cands[i];
                if (c.score < primary.score * 0.45) break;
                const overlaps =
                    c.left < maxR + 12 &&
                    c.right > minL - 12 &&
                    c.top < maxB + 12 &&
                    c.bottom > minT - 12;
                if (!overlaps) continue;
                const nextW = Math.max(maxR, c.right) - Math.min(minL, c.left);
                const nextH = Math.max(maxB, c.bottom) - Math.min(minT, c.top);
                if (nextW > vw * 0.55 || nextH > vh * 0.55) continue;
                minL = Math.min(minL, c.left);
                minT = Math.min(minT, c.top);
                maxR = Math.max(maxR, c.right);
                maxB = Math.max(maxB, c.bottom);
            }
        }

        const pad = 4;
        const left = ((minL - pad) / vw) * 100;
        const top = ((minT - pad) / vh) * 100;
        const width = ((maxR - minL + pad * 2) / vw) * 100;
        const height = ((maxB - minT + pad * 2) / vh) * 100;
        if (!Number.isFinite(left) || !Number.isFinite(top) || width < 2 || height < 2) return null;

        return {
            left: round1(left),
            top: round1(top),
            width: round1(width),
            height: round1(height),
        };
    } catch {
        return null;
    }
}

export const RemotionGraphicPlayer: React.FC<RemotionGraphicPlayerProps> = ({
    htmlContent,
    currentTime,
    clipStart,
    clipEnd,
    isFullBroll = false,
    targetRatio = 16 / 9,
    designAspect,
    offsetX = 0,
    offsetY = 0,
    scaleX = 1,
    scaleY = 1,
    interactive = false,
    selected = false,
    onSelect,
    onDeselect,
    onTransformChange,
    onHtmlChange,
}) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const selRef = useRef<HTMLDivElement>(null);
    const [contentBox, setContentBox] = useState<ContentBox | null>(null);
    const [headlineDraft, setHeadlineDraft] = useState('');
    const [keyDraft, setKeyDraft] = useState('');
    const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number } | null>(null);
    const dragRef = useRef<{
        pointerId: number;
        mode: DragMode;
        startClientX: number;
        startClientY: number;
        originX: number;
        originY: number;
        originSX: number;
        originSY: number;
        width: number;
        height: number;
        boxW: number;
        boxH: number;
    } | null>(null);
    const API_URL = getApiUrl();

    const isLandscape = targetRatio >= 1;
    const designW = isLandscape ? 1920 : 1080;
    const designH = isLandscape ? 1080 : 1920;
    const plateMaxW = isFullBroll ? '100%' : isLandscape ? '38%' : '90%';
    const plateMaxH = isFullBroll ? '100%' : isLandscape ? '70%' : '38%';

    const srcDoc = useMemo(() => {
        if (!htmlContent) return '';

        let processedHtml = rewriteViewportUnits(htmlContent)
            .replace(/src=(['"])\/assets\//g, `src=$1${API_URL}/assets/`)
            .replace(/url\((['"]?)\/assets\//g, `url($1${API_URL}/assets/`);

        const scriptBlocks: string[] = [];
        const fragmentWithoutScripts = processedHtml.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, code) => {
            scriptBlocks.push(code);
            return '';
        });

        const deferredScripts = scriptBlocks.map(code => `
try { (function(){ ${code} })(); } catch(e){ console.warn('[RemotionGraphicPlayer]', e); }
`).join('\n');

        const overlayCaps = '';

        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Comfortaa:wght@400;700&family=Inter:wght@400;700;900&family=Manrope:wght@400;700;800&family=Marck+Script&family=Montserrat:wght@400;700;800;900&family=Playfair+Display:ital,wght@0,700;1,700&family=Rubik:wght@400;700;800&family=Unbounded:wght@700;900&display=swap" rel="stylesheet"/>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html {
      --design-w: ${designW}px;
      --design-h: ${designH}px;
    }
    html, body, #root, .clip,
    .min-h-screen, .h-screen, .w-screen, .inset-0,
    [class*="min-h-screen"], [class*="h-screen"], [class*="w-screen"] {
      background: transparent !important;
      background-color: transparent !important;
    }
    #root {
      --plate-max-w: ${plateMaxW};
      --plate-max-h: ${plateMaxH};
      --font-hero-169: 3.2cqw; --font-title-169: 1.9cqw; --font-stat-169: 4.2cqw; --font-body-169: 1.25cqw;
      --font-hero-916: 7.2cqw; --font-title-916: 4.6cqw; --font-stat-916: 9.5cqw; --font-body-916: 2.8cqw;
    }
    .clip {
      --plate-max-w: ${plateMaxW};
      --plate-max-h: ${plateMaxH};
      ${isFullBroll ? 'background: linear-gradient(145deg, #0a0a12 0%, #111827 45%, #0f172a 100%) !important;' : ''}
    }
    ${isFullBroll ? GRAPHIC_CANVAS_FIT_CSS : GRAPHIC_ANTI_CLIP_CSS}
    ${overlayCaps}
  </style>
</head>
<body style="background: transparent !important; background-color: transparent !important;">
  <div id="root" data-canvas-width="${designW}" data-canvas-height="${designH}">
    ${fragmentWithoutScripts}
  </div>
  <script>
    let forceShow = false;
    window.__DESIGN_W = ${designW};
    window.__DESIGN_H = ${designH};
    ${GRAPHIC_FIT_ROOT_SCRIPT}
    ${deferredScripts}
    window.addEventListener('message', function(ev){
      if(!ev.data || ev.data.type !== 'sync_time') return;
      const t = ev.data.time;
      if (typeof scaleRoot === 'function') scaleRoot();
      forceShow = !!ev.data.forceShow;
      const clipStart = ${clipStart};
      const clipEnd = ${clipEnd};
      const clipDur = Math.max(0.15, clipEnd - clipStart);
      const relTime = ev.data.relTime !== undefined ? ev.data.relTime : (t - clipStart);
      const clips = document.querySelectorAll('.clip');
      const inWindow = forceShow || (t >= clipStart - 0.05 && t <= clipEnd + 0.05);
      clips.forEach(function(clip){
        clip.style.opacity = inWindow ? '1' : '0';
        clip.style.visibility = inWindow ? 'visible' : 'hidden';
        if (inWindow) {
          clip.setAttribute('data-start', String(clipStart));
          clip.setAttribute('data-duration', String(clipDur));
        }
      });
      const tls = window.__timelines || {};
      const found = Object.values(tls);
      if(found.length === 0 && window.gsap && window.gsap.globalTimeline){
        found.push(window.gsap.globalTimeline);
      }
      found.forEach(function(tl){
        if(tl && tl.seek){
          tl.pause();
          const tlDur = tl.duration ? tl.duration() : 999;
          if (tlDur > 0 && tlDur <= 120) {
            const exitWindow = Math.min(0.6, Math.max(0.35, tlDur * 0.18));
            const holdAt = Math.max(0, Math.min(tlDur * 0.72, tlDur - 0.7));
            let seekTo = Math.max(0, relTime);
            if (relTime > holdAt && clipDur > tlDur + 0.05) {
              if (relTime < clipDur - exitWindow) {
                seekTo = holdAt;
              } else {
                const p = Math.min(1, Math.max(0, (relTime - (clipDur - exitWindow)) / exitWindow));
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
      try { parent.postMessage({ type: 'graphic_content_updated' }, '*'); } catch(e) {}
    });
    setTimeout(function(){
      try { parent.postMessage({ type: 'graphic_content_updated' }, '*'); } catch(e) {}
    }, 120);
    setTimeout(function(){
      try { parent.postMessage({ type: 'graphic_content_updated' }, '*'); } catch(e) {}
    }, 500);
  </script>
</body>
</html>`;
    }, [htmlContent, API_URL, clipStart, clipEnd, designW, designH, isFullBroll, plateMaxW, plateMaxH]);

    const isActive = currentTime >= clipStart - 0.05 && currentTime <= clipEnd + 0.05;
    const isVisible = isActive || selected;

    const refreshContentBox = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        if (!(currentTime >= clipStart - 0.05 && currentTime <= clipEnd + 0.05) && !selected) return;
        const box = measurePlateBox(iframe);
        if (box) setContentBox(box);
    }, [currentTime, clipStart, clipEnd, selected]);

    const postPlateLayout = useCallback((resetBase = false) => {
        if (/data-idea-visual/.test(htmlContent || '')) return;
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        win.postMessage({ type: 'plate_layout', scaleX, scaleY, resetBase }, '*');
    }, [scaleX, scaleY, htmlContent]);

    useEffect(() => {
        if (!iframeRef.current?.contentWindow) return;
        const relTime = currentTime - clipStart;
        iframeRef.current.contentWindow.postMessage({
            type: 'sync_time',
            time: currentTime,
            relTime: relTime >= 0 ? relTime : 0,
            forceShow: selected || isActive,
        }, '*');
        postPlateLayout(false);
    }, [currentTime, clipStart, selected, isActive, postPlateLayout]);

    useEffect(() => {
        postPlateLayout(true);
        const t = window.setTimeout(() => postPlateLayout(false), 80);
        return () => clearTimeout(t);
    }, [htmlContent, postPlateLayout]);

    useEffect(() => {
        postPlateLayout(false);
        const t = window.setTimeout(() => refreshContentBox(), 40);
        return () => clearTimeout(t);
    }, [scaleX, scaleY, postPlateLayout, refreshContentBox]);

    useEffect(() => {
        const onMsg = (ev: MessageEvent) => {
            if (ev.data?.type === 'graphic_content_updated') {
                requestAnimationFrame(() => {
                    refreshContentBox();
                    requestAnimationFrame(() => refreshContentBox());
                });
            }
        };
        window.addEventListener('message', onMsg);
        return () => window.removeEventListener('message', onMsg);
    }, [refreshContentBox]);

    useEffect(() => {
        if ((!isActive && !selected) || !interactive) return;
        const times = [50, 150, 350, 700, 1200];
        const ids = times.map((ms) => window.setTimeout(refreshContentBox, ms));
        return () => ids.forEach(clearTimeout);
    }, [isActive, selected, interactive, htmlContent, currentTime, refreshContentBox, offsetX, offsetY, scaleX, scaleY]);

    const beginDrag = (e: React.PointerEvent, mode: DragMode, captureEl: HTMLElement) => {
        if (!interactive || !onTransformChange) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect?.();
        refreshContentBox();
        const host = hostRef.current;
        const rect = (host || captureEl).getBoundingClientRect();
        const box = contentBox || { left: 8, top: 8, width: 40, height: 28 };
        dragRef.current = {
            pointerId: e.pointerId,
            mode,
            startClientX: e.clientX,
            startClientY: e.clientY,
            originX: offsetX,
            originY: offsetY,
            originSX: scaleX,
            originSY: scaleY,
            width: rect.width,
            height: rect.height,
            boxW: Math.max(8, box.width),
            boxH: Math.max(8, box.height),
        };
        captureEl.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId || !onTransformChange) return;
        const { width, height, startClientX, startClientY, originX, originY, originSX, originSY, mode, boxW, boxH } = drag;
        if (width <= 0 || height <= 0) return;

        const dxPct = ((e.clientX - startClientX) / width) * 100;
        const dyPct = ((e.clientY - startClientY) / height) * 100;

        if (mode === 'move') {
            onTransformChange({
                offsetX: round1(clamp(originX + dxPct, -45, 45)),
                offsetY: round1(clamp(originY + dyPct, -45, 45)),
                scaleX: originSX,
                scaleY: originSY,
            });
            return;
        }

        const fromLeft = mode === 'resize-L' || mode === 'resize-TL' || mode === 'resize-BL';
        const fromRight = mode === 'resize-R' || mode === 'resize-TR' || mode === 'resize-BR';
        const fromTop = mode === 'resize-T' || mode === 'resize-TL' || mode === 'resize-TR';
        const fromBottom = mode === 'resize-B' || mode === 'resize-BL' || mode === 'resize-BR';
        const affectX = fromLeft || fromRight;
        const affectY = fromTop || fromBottom;
        const signX = fromRight ? 1 : -1;
        const signY = fromBottom ? 1 : -1;
        let nextSX = affectX
            ? round1(clamp(originSX * (1 + (signX * dxPct) / boxW), 0.25, 2.8))
            : originSX;
        let nextSY = affectY
            ? round1(clamp(originSY * (1 + (signY * dyPct) / boxH), 0.25, 2.8))
            : originSY;

        const isCorner = mode === 'resize-TL' || mode === 'resize-TR' || mode === 'resize-BL' || mode === 'resize-BR';
        if (e.shiftKey && isCorner) {
            const dominant = Math.abs(dxPct) >= Math.abs(dyPct) ? nextSX / originSX : nextSY / originSY;
            nextSX = round1(clamp(originSX * dominant, 0.25, 2.8));
            nextSY = round1(clamp(originSY * dominant, 0.25, 2.8));
        }

        // Width grows from the plate's CSS left, so pin the opposite edge via host offset.
        const dw = boxW * (nextSX / Math.max(0.01, originSX) - 1);
        const dh = boxH * (nextSY / Math.max(0.01, originSY) - 1);
        const nextOX = fromLeft ? originX - dw : originX;
        const nextOY = fromTop ? originY - dh : originY;
        onTransformChange({
            offsetX: round1(clamp(nextOX, -80, 80)),
            offsetY: round1(clamp(nextOY, -80, 80)),
            scaleX: nextSX,
            scaleY: nextSY,
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (dragRef.current?.pointerId === e.pointerId) {
            dragRef.current = null;
            try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
            requestAnimationFrame(() => refreshContentBox());
        }
    };

    const handleStyle: React.CSSProperties = {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 3,
        background: '#F97316',
        border: '2px solid #fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
        pointerEvents: 'auto',
        zIndex: 5,
    };

    const box: ContentBox = contentBox || { left: 8, top: 8, width: 40, height: 28 };
    const fullFrameHit = selected && box.width >= 86 && box.height >= 86;

    useEffect(() => {
        if (!selected) return;
        const copy = extractPlateCopy(htmlContent);
        setHeadlineDraft(copy.headline);
        setKeyDraft(copy.key);
    }, [selected, htmlContent]);

    useLayoutEffect(() => {
        if (!selected || !selRef.current) {
            setPanelPos(null);
            return;
        }
        const r = selRef.current.getBoundingClientRect();
        const width = Math.min(360, Math.max(240, r.width));
        let left = r.left + (r.width - width) / 2;
        left = clamp(left, 8, window.innerWidth - width - 8);
        let top = r.bottom + 10;
        if (top + 168 > window.innerHeight) top = Math.max(8, r.top - 172);
        setPanelPos({ left, top, width });
    }, [selected, scaleX, scaleY, offsetX, offsetY, contentBox, headlineDraft, keyDraft]);

    const commitCopy = (headline: string, key: string) => {
        if (!onHtmlChange) return;
        const next = replacePlateCopy(htmlContent, headline, key);
        if (next !== htmlContent) onHtmlChange(next);
    };

    return (
        <div
            ref={hostRef}
            data-graphic-host
            data-design-aspect={designAspect || (isLandscape ? '16:9' : '9:16')}
            className="absolute inset-0"
            style={{
                zIndex: isVisible ? (isFullBroll ? 200 : (selected ? 210 : 100)) : 0,
                display: 'block',
                opacity: isVisible ? 1 : 0,
                background: 'transparent',
                overflow: 'visible',
                pointerEvents: 'none',
                transform: `translate(${offsetX}%, ${offsetY}%)`,
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                className="w-full h-full motion-graphic-iframe"
                data-clip-start={clipStart}
                data-clip-end={clipEnd}
                scrolling="no"
                style={{ border: 'none', background: 'transparent', pointerEvents: 'none', overflow: 'visible', colorScheme: 'normal' }}
                {...({ allowtransparency: "true" } as any)}
                title="Remotion Graphic Overlay"
                onLoad={() => {
                    postPlateLayout(true);
                    window.setTimeout(() => { postPlateLayout(false); refreshContentBox(); }, 80);
                    window.setTimeout(() => { postPlateLayout(false); refreshContentBox(); }, 250);
                    window.setTimeout(refreshContentBox, 600);
                }}
            />

            {interactive && selected && (
                <div
                    data-graphic-deselect
                    className="absolute inset-0"
                    style={{ pointerEvents: 'auto', zIndex: 1 }}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeselect?.();
                    }}
                />
            )}
            {interactive && (
                <div
                    ref={selRef}
                    className="absolute"
                    style={{
                        left: `${box.left}%`,
                        top: `${box.top}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                        pointerEvents: fullFrameHit ? 'none' : 'auto',
                        zIndex: 2,
                        cursor: selected ? 'move' : 'pointer',
                        background: selected ? 'rgba(249,115,22,0.08)' : 'transparent',
                        outline: selected ? '2px solid rgba(249,115,22,0.95)' : '1px solid transparent',
                        outlineOffset: 0,
                        borderRadius: 8,
                        boxSizing: 'border-box',
                    }}
                    onPointerDown={(e) => beginDrag(e, 'move', e.currentTarget)}
                    onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect?.();
                        const input = document.getElementById('graphic-plate-headline') as HTMLInputElement | null;
                        input?.focus();
                        input?.select();
                    }}
                    title={selected ? 'Перетащите · края — ширина/высота · углы — оба · Shift — пропорционально' : 'Кликните, чтобы выбрать графику'}
                >
                    {selected && (
                        <>
                            <div
                                style={{ ...handleStyle, left: -5, top: -5, cursor: 'nwse-resize' }}
                                onPointerDown={(e) => beginDrag(e, 'resize-TL', e.currentTarget)}
                            />
                            <div
                                style={{ ...handleStyle, right: -5, top: -5, cursor: 'nesw-resize' }}
                                onPointerDown={(e) => beginDrag(e, 'resize-TR', e.currentTarget)}
                            />
                            <div
                                style={{ ...handleStyle, left: -5, bottom: -5, cursor: 'nesw-resize' }}
                                onPointerDown={(e) => beginDrag(e, 'resize-BL', e.currentTarget)}
                            />
                            <div
                                style={{ ...handleStyle, right: -5, bottom: -5, cursor: 'nwse-resize' }}
                                onPointerDown={(e) => beginDrag(e, 'resize-BR', e.currentTarget)}
                            />
                            <div
                                style={{ ...handleStyle, left: '50%', top: -5, marginLeft: -6, cursor: 'ns-resize' }}
                                onPointerDown={(e) => beginDrag(e, 'resize-T', e.currentTarget)}
                            />
                            <div
                                style={{ ...handleStyle, left: '50%', bottom: -5, marginLeft: -6, cursor: 'ns-resize' }}
                                onPointerDown={(e) => beginDrag(e, 'resize-B', e.currentTarget)}
                            />
                            <div
                                style={{ ...handleStyle, top: '50%', left: -5, marginTop: -6, cursor: 'ew-resize' }}
                                onPointerDown={(e) => beginDrag(e, 'resize-L', e.currentTarget)}
                            />
                            <div
                                style={{ ...handleStyle, top: '50%', right: -5, marginTop: -6, cursor: 'ew-resize' }}
                                onPointerDown={(e) => beginDrag(e, 'resize-R', e.currentTarget)}
                            />
                            <div
                                className="absolute left-1/2 -translate-x-1/2 -top-5 px-2 py-0.5 rounded text-[9px] font-medium pointer-events-none whitespace-nowrap"
                                style={{ background: 'rgba(0,0,0,0.75)', color: '#fdba74', border: '1px solid rgba(249,115,22,0.4)' }}
                            >
                                {`${Math.round(scaleX * 100)}% × ${Math.round(scaleY * 100)}%`}
                            </div>
                        </>
                    )}
                </div>
            )}

            {selected && interactive && panelPos && typeof document !== 'undefined' && createPortal(
                <div
                    data-graphic-editor
                    style={{
                        position: 'fixed',
                        left: panelPos.left,
                        top: panelPos.top,
                        width: panelPos.width,
                        zIndex: 9999,
                        pointerEvents: 'auto',
                        background: 'rgba(12,12,16,0.94)',
                        border: '1px solid rgba(249,115,22,0.35)',
                        borderRadius: 10,
                        padding: '10px 12px 12px',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div style={{ fontSize: 10, color: '#fdba74', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                        Плашка
                    </div>
                    <label style={{ display: 'block', fontSize: 10, color: '#a1a1aa', marginBottom: 3 }}>Заголовок</label>
                    <input
                        id="graphic-plate-headline"
                        value={headlineDraft}
                        onChange={(e) => setHeadlineDraft(e.target.value)}
                        onBlur={() => commitCopy(headlineDraft, keyDraft)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                commitCopy(headlineDraft, keyDraft);
                                (e.target as HTMLInputElement).blur();
                            }
                        }}
                        style={{
                            width: '100%',
                            marginBottom: 8,
                            background: '#18181b',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 6,
                            color: '#fafafa',
                            fontSize: 13,
                            padding: '6px 8px',
                            outline: 'none',
                        }}
                    />
                    <label style={{ display: 'block', fontSize: 10, color: '#a1a1aa', marginBottom: 3 }}>Ключ</label>
                    <input
                        value={keyDraft}
                        onChange={(e) => setKeyDraft(e.target.value)}
                        onBlur={() => commitCopy(headlineDraft, keyDraft)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                commitCopy(headlineDraft, keyDraft);
                                (e.target as HTMLInputElement).blur();
                            }
                        }}
                        style={{
                            width: '100%',
                            marginBottom: 10,
                            background: '#18181b',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 6,
                            color: '#FACC15',
                            fontSize: 13,
                            padding: '6px 8px',
                            outline: 'none',
                        }}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                        <label style={{ flex: 1, fontSize: 10, color: '#a1a1aa' }}>
                            Ширина {Math.round(scaleX * 100)}%
                            <input
                                type="range"
                                min={25}
                                max={280}
                                value={Math.round(scaleX * 100)}
                                onChange={(e) => onTransformChange?.({
                                    offsetX,
                                    offsetY,
                                    scaleX: Number(e.target.value) / 100,
                                    scaleY,
                                })}
                                style={{ width: '100%', accentColor: '#F97316' }}
                            />
                        </label>
                        <label style={{ flex: 1, fontSize: 10, color: '#a1a1aa' }}>
                            Высота {Math.round(scaleY * 100)}%
                            <input
                                type="range"
                                min={25}
                                max={280}
                                value={Math.round(scaleY * 100)}
                                onChange={(e) => onTransformChange?.({
                                    offsetX,
                                    offsetY,
                                    scaleX,
                                    scaleY: Number(e.target.value) / 100,
                                })}
                                style={{ width: '100%', accentColor: '#F97316' }}
                            />
                        </label>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
