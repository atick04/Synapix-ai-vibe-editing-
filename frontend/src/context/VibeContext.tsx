import React, { createContext, useContext, ReactNode } from "react";
import { VibeConfig } from "@/types/vibe";

export const VIBE_THEMES: Record<string, VibeConfig> = {
  cyber_noir: {
    themeName: "cyber_noir",
    global: {
      fontFamily: "'Outfit', 'Inter', sans-serif",
      backgroundColor: "rgba(8, 8, 12, 0.5)",
      pacingMultiplier: 1.1,
    },
    palette: {
      primary: "#F8FAFC", // Sleek white
      secondary: "#94A3B8", // Cool slate
      cardBg: "rgba(15, 23, 42, 0.45)", // Deep translucent slate
      border: "rgba(56, 189, 248, 0.4)", // Cyber sky-blue border
      glow: "rgba(56, 189, 248, 0.15)", // Soft sky-blue glow
    },
    physics: {
      mass: 0.8,
      stiffness: 280,
      damping: 22,
    },
    threeJsEnv: {
      geometryType: "grid",
      materialStyle: "matte",
      lightIntensity: 1.5,
      cameraMotion: "orbit",
    },
    lottieStyle: {
      lineThickness: 2.0,
      glowIntensity: "10px",
      particleType: "circles",
    },
  },
  acid_pop: {
    themeName: "acid_pop",
    global: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      backgroundColor: "rgba(15, 7, 28, 0.5)",
      pacingMultiplier: 1.3,
    },
    palette: {
      primary: "#FDF4FF",
      secondary: "#E9D5FF",
      cardBg: "rgba(24, 12, 44, 0.45)", // Translucent deep violet
      border: "rgba(217, 70, 239, 0.5)", // Bright magenta border
      glow: "rgba(217, 70, 239, 0.2)", // Soft magenta glow
    },
    physics: {
      mass: 0.9,
      stiffness: 350,
      damping: 20,
    },
    threeJsEnv: {
      geometryType: "torus_knot",
      materialStyle: "glass", // Glass refractive TorusKnot
      lightIntensity: 2.0,
      cameraMotion: "music_pulse",
    },
    lottieStyle: {
      lineThickness: 3.0,
      glowIntensity: "14px",
      particleType: "circles",
    },
  },
  minimal_luxury: {
    themeName: "minimal_luxury",
    global: {
      fontFamily: "'Playfair Display', serif",
      backgroundColor: "rgba(10, 10, 10, 0.6)",
      pacingMultiplier: 0.9,
    },
    palette: {
      primary: "#FAF9F6", // Warm alabaster
      secondary: "#D4D4D8", // Light warm gray
      cardBg: "rgba(20, 20, 20, 0.5)", // Semi-translucent obsidian
      border: "rgba(212, 163, 89, 0.35)", // Champagne gold border
      glow: "rgba(212, 163, 89, 0.12)", // Golden amber glow
    },
    physics: {
      mass: 1.1,
      stiffness: 160,
      damping: 32,
    },
    threeJsEnv: {
      geometryType: "chroma_spheres",
      materialStyle: "glossy_metal", // Glossy gold metal spheres
      lightIntensity: 1.6,
      cameraMotion: "float",
    },
    lottieStyle: {
      lineThickness: 1.5,
      glowIntensity: "8px",
      particleType: "circles",
    },
  },
  cozy_lofi: {
    themeName: "cozy_lofi",
    global: {
      fontFamily: "'Quicksand', sans-serif",
      backgroundColor: "rgba(253, 251, 247, 0.6)",
      pacingMultiplier: 1.0,
    },
    palette: {
      primary: "#292524", // Warm charcoal
      secondary: "#78716C", // Soft stone gray
      cardBg: "rgba(255, 255, 255, 0.75)", // Highly translucent cream-white
      border: "rgba(224, 204, 190, 0.7)", // Warm sand-border
      glow: "rgba(224, 204, 190, 0.25)", // Gentle sand glow
    },
    physics: {
      mass: 1.0,
      stiffness: 200,
      damping: 26,
    },
    threeJsEnv: {
      geometryType: "grid",
      materialStyle: "matte",
      lightIntensity: 1.2,
      cameraMotion: "float",
    },
    lottieStyle: {
      lineThickness: 2.0,
      glowIntensity: "8px",
      particleType: "circles",
    },
  },
};

export const DEFAULT_VIBE_CONFIG = VIBE_THEMES.cyber_noir;

interface VibeContextType {
  vibeConfig: VibeConfig;
  setVibeConfigByTheme: (themeName: string) => void;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

export function VibeProvider({
  children,
  currentConfig,
}: {
  children: ReactNode;
  currentConfig?: Partial<VibeConfig> | null;
}) {
  const [config, setConfig] = React.useState<VibeConfig>(DEFAULT_VIBE_CONFIG);

  React.useEffect(() => {
    if (currentConfig) {
      const baseTheme = VIBE_THEMES[currentConfig.themeName || ""] || DEFAULT_VIBE_CONFIG;
      // Deep merge currentConfig onto baseTheme
      setConfig({
        themeName: currentConfig.themeName || baseTheme.themeName,
        global: { ...baseTheme.global, ...currentConfig.global },
        palette: { ...baseTheme.palette, ...currentConfig.palette },
        physics: { ...baseTheme.physics, ...currentConfig.physics },
        threeJsEnv: { ...baseTheme.threeJsEnv, ...currentConfig.threeJsEnv },
        lottieStyle: { ...baseTheme.lottieStyle, ...currentConfig.lottieStyle },
      });
    }
  }, [currentConfig]);

  const setVibeConfigByTheme = (themeName: string) => {
    const selected = VIBE_THEMES[themeName];
    if (selected) {
      setConfig(selected);
    }
  };

  return (
    <VibeContext.Provider value={{ vibeConfig: config, setVibeConfigByTheme }}>
      {children}
    </VibeContext.Provider>
  );
}

export function useVibe() {
  const context = useContext(VibeContext);
  if (context === undefined) {
    throw new Error("useVibe must be used within a VibeProvider");
  }
  return context;
}
