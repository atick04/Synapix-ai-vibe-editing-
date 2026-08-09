"use client";

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";

export interface Background3DRef {
  toggleAudio: () => void;
  playAudio: () => void;
  pauseAudio: () => void;
  loadCustomAudio: (file: File) => void;
  isMuted: boolean;
}

const Background3D = forwardRef<Background3DRef, { onAudioStateChange?: (isPlaying: boolean) => void }>(
  ({ onAudioStateChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const fadeIntervalRef = useRef<any>(null);

    const [isMuted, setIsMuted] = useState<boolean>(true);
    const [audioSourceLoaded, setAudioSourceLoaded] = useState<boolean>(false);

    // 1. Audio Setup & Web Audio Analyser
    useEffect(() => {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.loop = true;
      audio.src = "/background-music.mp3";
      audioRef.current = audio;

      audio.addEventListener("canplaythrough", () => {
        setAudioSourceLoaded(true);
      });

      return () => {
        audio.pause();
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          audioCtxRef.current.close();
        }
      };
    }, []);

    const initAudioContext = () => {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.85;

        if (audioRef.current) {
          try {
            const source = ctx.createMediaElementSource(audioRef.current);
            source.connect(analyser);
            analyser.connect(ctx.destination);
          } catch (e) {
            console.log("MediaElementSource initialized");
          }
        }

        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      }

      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
    };

    // Smooth Audio Volume Fade-In
    const fadeInAudio = (callback?: () => void) => {
      if (!audioRef.current) return;
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      audioRef.current.volume = 0;
      audioRef.current
        .play()
        .then(() => {
          setIsMuted(false);
          if (onAudioStateChange) onAudioStateChange(true);

          let vol = 0;
          fadeIntervalRef.current = setInterval(() => {
            vol += 0.04;
            if (vol >= 1) {
              vol = 1;
              clearInterval(fadeIntervalRef.current);
              if (callback) callback();
            }
            if (audioRef.current) audioRef.current.volume = vol;
          }, 40);
        })
        .catch((err) => console.error("Audio play error:", err));
    };

    // Smooth Audio Volume Fade-Out
    const fadeOutAudio = (callback?: () => void) => {
      if (!audioRef.current) return;
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

      let vol = audioRef.current.volume || 1;
      fadeIntervalRef.current = setInterval(() => {
        vol -= 0.04;
        if (vol <= 0) {
          vol = 0;
          clearInterval(fadeIntervalRef.current);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.volume = 1;
          }
          setIsMuted(true);
          if (onAudioStateChange) onAudioStateChange(false);
          if (callback) callback();
        } else {
          if (audioRef.current) audioRef.current.volume = vol;
        }
      }, 40);
    };

    const toggleAudio = () => {
      initAudioContext();
      if (!audioRef.current) return;

      if (isMuted) {
        if (audioRef.current.currentTime < 1) {
          audioRef.current.currentTime = 57;
        }
        fadeInAudio();
      } else {
        fadeOutAudio();
      }
    };

    const loadCustomAudio = (file: File) => {
      initAudioContext();
      if (!audioRef.current) return;

      const url = URL.createObjectURL(file);
      audioRef.current.src = url;
      audioRef.current.currentTime = 57;
      fadeInAudio();
    };

    useImperativeHandle(ref, () => ({
      toggleAudio,
      playAudio: () => {
        initAudioContext();
        if (audioRef.current) {
          if (audioRef.current.currentTime < 1) {
            audioRef.current.currentTime = 57;
          }
          fadeInAudio();
        }
      },
      pauseAudio: () => {
        fadeOutAudio();
      },
      loadCustomAudio,
      isMuted,
    }));

    // 2. Three.js 3D Background Render Loop
    useEffect(() => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 0, 7.5);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.6;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0x38bdf8, 3.8);
      mainLight.position.set(5, 5, 5);
      scene.add(mainLight);

      const rimLight = new THREE.PointLight(0x06b6d4, 4.8, 25);
      rimLight.position.set(-4, -3, 3);
      scene.add(rimLight);

      // Central 3D Floating Logo Group
      const logoGroup = new THREE.Group();
      scene.add(logoGroup);

      // Backlight Halo for Logo
      const logoHaloLight = new THREE.PointLight(0x38bdf8, 6.5, 14);
      logoHaloLight.position.set(0, 0, -1);
      logoGroup.add(logoHaloLight);

      let logoMesh: THREE.Mesh | null = null;

      // Load Transparent 3D Glass Logo Texture
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = "/synapix-3d-bg.png";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);

          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.generateMipmaps = true;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;

          const aspect = img.width / img.height;
          const planeGeo = new THREE.PlaneGeometry(4.6 * aspect, 4.6, 64, 64);

          // Original 3D Glass Material (Preserves 100% original exact texture colors)
          const logoMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
          });

          logoMesh = new THREE.Mesh(planeGeo, logoMat);
          logoGroup.add(logoMesh);
        }
      };

      // Micro-Dot Particle System
      const dotCanvas = document.createElement("canvas");
      dotCanvas.width = 32;
      dotCanvas.height = 32;
      const dotCtx = dotCanvas.getContext("2d");
      if (dotCtx) {
        const radGrad = dotCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
        radGrad.addColorStop(0, "rgba(255, 255, 255, 1)");
        radGrad.addColorStop(0.3, "rgba(186, 230, 253, 0.75)");
        radGrad.addColorStop(0.7, "rgba(56, 189, 248, 0.3)");
        radGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

        dotCtx.fillStyle = radGrad;
        dotCtx.beginPath();
        dotCtx.arc(16, 16, 16, 0, Math.PI * 2);
        dotCtx.fill();
      }

      const dotTexture = new THREE.CanvasTexture(dotCanvas);
      dotTexture.colorSpace = THREE.SRGBColorSpace;

      const dotCount = 480;
      const dotGeo = new THREE.BufferGeometry();
      const dotPositions = new Float32Array(dotCount * 3);
      const dotSpeeds = new Float32Array(dotCount);
      const dotPhases = new Float32Array(dotCount);

      for (let i = 0; i < dotCount; i++) {
        dotPositions[i * 3] = (Math.random() - 0.5) * 20;
        dotPositions[i * 3 + 1] = (Math.random() - 0.5) * 14;
        dotPositions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 1;

        dotSpeeds[i] = 0.3 + Math.random() * 0.9;
        dotPhases[i] = Math.random() * Math.PI * 2;
      }

      dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPositions, 3));

      const dotMat = new THREE.PointsMaterial({
        size: 0.07,
        map: dotTexture,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const dotField = new THREE.Points(dotGeo, dotMat);
      scene.add(dotField);

      // Mouse Parallax Handling
      let mouseX = 0;
      let mouseY = 0;
      let targetX = 0;
      let targetY = 0;

      const handleMouseMove = (e: MouseEvent) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
      };

      window.addEventListener("mousemove", handleMouseMove);

      const handleResize = () => {
        if (!containerRef.current) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      };

      window.addEventListener("resize", handleResize);

      // Audio Frequency Buffer & Smooth Inertia Speed
      const freqData = new Uint8Array(32);
      let smoothedBass = 0;
      let speedMultiplier = 1.0;

      let animationFrameId: number;
      let _startTime = performance.now();
      const getElapsedTime = () => (performance.now() - _startTime) / 1000;

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const elapsedTime = getElapsedTime();

        // Mouse Parallax
        targetX += (mouseX - targetX) * 0.05;
        targetY += (mouseY - targetY) * 0.05;

        // Audio Reactive Bass Analysis
        let bassValue = 0;
        if (analyserRef.current && audioRef.current && !audioRef.current.paused) {
          analyserRef.current.getByteFrequencyData(freqData);
          let sum = 0;
          for (let b = 0; b < 6; b++) {
            sum += freqData[b];
          }
          bassValue = sum / (6 * 255);
        }

        // Smooth Lerp for Bass Peak Reaction
        smoothedBass += (bassValue - smoothedBass) * 0.2;

        // Smooth Acceleration Inertia lerp (gentle gradual speed up / slow down)
        const targetSpeedMult = (audioRef.current && !audioRef.current.paused) ? (1.15 + smoothedBass * 1.5) : 1.0;
        speedMultiplier += (targetSpeedMult - speedMultiplier) * 0.03;

        // Audio-Reactive Light Intensity Pulse
        logoHaloLight.intensity = 5.5 + smoothedBass * 26.0;
        logoHaloLight.distance = 12.0 + smoothedBass * 8.0;
        rimLight.intensity = 4.0 + smoothedBass * 12.0;

        // Subtle 3D Scale Bump on Bass Hit
        const currentScale = 1.0 + smoothedBass * 0.1;
        logoGroup.scale.set(currentScale, currentScale, currentScale);

        // Logo Floating Motion (Shifted upward to leave clean space for text below)
        logoGroup.position.y = 0.75 + Math.sin(elapsedTime * 0.8 * speedMultiplier) * 0.18;
        logoGroup.position.x = Math.cos(elapsedTime * 0.5 * speedMultiplier) * 0.1 + targetX * 0.4;

        logoGroup.rotation.y = Math.sin(elapsedTime * 0.4 * speedMultiplier) * 0.14 + targetX * 0.3;
        logoGroup.rotation.x = Math.cos(elapsedTime * 0.6 * speedMultiplier) * 0.1 - targetY * 0.3;
        logoGroup.rotation.z = Math.sin(elapsedTime * 0.3 * speedMultiplier) * 0.05;

        // Particles float & spin smoothly with acceleration lerp
        const posAttr = dotGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < dotCount; i++) {
          let y = posAttr.getY(i);
          y += Math.sin(elapsedTime * dotSpeeds[i] * speedMultiplier + dotPhases[i]) * 0.0018 * speedMultiplier;
          posAttr.setY(i, y);
        }
        posAttr.needsUpdate = true;
        dotField.rotation.y = elapsedTime * 0.008 * speedMultiplier;

        renderer.render(scene, camera);
      };

      animate();

      return () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("resize", handleResize);

        dotGeo.dispose();
        dotMat.dispose();

        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
        scene.clear();
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className="fixed inset-0 pointer-events-none -z-10 overflow-hidden opacity-95 transition-opacity duration-1000"
        style={{ filter: "drop-shadow(0 25px 50px rgba(0,0,0,0.6))" }}
      />
    );
  }
);

Background3D.displayName = "Background3D";

export default Background3D;
