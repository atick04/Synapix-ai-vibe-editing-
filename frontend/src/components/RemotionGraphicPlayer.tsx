import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { getApiUrl } from '@/utils/api';

type DragMode = 'move' | 'resize-TL' | 'resize-TR' | 'resize-BL' | 'resize-BR';

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
    onTransformChange?: (next: {
        offsetX: number;
        offsetY: number;
        scaleX: number;
        scaleY: number;
    }) => void;
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
 * Measure the primary plate/card inside the iframe.
 * Prefer the largest card-like node instead of a union of all text nodes
 * (union creates a huge selection box around sparse compositions).
 */
function measureContentBox(iframe: HTMLIFrameElement): ContentBox | null {
    try {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        if (!doc || !win) return null;

        const root = doc.getElementById('root');
        if (!root) return null;

        const iframeRect = iframe.getBoundingClientRect();
        if (iframeRect.width < 2 || iframeRect.height < 2) return null;

        const rootRect = root.getBoundingClientRect();
        const rootArea = Math.max(1, rootRect.width * rootRect.height);

        const preferred = root.querySelectorAll<HTMLElement>(
            '.glass-card, .card, .plate, .lower-third, [data-plate], [data-synapix-plate], [class*="glass"], [class*="bento"], [class*="Card"]'
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
            if (r.width < 16 || r.height < 16) return;
            // Skip full-bleed wrappers
            if (r.width > rootRect.width * 0.92 && r.height > rootRect.height * 0.92) return;
            if (r.width * r.height > rootArea * 0.78) return;

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

            if (!hasText && !hasBg && !hasBorder && !isMedia) return;

            const area = r.width * r.height;
            const score =
                area *
                (isPlate ? 4 : 1) *
                (hasBg ? 2.5 : 1) *
                (hasBorder ? 1.4 : 1) *
                (hasText ? 1.2 : 0.6);

            cands.push({
                left: r.left,
                top: r.top,
                right: r.right,
                bottom: r.bottom,
                score,
            });
        });

        if (!cands.length) return null;

        cands.sort((a, b) => b.score - a.score);
        const primary = cands[0];

        // Merge nearby siblings that clearly belong to the same plate cluster
        let minL = primary.left;
        let minT = primary.top;
        let maxR = primary.right;
        let maxB = primary.bottom;
        const padPx = 48;
        for (let i = 1; i < Math.min(cands.length, 8); i++) {
            const c = cands[i];
            const near =
                c.left < maxR + padPx &&
                c.right > minL - padPx &&
                c.top < maxB + padPx &&
                c.bottom > minT - padPx;
            if (!near) continue;
            // Don't let a far outlier inflate the box past ~55% of the frame
            const nextW = Math.max(maxR, c.right) - Math.min(minL, c.left);
            const nextH = Math.max(maxB, c.bottom) - Math.min(minT, c.top);
            if (nextW > iframeRect.width * 0.62 || nextH > iframeRect.height * 0.78) continue;
            minL = Math.min(minL, c.left);
            minT = Math.min(minT, c.top);
            maxR = Math.max(maxR, c.right);
            maxB = Math.max(maxB, c.bottom);
        }

        const pad = 6;
        minL -= pad;
        minT -= pad;
        maxR += pad;
        maxB += pad;

        const left = ((minL - iframeRect.left) / iframeRect.width) * 100;
        const top = ((minT - iframeRect.top) / iframeRect.height) * 100;
        const width = ((maxR - minL) / iframeRect.width) * 100;
        const height = ((maxB - minT) / iframeRect.height) * 100;

        if (width < 3 || height < 3 || width > 98 || height > 98) return null;

        return {
            left: round1(clamp(left, 0, 97)),
            top: round1(clamp(top, 0, 97)),
            width: round1(clamp(width, 3, 100 - left)),
            height: round1(clamp(height, 3, 100 - top)),
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
    onTransformChange,
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const [contentBox, setContentBox] = useState<ContentBox | null>(null);
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
    } | null>(null);
    const API_URL = getApiUrl();

    // Always match the active preview/export format so plates reflow proportionally
    // (16:9 → ~36% width cards; 9:16 → ~88% width / capped height).
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

        const overlayCaps = isFullBroll
            ? ''
            : `
    .clip .glass-card, .clip .card, .clip .plate, .clip .lower-third,
    .clip [class*="glass"], .clip [class*="bento"], .clip [data-plate], .clip [data-synapix-plate] {
      max-width: min(100%, var(--plate-max-w)) !important;
      max-height: min(100%, var(--plate-max-h)) !important;
      box-sizing: border-box !important;
    }
    .clip > div[style*="position"][style*="absolute"] {
      max-width: min(100%, var(--plate-max-w));
      max-height: min(100%, var(--plate-max-h));
      box-sizing: border-box;
    }`;

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
    html, body { width: 100% !important; height: 100% !important; overflow: hidden !important; background: transparent !important; background-color: transparent !important; color-scheme: dark !important; }
    #root {
      position: absolute; top: 0; left: 0;
      width: ${designW}px; height: ${designH}px;
      transform-origin: top left;
      background: transparent !important; background-color: transparent !important; overflow: hidden;
      container-type: size;
      --plate-max-w: ${plateMaxW};
      --plate-max-h: ${plateMaxH};
      --font-hero-169: 3.2cqw; --font-title-169: 1.9cqw; --font-stat-169: 4.2cqw; --font-body-169: 1.25cqw;
      --font-hero-916: 7.2cqw; --font-title-916: 4.6cqw; --font-stat-916: 9.5cqw; --font-body-916: 2.8cqw;
    }
    .clip {
      position: absolute; inset: 0; width: 100%; height: 100%;
      container-type: size;
      --plate-max-w: ${plateMaxW};
      --plate-max-h: ${plateMaxH};
      ${isFullBroll ? 'background: linear-gradient(145deg, #0a0a12 0%, #111827 45%, #0f172a 100%);' : ''}
    }
    ${overlayCaps}
    #root, #root * {
      word-break: normal;
      overflow-wrap: normal;
      hyphens: none;
    }
  </style>
</head>
<body style="background: transparent !important; background-color: transparent !important;">
  <div id="root" data-canvas-width="${designW}" data-canvas-height="${designH}">
    ${fragmentWithoutScripts}
  </div>
  <script>
    const DESIGN_W = ${designW};
    const DESIGN_H = ${designH};
    function scaleRoot(){
      const r = document.getElementById('root');
      if(!r) return;
      r.style.width = DESIGN_W + 'px';
      r.style.height = DESIGN_H + 'px';
      const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
      r.style.transform = 'scale(' + s + ')';
      const scaledW = DESIGN_W * s, scaledH = DESIGN_H * s;
      r.style.left = ((window.innerWidth - scaledW) / 2) + 'px';
      r.style.top = ((window.innerHeight - scaledH) / 2) + 'px';
    }
    window.addEventListener('resize', scaleRoot);
    scaleRoot();
    ${deferredScripts}
    window.addEventListener('message', function(ev){
      if(!ev.data || ev.data.type !== 'sync_time') return;
      const t = ev.data.time;
      const clipStart = ${clipStart};
      const clipEnd = ${clipEnd};
      const clipDur = Math.max(0.15, clipEnd - clipStart);
      const relTime = ev.data.relTime !== undefined ? ev.data.relTime : (t - clipStart);
      const clips = document.querySelectorAll('.clip');
      const inWindow = t >= clipStart - 0.05 && t <= clipEnd + 0.05;
      clips.forEach(function(clip){
        clip.style.display = inWindow ? 'block' : 'none';
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
  </script>
</body>
</html>`;
    }, [htmlContent, API_URL, clipStart, clipEnd, designW, designH, isFullBroll, plateMaxW, plateMaxH]);

    const isActive = currentTime >= clipStart && currentTime < clipEnd;

    const refreshContentBox = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        if (!(currentTime >= clipStart && currentTime < clipEnd)) return;
        const box = measureContentBox(iframe);
        if (box) setContentBox(box);
    }, [currentTime, clipStart, clipEnd]);

    useEffect(() => {
        if (!iframeRef.current?.contentWindow) return;
        const relTime = currentTime - clipStart;
        iframeRef.current.contentWindow.postMessage({
            type: 'sync_time',
            time: currentTime,
            relTime: relTime >= 0 ? relTime : 0
        }, '*');
    }, [currentTime, clipStart]);

    useEffect(() => {
        const onMsg = (ev: MessageEvent) => {
            if (ev.data?.type === 'graphic_content_updated') {
                requestAnimationFrame(() => refreshContentBox());
            }
        };
        window.addEventListener('message', onMsg);
        return () => window.removeEventListener('message', onMsg);
    }, [refreshContentBox]);

    useEffect(() => {
        if (!isActive || !interactive) return;
        const t1 = window.setTimeout(refreshContentBox, 80);
        const t2 = window.setTimeout(refreshContentBox, 300);
        const t3 = window.setTimeout(refreshContentBox, 700);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [isActive, interactive, htmlContent, currentTime, refreshContentBox, offsetX, offsetY, scaleX, scaleY]);

    const beginDrag = (e: React.PointerEvent, mode: DragMode, captureEl: HTMLElement) => {
        if (!interactive || !onTransformChange) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect?.();
        refreshContentBox();
        const host = hostRef.current;
        const rect = (host || captureEl).getBoundingClientRect();
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
        };
        captureEl.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId || !onTransformChange) return;
        const { width, height, startClientX, startClientY, originX, originY, originSX, originSY, mode } = drag;
        if (width <= 0 || height <= 0) return;

        const dxPct = ((e.clientX - startClientX) / width) * 100;
        const dyPct = ((e.clientY - startClientY) / height) * 100;

        if (mode === 'move') {
            onTransformChange({
                offsetX: round1(clamp(originX + dxPct, -80, 80)),
                offsetY: round1(clamp(originY + dyPct, -80, 80)),
                scaleX: originSX,
                scaleY: originSY,
            });
            return;
        }

        const signX = mode === 'resize-TR' || mode === 'resize-BR' ? 1 : -1;
        const signY = mode === 'resize-BL' || mode === 'resize-BR' ? 1 : -1;
        const sens = contentBox ? Math.max(18, contentBox.width) : 50;
        const nextSX = round1(clamp(originSX + (signX * dxPct) / sens, 0.35, 2.5));
        const nextSY = round1(clamp(originSY + (signY * dyPct) / sens, 0.35, 2.5));

        // Uniform scale by default (keeps plate proportions). Hold Alt for free stretch.
        if (!e.altKey) {
            const dominant = Math.abs(dxPct) >= Math.abs(dyPct) ? nextSX : nextSY;
            const avg = round1(clamp(dominant, 0.35, 2.5));
            onTransformChange({ offsetX: originX, offsetY: originY, scaleX: avg, scaleY: avg });
        } else {
            onTransformChange({ offsetX: originX, offsetY: originY, scaleX: nextSX, scaleY: nextSY });
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (dragRef.current?.pointerId === e.pointerId) {
            dragRef.current = null;
            try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch {}
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

    const box: ContentBox = contentBox || { left: 4, top: 6, width: 32, height: 42 };
    const originX = box.left + box.width / 2;
    const originY = box.top + box.height / 2;
    const uniform = Math.abs(scaleX - scaleY) < 0.02;

    return (
        <div
            ref={hostRef}
            data-graphic-host
            data-design-aspect={designAspect || (isLandscape ? '16:9' : '9:16')}
            className="absolute inset-0 overflow-visible"
            style={{
                zIndex: isFullBroll ? 200 : (selected ? 210 : 100),
                display: isActive ? 'block' : 'none',
                background: 'transparent',
                maxWidth: '100%',
                maxHeight: '100%',
                pointerEvents: 'none',
                transform: `translate(${offsetX}%, ${offsetY}%) scale(${scaleX}, ${scaleY})`,
                transformOrigin: `${originX}% ${originY}%`,
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                className="w-full h-full motion-graphic-iframe"
                style={{ border: 'none', background: 'transparent', pointerEvents: 'none' }}
                {...({ allowtransparency: "true" } as any)}
                title="Remotion Graphic Overlay"
                onLoad={() => {
                    window.setTimeout(refreshContentBox, 100);
                    window.setTimeout(refreshContentBox, 400);
                }}
            />

            {interactive && (
                <div
                    className="absolute"
                    style={{
                        left: `${box.left}%`,
                        top: `${box.top}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                        pointerEvents: 'auto',
                        cursor: selected ? 'move' : 'pointer',
                        background: selected ? 'rgba(249,115,22,0.08)' : 'transparent',
                        outline: selected ? '2px solid rgba(249,115,22,0.95)' : '1px solid transparent',
                        outlineOffset: 0,
                        borderRadius: 8,
                        boxSizing: 'border-box',
                    }}
                    onPointerDown={(e) => beginDrag(e, 'move', e.currentTarget)}
                    title={selected ? 'Перетащите · углы — размер (Alt — свободно)' : 'Кликните, чтобы выбрать графику'}
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
                                className="absolute left-1/2 -translate-x-1/2 -top-5 px-2 py-0.5 rounded text-[9px] font-medium pointer-events-none whitespace-nowrap"
                                style={{ background: 'rgba(0,0,0,0.75)', color: '#fdba74', border: '1px solid rgba(249,115,22,0.4)' }}
                            >
                                {uniform
                                    ? `${Math.round(scaleX * 100)}%`
                                    : `${Math.round(scaleX * 100)}% × ${Math.round(scaleY * 100)}%`}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
