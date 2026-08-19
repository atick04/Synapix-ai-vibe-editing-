'use client';
import React from 'react';
import { BlurText, ShinyText, DecryptedText, TrueFocus, GlitchText, GradientText, CountUp, EchoText } from './reactbits';

interface ReactBitsPlayerProps {
  preset: string;
  props?: Record<string, any>;
  currentTime: number;
  start: number;
  end: number;
}

export const ReactBitsPlayer: React.FC<ReactBitsPlayerProps> = ({
  preset,
  props = {},
  currentTime,
  start,
  end,
}) => {
  if (currentTime < start || currentTime >= end) return null;

  const text = (props.text || props.title || props.phrase || "").trim();
  // Never show the old placeholder "VIBE EDIT AI" — empty presets are a no-op
  if (!text) return null;

  const color = props.color || props.font_color || '#FFFFFF';
  const fontSize = props.font_size || props.fontSize || 64;

  let componentToRender = null;

  switch (preset.toLowerCase()) {
    case 'blur':
    case 'blurtext':
    case 'blur_text':
      componentToRender = (
        <BlurText
          text={text}
          color={color}
          fontSize={fontSize}
          animateBy={props.animateBy || 'words'}
          direction={props.direction || 'top'}
          delay={props.delay || 120}
        />
      );
      break;

    case 'shiny':
    case 'shinytext':
    case 'shiny_text':
      componentToRender = (
        <ShinyText
          text={text}
          color={color}
          fontSize={fontSize}
          speed={props.speed || 4}
        />
      );
      break;

    case 'decrypted':
    case 'decryptedtext':
    case 'decrypted_text':
      componentToRender = (
        <DecryptedText
          text={text}
          color={color || '#00E5FF'}
          fontSize={fontSize}
          speed={props.speed || 40}
        />
      );
      break;

    case 'truefocus':
    case 'true_focus':
      componentToRender = (
        <TrueFocus
          text={text}
          borderColor={props.borderColor || '#FACC15'}
          glowColor={props.glowColor || 'rgba(250, 204, 21, 0.4)'}
          fontSize={fontSize}
        />
      );
      break;

    case 'glitch':
    case 'glitchtext':
    case 'glitch_text':
      componentToRender = (
        <GlitchText
          text={text}
          color={color || '#FF0055'}
          fontSize={fontSize}
        />
      );
      break;

    case 'gradient':
    case 'gradienttext':
    case 'gradient_text':
      componentToRender = (
        <GradientText
          text={text}
          fontSize={fontSize}
        />
      );
      break;

    case 'countup':
    case 'count_up':
      componentToRender = (
        <CountUp
          to={parseInt(text.replace(/\D/g, ''), 10) || 100}
          color={color || '#FACC15'}
          fontSize={fontSize || 90}
          suffix={props.suffix || '+'}
        />
      );
      break;

    case 'echo':
    case 'echotext':
    case 'echo_text':
      componentToRender = (
        <EchoText
          text={text}
          color={color || '#A855F7'}
          fontSize={fontSize}
        />
      );
      break;


    default:
      componentToRender = (
        <BlurText
          text={text}
          color={color}
          fontSize={fontSize}
        />
      );
  }

  return (
    <div className="absolute inset-0 z-[150] flex items-center justify-center pointer-events-none select-none overflow-hidden p-6">
      {componentToRender}
    </div>
  );
};
