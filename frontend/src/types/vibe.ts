export interface VibeConfig {
  themeName: string;
  global: {
    fontFamily: string;
    backgroundColor: string;
    pacingMultiplier: number;
  };
  palette: {
    primary: string;
    secondary: string;
    cardBg: string;
    border: string;
    glow: string;
  };
  physics: {
    mass: number;
    stiffness: number;
    damping: number;
  };
  threeJsEnv: {
    geometryType: 'grid' | 'particles' | 'fluid' | 'chroma_spheres' | 'torus_knot';
    materialStyle: 'wireframe' | 'glossy_metal' | 'glass' | 'matte' | 'points';
    lightIntensity: number;
    cameraMotion: 'orbit' | 'float' | 'music_pulse' | 'static';
  };
  lottieStyle: {
    lineThickness: number;
    glowIntensity: string;
    particleType: 'circles' | 'squares' | 'crosses';
  };
}
