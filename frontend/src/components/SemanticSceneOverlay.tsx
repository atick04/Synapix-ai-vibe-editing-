import React, { useMemo } from "react";
import { useVibe } from "@/context/VibeContext";
import { AnimatedList } from "@/components/magicui/AnimatedList";
import { BentoGrid, BentoCard } from "@/components/magicui/BentoGrid";
import { Meteors } from "./magicui/Meteors";
import { Confetti } from "./magicui/Confetti";
import { BlurFade } from "./magicui/BlurFade";
import {
  RainbowButton,
  ShimmerButton,
  RippleButton,
  SafariMock,
  IPhoneMock,
  TextHighlighter,
  AuroraText,
  TypingAnimation,
  HyperText,
  WordRotate,
  SparklesText,
} from "./magicui/MagicDecorations";

export interface SemanticSceneOverlayProps {
  sceneData: any;
  sceneTime: number; // Time elapsed since scene start
  sceneDuration: number;
}

export function SemanticSceneOverlay({
  sceneData,
  sceneTime,
  sceneDuration,
}: {
  sceneData: any;
  sceneTime: number;
  sceneDuration: number;
}) {
  const { vibeConfig } = useVibe();
  const { palette, lottieStyle } = vibeConfig;

  const entities = sceneData?.entities || [];
  const relations = sceneData?.relations || [];
  const sceneTemplate = sceneData?.scene_template || "concept_explainer";

  // Distinguish headline from standard cards
  const headline = useMemo(() => entities.find((e: any) => e.type === "headline"), [entities]);
  const contentCards = useMemo(() => entities.filter((e: any) => e.type !== "headline" && e.type !== "navbar"), [entities]);

  const renderSimpleCard = (card: any) => {
    if (card.type === "rainbow_button" || card.type === "rainbow") {
      return <div className="w-full flex justify-center pointer-events-auto"><RainbowButton>{card.text}</RainbowButton></div>;
    }
    if (card.type === "shimmer_button" || card.type === "shimmer") {
      return <div className="w-full flex justify-center pointer-events-auto"><ShimmerButton>{card.text}</ShimmerButton></div>;
    }
    if (card.type === "ripple_button" || card.type === "ripple") {
      return <div className="w-full flex justify-center pointer-events-auto"><RippleButton>{card.text}</RippleButton></div>;
    }
    if (card.type === "highlight" || card.type === "text_highlighter") {
      return <div className="w-full text-center"><TextHighlighter color={palette.glow}>{card.text}</TextHighlighter></div>;
    }
    
    return (
      <div
        style={{
          fontFamily: vibeConfig.global.fontFamily,
          backgroundColor: palette.cardBg,
          borderColor: palette.border,
          boxShadow: `0 8px 32px ${palette.glow}`,
          backdropFilter: "blur(12px)",
        }}
        className="p-3.5 rounded-[20px] border flex flex-row items-center gap-3 w-full h-full pointer-events-auto transition-all duration-300 text-left"
      >
        <div 
          className="flex size-10 items-center justify-center rounded-xl flex-shrink-0"
          style={{ backgroundColor: palette.border }}
        >
          <span className="text-xl">{card.icon || "⚡"}</span>
        </div>
        <div className="flex flex-col overflow-hidden text-left">
          <div className="flex flex-row items-center gap-1.5">
            <span style={{ color: palette.primary }} className="text-sm font-bold whitespace-nowrap overflow-hidden text-ellipsis">
              {card.type === "highlighted_text" ? (
                <TextHighlighter color={palette.glow}>{card.text}</TextHighlighter>
              ) : (
                card.text
              )}
            </span>
            <span style={{ color: palette.secondary }} className="text-[10px] opacity-70">· сейчас</span>
          </div>
          <p style={{ color: palette.secondary }} className="text-xs mt-0.5 leading-relaxed opacity-85 line-clamp-2">
            {card.desc || card.text || "Изменение успешно примененно."}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden">
      {/* Background ambient animations */}
      {(sceneTemplate === "meteors" || sceneData?.background_effect === "meteors") && <Meteors number={30} />}
      {(sceneTemplate === "confetti" || sceneData?.background_effect === "confetti") && <Confetti />}

      {/* 1. Neon Glowing SVG arrows and relation lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={lottieStyle.glowIntensity.replace("px", "")} result="blur" />
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

          const fromX = `${fromEnt.x}%`;
          const fromY = `${fromEnt.y}%`;
          const toX = `${toEnt.x}%`;
          const toY = `${toEnt.y}%`;

          // Generate dynamic SVG coordinate path
          // Draw curved SVG bezier path for organic look
          const fx = (fromEnt.x / 100) * 100;
          const fy = (fromEnt.y / 100) * 100;
          const tx = (toEnt.x / 100) * 100;
          const ty = (toEnt.y / 100) * 100;
          
          const controlY = fy + (ty - fy) * 0.4;
          const pathD = `M ${fx}% ${fy}% C ${fx}% ${controlY}%, ${tx}% ${controlY}%, ${tx}% ${ty}%`;

          // Fade-in connection lines progressively
          const delay = rel.animation?.delay || 0.5;
          const isFadedIn = sceneTime >= delay;
          if (!isFadedIn) return null;

          return (
            <g key={`rel-line-${idx}`}>
              <path
                d={pathD}
                fill="none"
                stroke={palette.glow}
                strokeWidth={lottieStyle.lineThickness + 3}
                filter="url(#neon-glow)"
                className="transition-all duration-700 opacity-60"
              />
              <path
                d={pathD}
                fill="none"
                stroke={palette.primary}
                strokeWidth={lottieStyle.lineThickness}
                className="transition-all duration-700"
              />
            </g>
          );
        })}
      </svg>

      {/* 2. Top Title Headline */}
      {headline && (
        <div
          style={{
            left: `${headline.x}%`,
            top: `${headline.y}%`,
            transform: "translate(-50%, -50%)",
            fontFamily: vibeConfig.global.fontFamily,
          }}
          className="absolute w-[90%] text-center pointer-events-none z-20"
        >
          <h1
            style={{
              color: palette.primary,
              textShadow: `0 0 12px ${palette.glow}`,
            }}
            className="text-2xl md:text-3xl font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 animate-pulse"
          >
            {headline.animation_style === "aurora" || /aurora/i.test(headline.text) ? (
              <AuroraText>{headline.text}</AuroraText>
            ) : headline.animation_style === "typing" || /typing/i.test(headline.text) ? (
              <TypingAnimation text={headline.text} />
            ) : headline.animation_style === "hyper" || /hyper/i.test(headline.text) ? (
              <HyperText text={headline.text} />
            ) : headline.animation_style === "sparkles" || /spark/i.test(headline.text) ? (
              <SparklesText>{headline.text}</SparklesText>
            ) : headline.animation_style === "word_rotate" ? (
              <WordRotate words={headline.words || [headline.text]} />
            ) : (
              headline.text
            )}
          </h1>
        </div>
      )}

      {/* 3. Cards Content Container */}
      <div className="absolute inset-0 pointer-events-none">
        {sceneTemplate === "feature_grid" ? (
          <div
            style={{
              left: "50%",
              top: "54%",
              transform: "translate(-50%, -46%)",
            }}
            className="absolute w-[86%] h-[56%] pointer-events-auto"
          >
            <BentoGrid>
              {contentCards.map((card: any, idx: number) => (
                <BentoCard
                  key={`bento-card-${idx}`}
                  title={card.text || "Фича"}
                  desc={card.desc || "Описание характеристики и преимуществ системы монтажа"}
                  icon={card.icon || "⚡"}
                />
              ))}
            </BentoGrid>
          </div>
        ) : sceneTemplate === "safari" || sceneTemplate === "iphone" ? (
          <div
            style={{
              left: "50%",
              top: "56%",
              transform: "translate(-50%, -44%)",
              width: sceneTemplate === "iphone" ? "290px" : "85%",
              height: sceneTemplate === "iphone" ? "530px" : "55%",
            }}
            className="absolute pointer-events-auto z-10"
          >
            <BlurFade delay={0.1}>
              {sceneTemplate === "iphone" ? (
                <IPhoneMock>
                  <div className="flex flex-col gap-3 h-full overflow-y-auto">
                    {contentCards.map((card: any, idx: number) => (
                      <BlurFade key={`iphone-item-${idx}`} delay={idx * 0.1}>
                        {renderSimpleCard(card)}
                      </BlurFade>
                    ))}
                  </div>
                </IPhoneMock>
              ) : (
                <SafariMock>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-y-auto">
                    {contentCards.map((card: any, idx: number) => (
                      <BlurFade key={`safari-item-${idx}`} delay={idx * 0.1}>
                        {renderSimpleCard(card)}
                      </BlurFade>
                    ))}
                  </div>
                </SafariMock>
              )}
            </BlurFade>
          </div>
        ) : (
          contentCards.map((card: any, idx: number) => {
            const delay = card.animation?.delay || 0.25;
            const sceneActiveTime = sceneTime - delay;
            
            const renderCardContent = () => {
              const inner = renderSimpleCard(card);
              if (card.type === "safari") {
                return <SafariMock>{inner}</SafariMock>;
              }
              if (card.type === "iphone") {
                return <IPhoneMock>{inner}</IPhoneMock>;
              }
              return inner;
            };

            return (
              <div
                key={`content-card-${idx}`}
                style={{
                  left: `${card.x}%`,
                  top: `${card.y}%`,
                  width: `${card.width || 32}%`,
                  height: `${card.height || 14}%`,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "auto",
                }}
                className="absolute z-10"
              >
                <AnimatedList activeTime={sceneActiveTime} delay={0.25}>
                  <BlurFade delay={idx * 0.1}>
                    {renderCardContent()}
                  </BlurFade>
                </AnimatedList>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Pulse Indicators at Connection Points */}
      {relations.map((rel: any, idx: number) => {
        const toEnt = entities.find((e: any) => e.id === rel.to);
        if (!toEnt) return null;
        const delay = rel.animation?.delay || 0.5;
        const isFadedIn = sceneTime >= delay;
        if (!isFadedIn) return null;

        return (
          <div
            key={`lottie-pulse-${idx}`}
            style={{
              left: `${toEnt.x}%`,
              top: `${toEnt.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute pointer-events-none w-[60px] h-[60px] flex items-center justify-center"
          >
            <div 
              style={{ borderColor: palette.glow }} 
              className="absolute w-4 h-4 rounded-full border-2 animate-ping" 
            />
            <div 
              style={{ backgroundColor: palette.primary, boxShadow: `0 0 12px ${palette.glow}` }} 
              className="w-2.5 h-2.5 rounded-full" 
            />
          </div>
        );
      })}
    </div>
  );
}
