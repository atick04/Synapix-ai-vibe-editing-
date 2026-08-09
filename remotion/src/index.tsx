import { registerRoot, Composition } from 'remotion';
import { ThreeComposition, HtmlGraphicsComposition } from './Composition';
import React from 'react';

const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="CinematicDark"
        component={ThreeComposition}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          styleType: "cinematic",
          text: "CINEMATIC OVERLAY",
          subtext: "PREMIUM LOOK",
          accentColor: "#f59e0b"
        }}
      />
      <Composition
        id="TechBlueprint"
        component={ThreeComposition}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          styleType: "blueprint",
          text: "TECH BLUEPRINT V1",
          subtext: "GRID INITIALIZED",
          accentColor: "#06b6d4"
        }}
      />
      <Composition
        id="LiquidOrganic"
        component={ThreeComposition}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          styleType: "liquid",
          text: "LIQUID FLOW",
          subtext: "DYNAMIC ENERGY",
          accentColor: "#ec4899"
        }}
      />
      <Composition
        id="ThreeScene"
        component={ThreeComposition}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          styleType: "cinematic",
          text: "SYNAPIX 3D GRAPHICS",
          subtext: "WEBGL POWERED",
          accentColor: "#a78bfa"
        }}
      />
      <Composition
        id="SemanticScene"
        component={ThreeComposition}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          styleType: "custom",
          vibeConfig: null,
          sceneData: null
        }}
      />
      <Composition
        id="HtmlGraphicsScene"
        component={HtmlGraphicsComposition}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          htmlContent: ""
        }}
      />
    </>
  );
};

registerRoot(Root);
