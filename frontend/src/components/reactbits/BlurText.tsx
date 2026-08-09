'use client';
import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface BlurTextProps {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  direction?: 'top' | 'bottom';
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  onAnimationComplete?: () => void;
}

export const BlurText: React.FC<BlurTextProps> = ({
  text = '',
  delay = 120,
  className = '',
  animateBy = 'words',
  direction = 'top',
  color = '#FFFFFF',
  fontSize = 72,
  fontWeight = 800,
  onAnimationComplete,
}) => {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  const [inView] = useState(true);

  const defaultFrom =
    direction === 'top'
      ? { filter: 'blur(12px)', opacity: 0, transform: 'translate3d(0,-40px,0)' }
      : { filter: 'blur(12px)', opacity: 0, transform: 'translate3d(0,40px,0)' };

  const defaultTo = [
    {
      filter: 'blur(4px)',
      opacity: 0.6,
      transform: direction === 'top' ? 'translate3d(0,8px,0)' : 'translate3d(0,-8px,0)',
    },
    { filter: 'blur(0px)', opacity: 1, transform: 'translate3d(0,0,0)' },
  ];

  return (
    <p
      className={`flex flex-wrap items-center justify-center text-center select-none ${className}`}
      style={{
        color,
        fontSize: `${fontSize}px`,
        fontWeight,
        lineHeight: 1.15,
        fontFamily: 'Montserrat, Inter, sans-serif',
        textShadow: '0 4px 20px rgba(0,0,0,0.6)',
      }}
    >
      {elements.map((element, index) => (
        <motion.span
          key={index}
          initial={defaultFrom}
          animate={inView ? (defaultTo as any) : defaultFrom}

          transition={{
            duration: 0.45,
            delay: (index * delay) / 1000,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          onAnimationComplete={index === elements.length - 1 ? onAnimationComplete : undefined}
          style={{
            display: 'inline-block',
            willChange: 'transform, filter, opacity',
            marginRight: animateBy === 'words' ? '0.25em' : '0.04em',
          }}
        >
          {element === ' ' ? '\u00A0' : element}
        </motion.span>
      ))}
    </p>
  );
};
