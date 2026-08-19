import React, { useEffect, useRef, useMemo } from 'react';
import { useVideoConfig, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { Lottie } from '@remotion/lottie';
import arrowPulseAnimation from './assets/arrow_pulse.json';

interface Props {
  vibeConfig?: any;
  sceneData?: any;
  // Fallbacks for standard motion graphics
  styleType?: 'cinematic' | 'blueprint' | 'liquid' | 'custom';
  text?: string;
  subtext?: string;
  accentColor?: string;
}

export const ThreeComposition: React.FC<Props> = ({
  vibeConfig,
  sceneData,
  styleType = 'cinematic',
  text = '',
  subtext = '',
  accentColor = '#f59e0b',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;

  // Resolve VibeConfig
  const resolvedVibe = useMemo(() => {
    if (vibeConfig) return vibeConfig;
    
    // Fallback presets based on legacy styleType
    const presets: Record<string, any> = {
      blueprint: {
        themeName: "cyber_noir",
        global: { fontFamily: "'Outfit', 'Inter', sans-serif", backgroundColor: "transparent", pacingMultiplier: 1.1 },
        palette: { primary: "#F8FAFC", secondary: "#94A3B8", cardBg: "rgba(15, 23, 42, 0.45)", border: "rgba(56, 189, 248, 0.4)", glow: "rgba(56, 189, 248, 0.15)" },
        physics: { mass: 0.8, stiffness: 280, damping: 22 },
        threeJsEnv: { geometryType: "grid", materialStyle: "matte", cameraMotion: "orbit" },
        lottieStyle: { lineThickness: 2.0, glowIntensity: "10px" }
      },
      liquid: {
        themeName: "acid_pop",
        global: { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", backgroundColor: "transparent", pacingMultiplier: 1.3 },
        palette: { primary: "#FDF4FF", secondary: "#E9D5FF", cardBg: "rgba(24, 12, 44, 0.45)", border: "rgba(217, 70, 239, 0.5)", glow: "rgba(217, 70, 239, 0.2)" },
        physics: { mass: 0.9, stiffness: 350, damping: 20 },
        threeJsEnv: { geometryType: "torus_knot", materialStyle: "glass", cameraMotion: "music_pulse" },
        lottieStyle: { lineThickness: 3.0, glowIntensity: "14px" }
      },
      cinematic: {
        themeName: "minimal_luxury",
        global: { fontFamily: "'Playfair Display', serif", backgroundColor: "transparent", pacingMultiplier: 0.9 },
        palette: { primary: "#FAF9F6", secondary: "#D4D4D8", cardBg: "rgba(20, 20, 20, 0.5)", border: "rgba(212, 163, 89, 0.35)", glow: "rgba(212, 163, 89, 0.12)" },
        physics: { mass: 1.1, stiffness: 160, damping: 32 },
        threeJsEnv: { geometryType: "chroma_spheres", materialStyle: "glossy_metal", cameraMotion: "float" },
        lottieStyle: { lineThickness: 1.5, glowIntensity: "8px" }
      }
    };
    return presets[styleType] || presets.cinematic;
  }, [vibeConfig, styleType]);

  const { palette, threeJsEnv, lottieStyle } = resolvedVibe;

  // Initialize Three.js WebGL background scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Scene setup
    const scene = new THREE.Scene();
    
    // Add lighting for glossy metal / glass materials
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    
    // 2. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true, // keeps background transparent
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);

    // 3. Resolve geometry and material based on threeJsEnv
    const geomType = threeJsEnv.geometryType;
    const matStyle = threeJsEnv.materialStyle;
    const cameraMotion = threeJsEnv.cameraMotion;

    const actualGeom = (geomType === 'torus_knot') ? 'torusKnot'
                     : (geomType === 'chroma_spheres') ? 'sphere'
                     : (geomType === 'fluid') ? 'tunnel'
                     : (geomType === 'particles' || geomType === 'dna' || geomType === 'points')
                       ? 'torusKnot'
                       : geomType;

    const themeColor = new THREE.Color(palette.border || accentColor);

    // Camera setup based on geometry
    if (actualGeom === 'tunnel') {
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, -10);
    } else if (actualGeom === 'grid') {
      camera.position.set(0, 2, 4);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(0, 0, 4.5);
      camera.lookAt(0, 0, 0);
    }

    // Build Geometry
    let geometry: THREE.BufferGeometry;
    if (actualGeom === 'cube') {
      geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    } else if (actualGeom === 'sphere') {
      geometry = new THREE.SphereGeometry(0.9, 24, 24);
    } else if (actualGeom === 'torus') {
      geometry = new THREE.TorusGeometry(0.8, 0.25, 12, 48);
    } else if (actualGeom === 'torusKnot') {
      geometry = new THREE.TorusKnotGeometry(0.8, 0.28, 100, 16);
    } else if (actualGeom === 'tunnel') {
      geometry = new THREE.CylinderGeometry(1.0, 1.0, 15, 16, 20, true);
    } else if (actualGeom === 'grid') {
      const gridHelper = new THREE.GridHelper(8, 16, themeColor, themeColor);
      gridHelper.position.y = -1.0;
      (gridHelper.material as THREE.Material).transparent = true;
      (gridHelper.material as THREE.Material).opacity = 0.5;
      scene.add(gridHelper);
      geometry = new THREE.BufferGeometry();
    } else {
      geometry = new THREE.TorusKnotGeometry(0.8, 0.28, 100, 16);
    }

    // Build Material
    let material: THREE.Material;
    if (matStyle === 'glossy_metal') {
      material = new THREE.MeshStandardMaterial({
        color: themeColor,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.85,
      });
    } else if (matStyle === 'glass') {
      material = new THREE.MeshPhysicalMaterial({
        color: themeColor,
        roughness: 0.15,
        transmission: 0.9,
        thickness: 1.0,
        transparent: true,
        opacity: 0.75,
      });
    } else if (matStyle === 'matte') {
      material = new THREE.MeshLambertMaterial({
        color: themeColor,
        transparent: true,
        opacity: 0.8,
      });
    } else {
      material = new THREE.MeshBasicMaterial({
        color: themeColor,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
      });
    }

    // Add Mesh to Scene
    let mesh3d: THREE.Object3D | null = null;
    if (actualGeom !== 'grid') {
      mesh3d = new THREE.Mesh(geometry, material);
      if (actualGeom === 'tunnel') {
        mesh3d.rotation.x = Math.PI / 2;
      }
      scene.add(mesh3d);
    }

    // Update animations for the specific frame
    const speed = 1.0;
    const animFrame = frame * speed;

    if (mesh3d) {
      if (cameraMotion === 'rotate' || cameraMotion === 'orbit') {
        mesh3d.rotation.y = animFrame * 0.02;
        mesh3d.rotation.x = animFrame * 0.01;
      } else if (cameraMotion === 'pulse' || cameraMotion === 'music_pulse') {
        const s = 1.0 + Math.sin(animFrame * 0.08) * 0.15;
        mesh3d.scale.set(s, s, s);
        mesh3d.rotation.y = animFrame * 0.01;
      } else if (actualGeom === 'tunnel') {
        mesh3d.position.z = (animFrame * 0.08) % 15 - 7.5;
      }
    }

    // Camera motion setup
    if (cameraMotion === 'orbit') {
      camera.position.x = Math.sin(animFrame * 0.015) * 4.5;
      camera.position.z = Math.cos(animFrame * 0.015) * 4.5;
      camera.lookAt(0, 0, 0);
    } else if (cameraMotion === 'float') {
      camera.position.y = Math.sin(animFrame * 0.02) * 0.4;
      camera.position.z = 4.5 + Math.cos(animFrame * 0.01) * 0.3;
      camera.lookAt(0, 0, 0);
    } else if (cameraMotion === 'music_pulse' || cameraMotion === 'pulse') {
      const pulseVal = 1.0 + Math.sin(animFrame * 0.08) * 0.12;
      camera.position.z = 4.5 * pulseVal;
      camera.lookAt(0, 0, 0);
    } else if (cameraMotion === 'static') {
      camera.position.set(0, 0, 4.5);
      camera.lookAt(0, 0, 0);
    } else if (actualGeom === 'grid') {
      camera.position.x = Math.sin(animFrame * 0.01) * 3;
      camera.position.z = Math.cos(animFrame * 0.01) * 3;
      camera.lookAt(0, 0, 0);
    }

    // Render frame
    renderer.render(scene, camera);

    // Cleanup
    return () => {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [frame, width, height, resolvedVibe, accentColor]);

  // If rendering a full-frame semantic scene layout
  if (sceneData) {
    const entities = sceneData.entities || [];
    const relations = sceneData.relations || [];
    const sceneTemplate = sceneData.scene_template || "concept_explainer";

    const headline = entities.find((e: any) => e.type === "headline");
    const contentCards = entities.filter((e: any) => e.type !== "headline" && e.type !== "navbar");
    const isSplit = sceneData.layout === 'split' || sceneData.scene_template === 'split';

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: 'transparent' }}>
        {/* Three.js canvas layer */}
        <canvas ref={canvasRef} style={{ position: 'absolute', top: isSplit ? '50%' : 0, left: 0, width: '100%', height: isSplit ? '50%' : '100%' }} />

        <div style={{
          position: 'absolute',
          top: isSplit ? '50%' : 0,
          left: 0,
          width: '100%',
          height: isSplit ? '50%' : '100%',
          pointerEvents: 'none'
        }}>
          {/* SVG connection lines with glow */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <filter id="remotion-neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={parseFloat(lottieStyle?.glowIntensity || '12px')} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {relations.map((rel: any, idx: number) => {
            const fromEnt = entities.find((e: any) => e.id === rel.from);
            const toEnt = entities.find((e: any) => e.id === rel.to);
            if (!fromEnt || !toEnt) return null;

            const delay = rel.animation?.delay || 0.5;
            if (t < delay) return null;

            const fx = fromEnt.x;
            const fy = fromEnt.y;
            const tx = toEnt.x;
            const ty = toEnt.y;
            
            const controlY = fy + (ty - fy) * 0.4;
            const pathD = `M ${fx}% ${fy}% C ${fx}% ${controlY}%, ${tx}% ${controlY}%, ${tx}% ${ty}%`;

            return (
              <g key={`remotion-rel-line-${idx}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={palette.glow}
                  strokeWidth={(lottieStyle?.lineThickness || 2.5) + 3}
                  filter="url(#remotion-neon-glow)"
                  style={{ opacity: 0.6 }}
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={palette.primary}
                  strokeWidth={lottieStyle?.lineThickness || 2.5}
                />
              </g>
            );
          })}
        </svg>

        {/* Lottie Arrow Contact Point Burst Animations */}
        {relations.map((rel: any, idx: number) => {
          const toEnt = entities.find((e: any) => e.id === rel.to);
          if (!toEnt) return null;
          const delay = rel.animation?.delay || 0.5;
          if (t < delay) return null;

          return (
            <div
              key={`remotion-lottie-${idx}`}
              style={{
                position: 'absolute',
                left: `${toEnt.x}%`,
                top: `${toEnt.y}%`,
                width: '60px',
                height: '60px',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <Lottie animationData={arrowPulseAnimation} />
            </div>
          );
        })}

        {/* Headline overlay */}
        {headline && (
          <div
            style={{
              position: 'absolute',
              left: `${headline.x}%`,
              top: `${headline.y}%`,
              width: '90%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              fontFamily: resolvedVibe.global.fontFamily,
            }}
          >
            <h1
              style={{
                color: palette.primary,
                textShadow: `0 0 12px ${palette.glow}`,
                fontSize: '48px',
                fontWeight: 900,
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '2px',
              }}
            >
              {headline.text}
            </h1>
          </div>
        )}

        {/* Content Cards */}
        {sceneTemplate === "feature_grid" ? (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '54%',
              transform: 'translate(-50%, -46%)',
              width: '86%',
              height: '56%',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}
          >
            {contentCards.map((card: any, idx: number) => (
              <div
                key={`remotion-bento-${idx}`}
                style={{
                  backgroundColor: palette.cardBg,
                  borderColor: palette.border,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  boxShadow: `0 0 16px ${palette.glow}`,
                  borderRadius: '20px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '12px',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '12px', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    backgroundColor: palette.border,
                    fontSize: '20px'
                  }}
                >
                  {card.icon || "⚡"}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: palette.primary, fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {card.text}
                    </span>
                    <span style={{ color: palette.secondary, fontSize: '10px' }}>· сейчас</span>
                  </div>
                  <p style={{ color: palette.secondary, fontSize: '11px', margin: '2px 0 0 0', lineHeight: 1.3, opacity: 0.85 }}>
                    {card.desc || "Изменение успешно применено и зафиксировано на таймлайне."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          contentCards.map((card: any, idx: number) => {
            const delay = card.animation?.delay || 0.25;
            if (t < delay) return null;

            // Simple spring scale animation
            const elapsedSinceStart = t - delay;
            const scale = Math.min(1.0, elapsedSinceStart * 3.5); // Fast pop in

            return (
              <div
                key={`remotion-card-${idx}`}
                style={{
                  position: 'absolute',
                  left: `${card.x}%`,
                  top: `${card.y}%`,
                  width: `${card.width || 32}%`,
                  height: `${card.height || 14}%`,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  backgroundColor: palette.cardBg,
                  borderColor: palette.border,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  boxShadow: `0 8px 32px ${palette.glow}`,
                  borderRadius: '20px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '12px',
                  fontFamily: resolvedVibe.global.fontFamily,
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '12px', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    backgroundColor: palette.border,
                    fontSize: '20px'
                  }}
                >
                  {card.icon || "⚡"}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: palette.primary, fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {card.text}
                    </span>
                    <span style={{ color: palette.secondary, fontSize: '10px' }}>· сейчас</span>
                  </div>
                  <p style={{ color: palette.secondary, fontSize: '11px', margin: '2px 0 0 0', lineHeight: 1.3, opacity: 0.85 }}>
                    {card.desc || "Изменение успешно применено и зафиксировано на таймлайне."}
                  </p>
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>
    );
  }

  // Fallback for standard motion graphics titles
  const textOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '15%',
    width: '90%',
    textAlign: 'center',
    fontFamily: resolvedVibe.global.fontFamily,
    color: palette.primary,
    zIndex: 10,
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: 'transparent' }}>
      {/* 3D WebGL Canvas Layer */}
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

      {/* Typography Overlay Layer */}
      <div style={textOverlayStyle}>
        <h1 style={{
          fontSize: '72px',
          fontWeight: 900,
          margin: 0,
          letterSpacing: '-1px',
          lineHeight: 1.1,
          textShadow: `0 8px 30px ${palette.glow}`,
          textTransform: 'uppercase',
        }}>
          {text}
        </h1>
        {subtext && (
          <p style={{
            fontSize: '28px',
            fontWeight: 500,
            margin: '12px 0 0 0',
            opacity: 0.8,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: palette.secondary,
            textShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}>
            {subtext}
          </p>
        )}
      </div>
    </div>
  );
};

export const HtmlGraphicsComposition: React.FC<{ htmlContent: string; clipStart?: number }> = ({ htmlContent, clipStart = 0 }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const srcDoc = useMemo(() => {
    if (!htmlContent) return '';
    // Inject standard web libraries and transparency styles
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
    html, body {
      width: 100% !important; height: 100% !important;
      overflow: visible !important;
      background: transparent !important; background-color: transparent !important;
    }
    #root, .clip {
      position: absolute !important; inset: 0 !important;
      width: 100% !important; height: 100% !important;
      overflow: visible !important; container-type: size;
    }
    .clip .glass-card, .clip .card, .clip .plate, .clip [data-plate] {
      overflow: visible !important;
      max-width: none !important;
      max-height: none !important;
      white-space: normal !important;
    }
    .clip .glass-card *, .clip [data-plate] * {
      overflow: visible !important;
      white-space: normal !important;
      overflow-wrap: normal !important;
      word-break: normal !important;
    }
  </style>
</head>
<body style="background: transparent !important; background-color: transparent !important;">
  <div id="root">
    ${htmlContent}
  </div>
  <script>
    function scaleRoot(){
      const r=document.getElementById('root');
      if(!r)return;
      r.style.width='100%';
      r.style.height='100%';
      r.style.left='0';
      r.style.top='0';
      r.style.transform='none';
      r.style.overflow='visible';
      r.style.zoom='';
    }
    window.addEventListener('resize',scaleRoot);
    scaleRoot();

    window.addEventListener('message', (event) => {
      if (event.data && (event.data.type === 'sync_time' || event.data.type === 'sync_scene')) {
        const time = event.data.time;
        const relTime = event.data.relTime !== undefined ? event.data.relTime : time;
        const tls = window.__timelines || {};
        const found = Object.values(tls);
        if (found.length === 0 && window.gsap && window.gsap.globalTimeline) {
          found.push(window.gsap.globalTimeline);
        }
        found.forEach((tl) => {
          if (tl && tl.seek) {
            tl.pause();
            const tlDur = tl.duration ? tl.duration() : 999;
            if (tlDur > 0 && tlDur <= 60) {
              tl.seek(Math.max(0, relTime));
            } else {
              tl.seek(time);
            }
          }
        });
      }
    });
  </script>
  <style>
    html, body, #root, .clip { background: transparent !important; background-color: transparent !important; }
  </style>
</body>
</html>`;
  }, [htmlContent, designW, designH]);

  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      const relTime = t - clipStart;
      iframeRef.current.contentWindow.postMessage({ type: 'sync_time', time: t, relTime: relTime >= 0 ? relTime : 0 }, '*');
    }
  }, [frame, t, clipStart]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: 'transparent',
        backgroundColor: 'transparent',
      }}
      allowTransparency={true}
    />
  );
};
