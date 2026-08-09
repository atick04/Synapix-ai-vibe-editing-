'use client';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface TrueFocusProps {
  sentence?: string;
  text?: string;
  blurAmount?: number;
  borderColor?: string;
  glowColor?: string;
  fontSize?: number;
}

export const TrueFocus: React.FC<TrueFocusProps> = ({
  sentence = 'TRUE FOCUS TEXT',
  text,
  blurAmount = 6,
  borderColor = '#FACC15',
  glowColor = 'rgba(250, 204, 21, 0.4)',
  fontSize = 64,
}) => {
  const targetText = text || sentence;
  const words = targetText.split(' ');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (words.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [words.length]);

  return (
    <div className="relative flex flex-wrap items-center justify-center gap-3 text-center select-none">
      {words.map((word, index) => {
        const isFocused = index === currentIndex;
        return (
          <span
            key={index}
            className="relative px-3 py-1 transition-all duration-300 rounded-md"
            style={{
              filter: isFocused ? 'blur(0px)' : `blur(${blurAmount}px)`,
              opacity: isFocused ? 1 : 0.35,
              fontSize: `${fontSize}px`,
              fontWeight: 900,
              color: isFocused ? '#FFFFFF' : '#A1A1AA',
              fontFamily: 'Montserrat, Inter, sans-serif',
            }}
          >
            {word}
            {isFocused && (
              <motion.span
                layoutId="focus-box"
                className="absolute inset-0 rounded-lg border-2 pointer-events-none"
                style={{
                  borderColor,
                  boxShadow: `0 0 25px ${glowColor}`,
                }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
};
